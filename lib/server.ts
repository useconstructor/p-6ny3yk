import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "./db";
import type { Transaction, Row } from "@libsql/client";
const COOKIE = "monterey_session";
const emptyDraft = { lines: [], pickup: { name: "", time: "", notes: "" } };
// Parsed JSON is validated field by field before any database mutation.
type RequestBody = {
  [key: string]: unknown;
  draft: { lines: unknown; pickup: Record<string, unknown> };
  revision: number;
  lines: unknown;
  pickup: Record<string, unknown>;
  key: string;
  quote: string;
  draftRevision: number;
  clear: boolean;
  status: string;
  version: number;
  name: string;
  description: string;
  price: string;
  categoryId: string;
  active: boolean;
};
class Problem extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "INVALID",
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
function fail(message: string, fields?: Record<string, string>): never {
  throw new Problem(400, message, "VALIDATION", fields ? { fields } : {});
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const secret = () => {
  if (!process.env.JWT_SECRET) throw new Error("Missing signing configuration");
  return process.env.JWT_SECRET;
};
function sign(data: unknown) {
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  return (
    body + "." + createHmac("sha256", secret()).update(body).digest("base64url")
  );
}
function unquote(token: unknown, owner: string) {
  if (typeof token !== "string" || token.length > 40000)
    fail("La revisión no es válida.");
  const [body, sig, ...rest] = token.split(".");
  const expected = createHmac("sha256", secret())
    .update(body || "")
    .digest("base64url");
  if (
    rest.length ||
    !sig ||
    sig.length !== expected.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  )
    fail("La revisión no es válida.");
  let data;
  try {
    data = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    fail("La revisión no es válida.");
  }
  if (data.owner !== owner)
    throw new Problem(404, "No encontramos este recurso.", "NOT_FOUND");
  return data;
}
function exact(body: Record<string, unknown>, keys: string[]) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    fail("Datos inválidos.");
  if (Object.keys(body).some((k) => !keys.includes(k)))
    fail("Hay campos no permitidos.");
}
function integer(v: unknown, label: string, min = 1): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min)
    fail(
      `${label === "quantity" ? "La cantidad" : "La revisión"} debe ser un entero válido.`,
      {
        [label]: `${label === "quantity" ? "La cantidad" : "La revisión"} debe ser un entero válido.`,
      },
    );
  return v;
}
function text(v: unknown, label: string, min: number, max: number) {
  if (typeof v !== "string" || v.trim().length < min || v.trim().length > max)
    fail(
      `${label === "name" ? "Nombre" : "Descripción"}: escribe entre ${min} y ${max} caracteres.`,
      {
        [label]: `Escribe entre ${min} y ${max} caracteres.`,
      },
    );
  return v.trim();
}
function pickup(v: Record<string, unknown>, validate = true) {
  if (!v) fail("Faltan los datos de recogida.");
  exact(v, ["name", "time", "notes"]);
  const fields: Record<string, string> = {};
  if (
    typeof v.name !== "string" ||
    (validate && (v.name.trim().length < 2 || v.name.trim().length > 80)) ||
    v.name.length > 200
  )
    fields.name = "Escribe un nombre de entre 2 y 80 caracteres.";
  if (
    typeof v.time !== "string" ||
    (validate && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time)) ||
    v.time.length > 20
  )
    fields.time = "Indica un horario válido en formato HH:mm.";
  if (typeof v.notes !== "string" || v.notes.length > 500)
    fields.notes = "Escribe como máximo 500 caracteres.";
  if (Object.keys(fields).length)
    throw new Problem(400, "Revisa los datos de recogida.", "VALIDATION", {
      fields,
    });
  return {
    name: validate ? (v.name as string).trim() : v.name,
    time: v.time,
    notes: v.notes,
  };
}
function lines(v: unknown, empty = false) {
  if (!Array.isArray(v) || (!empty && !v.length))
    fail("Añade al menos un producto.", {
      lines: "Añade al menos un producto.",
    });
  const seen = new Set();
  return v.map((l) => {
    exact(l, ["productId", "quantity", "revision"]);
    if (typeof l.productId !== "string" || seen.has(l.productId))
      fail("La selección contiene referencias inválidas.");
    seen.add(l.productId);
    return {
      productId: l.productId,
      quantity: integer(l.quantity, "quantity"),
      revision: integer(l.revision, "revision"),
    };
  });
}
const product = (r: Row) => ({
  id: r.id,
  categoryId: r.category_id,
  name: r.name,
  description: r.description,
  priceCents: Number(r.price_cents),
  active: !!r.active,
  revision: Number(r.revision),
  illustration: r.illustration,
});
async function order(tx: Transaction | typeof db, id: string, owner: string) {
  const r = (
    await tx.execute({
      sql: "SELECT * FROM pedidos WHERE id=? AND session_id=?",
      args: [id, owner],
    })
  ).rows[0];
  if (!r) throw new Problem(404, "No encontramos este recurso.", "NOT_FOUND");
  const ls = (
    await tx.execute({
      sql: "SELECT * FROM lineas_pedido WHERE order_id=? ORDER BY rowid",
      args: [id],
    })
  ).rows;
  return {
    id: r.id,
    folio: r.folio,
    status: r.status,
    version: Number(r.version),
    totalCents: Number(r.total_cents),
    createdAt: r.created_at,
    pickup: JSON.parse(String(r.pickup)),
    lines: ls.map((l) => ({
      productId: l.product_id,
      name: l.name,
      quantity: Number(l.quantity),
      priceCents: Number(l.price_cents),
      illustration: l.illustration,
    })),
  };
}
async function transaction<T>(fn: (tx: Transaction) => Promise<T>) {
  const tx = await db.transaction("write");
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }
}
async function authorized(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token)
    throw new Problem(
      401,
      "Necesitamos una cookie de sesión para guardar tu demostración.",
      "SESSION",
    );
  const s = (
    await db.execute({
      sql: "SELECT * FROM sesiones WHERE token_hash=?",
      args: [hash(token)],
    })
  ).rows[0];
  if (!s)
    throw new Problem(
      401,
      "No pudimos recuperar tu sesión. Reintentar.",
      "SESSION",
    );
  return s;
}
function origin(req: NextRequest) {
  const allowed = [
    process.env.APP_ORIGIN,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ]
    .filter(Boolean)
    .map((v) => new URL(v!).origin);
  if (
    !req.headers.get("origin") ||
    !allowed.includes(req.headers.get("origin")!)
  )
    throw new Problem(403, "Origen de solicitud no permitido.", "ORIGIN");
}
async function init(req: NextRequest) {
  try {
    const s = await authorized(req);
    return NextResponse.json({ ready: true, sessionId: s.id });
  } catch (e) {
    if (!(e instanceof Problem) || e.status !== 401) throw e;
  }
  const token = randomBytes(32).toString("base64url"),
    id = randomUUID();
  await transaction(async (tx) => {
    await tx.execute({
      sql: "INSERT INTO sesiones(id,token_hash,created_at) VALUES(?,?,?)",
      args: [id, hash(token), new Date().toISOString()],
    });
    const tacos = randomUUID(),
      drinks = randomUUID();
    for (const [cid, name] of [
      [tacos, "Tacos"],
      [drinks, "Bebidas"],
    ])
      await tx.execute({
        sql: "INSERT INTO categorias(id,session_id,name) VALUES(?,?,?)",
        args: [cid, id, name],
      });
    const seeds = [
      ["Taco de pastor", 2200, "pastor"],
      ["Taco de asada", 2800, "asada"],
      ["Taco de pollo", 2400, "pollo"],
      ["Taco de champiñones", 2400, "champinones"],
      ["Taco de papa", 2000, "papa"],
      ["Taco de frijoles", 2000, "frijoles"],
      ["Agua de jamaica", 2500, "jamaica"],
      ["Agua de horchata", 2500, "horchata"],
    ];
    for (const [i, s] of seeds.entries())
      await tx.execute({
        sql: "INSERT INTO productos(id,session_id,category_id,name,description,price_cents,illustration) VALUES(?,?,?,?,?,?,?)",
        args: [
          randomUUID(),
          id,
          i < 6 ? tacos : drinks,
          s[0],
          "",
          s[1],
          `/products/${s[2]}-v1.svg`,
        ],
      });
    await tx.execute({
      sql: "UPDATE sesiones SET initialized=1 WHERE id=?",
      args: [id],
    });
  });
  const res = NextResponse.json({ ready: true, sessionId: id });
  const secure = new URL(process.env.APP_ORIGIN!).protocol === "https:";
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    partitioned: secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
async function priceLines(
  tx: Transaction | typeof db,
  owner: string,
  input: ReturnType<typeof lines>,
) {
  let totalCents = 0;
  const snapshots = [];
  for (const l of input) {
    const p = (
      await tx.execute({
        sql: "SELECT * FROM productos WHERE id=? AND session_id=?",
        args: [l.productId, owner],
      })
    ).rows[0];
    if (!p)
      fail("El producto seleccionado no existe.", {
        lines: "El producto seleccionado no existe.",
      });
    if (!p.active || Number(p.revision) !== l.revision)
      throw new Problem(
        409,
        "El producto cambió. Revisa los valores actuales antes de continuar.",
        "PRODUCT_CONFLICT",
        { current: product(p), previousRevision: l.revision },
      );
    const subtotal = Number(p.price_cents) * l.quantity;
    if (
      !Number.isSafeInteger(subtotal) ||
      !Number.isSafeInteger(totalCents + subtotal)
    )
      fail("La cantidad excede el límite numérico seguro.", {
        quantity: "La cantidad excede el límite numérico seguro.",
      });
    totalCents += subtotal;
    snapshots.push({
      productId: p.id,
      name: p.name,
      quantity: l.quantity,
      priceCents: Number(p.price_cents),
      illustration: p.illustration,
    });
  }
  return { lines: snapshots, totalCents };
}
export async function handle(req: NextRequest, path: string[]) {
  try {
    await schema();
    if (req.method === "POST") origin(req);
    const route = path.join("/");
    if (route === "session" && req.method === "POST") return await init(req);
    const s = await authorized(req),
      owner = String(s.id);
    let body = {} as RequestBody;
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        fail("El cuerpo debe ser JSON válido.");
      }
      if (!body || Array.isArray(body) || typeof body !== "object")
        fail("Datos inválidos.");
    }
    let result: unknown;
    if (route === "session" && req.method === "GET")
      result = { ready: true, sessionId: owner };
    else if (route === "catalog" && req.method === "GET") {
      const ps = await db.execute({
        sql: "SELECT * FROM productos WHERE session_id=? ORDER BY rowid",
        args: [owner],
      });
      const cs = await db.execute({
        sql: "SELECT id,name FROM categorias WHERE session_id=? ORDER BY rowid",
        args: [owner],
      });
      result = { products: ps.rows.map(product), categories: cs.rows };
    } else if (route === "draft" && req.method === "GET") {
      const draft = JSON.parse(String(s.draft));
      const ownedProducts = await db.execute({
        sql: "SELECT * FROM productos WHERE session_id=? ORDER BY rowid",
        args: [owner],
      });
      result = {
        draft,
        products: ownedProducts.rows.map(product).filter(p =>
          draft.lines.some((line: { productId: string }) => line.productId === p.id)),
        revision: Number(s.revision),
        attempt: s.attempt ? JSON.parse(String(s.attempt)) : null,
      };
    } else if (route === "draft" && req.method === "POST") {
      exact(body, ["draft", "revision"]);
      integer(body.revision, "revision", 0);
      exact(body.draft, ["lines", "pickup"]);
      const draft = {
        lines: lines(body.draft.lines, true),
        pickup: pickup(body.draft.pickup, false),
      };
      await priceLines(db, owner, draft.lines);
      result = await transaction(async (tx) => {
        const current = (
          await tx.execute({
            sql: "SELECT draft,revision FROM sesiones WHERE id=?",
            args: [owner],
          })
        ).rows[0];
        if (Number(current.revision) !== body.revision)
          throw new Problem(
            409,
            "El borrador cambió en otra vista. Compara antes de conservar tus cambios.",
            "DRAFT_CONFLICT",
            {
              current: {
                draft: JSON.parse(String(current.draft)),
                revision: Number(current.revision),
              },
            },
          );
        await tx.execute({
          sql: "UPDATE sesiones SET draft=?,revision=revision+1 WHERE id=?",
          args: [JSON.stringify(draft), owner],
        });
        return { draft, revision: body.revision + 1 };
      });
    } else if (route === "quote" && req.method === "POST") {
      exact(body, ["lines", "pickup"]);
      const input = lines(body.lines),
        pick = pickup(body.pickup);
      const totals = await priceLines(db, owner, input);
      const quote = sign({
        owner,
        input,
        pickup: pick,
        ...totals,
        expires: Date.now() + 30 * 60 * 1000,
      });
      result = { quote, ...totals, pickup: pick };
    } else if (route === "attempt" && req.method === "POST") {
      exact(body, ["key", "quote", "draftRevision", "clear"]);
      if (typeof body.key !== "string" || !/^[a-f\d-]{36}$/i.test(body.key))
        fail("La referencia del intento no es válida.");
      result = await transaction(async (tx) => {
        const session = (
          await tx.execute({
            sql: "SELECT attempt FROM sesiones WHERE id=?",
            args: [owner],
          })
        ).rows[0];
        const existing = session.attempt
          ? JSON.parse(String(session.attempt))
          : null;
        if (body.clear) {
          if (existing?.key === body.key)
            await tx.execute({
              sql: "UPDATE sesiones SET attempt=NULL WHERE id=?",
              args: [owner],
            });
          return { cleared: true };
        }
        unquote(body.quote, owner);
        integer(body.draftRevision, "draftRevision", 0);
        if (
          existing &&
          JSON.stringify(existing) !==
            JSON.stringify({
              key: body.key,
              quote: body.quote,
              draftRevision: body.draftRevision,
            })
        )
          throw new Problem(
            409,
            "Recupera el pedido anterior antes de iniciar otro.",
            "ATTEMPT_CONFLICT",
            { current: existing },
          );
        await tx.execute({
          sql: "UPDATE sesiones SET attempt=? WHERE id=?",
          args: [
            JSON.stringify({
              key: body.key,
              quote: body.quote,
              draftRevision: body.draftRevision,
            }),
            owner,
          ],
        });
        return { retained: true };
      });
    } else if (route === "orders" && req.method === "POST") {
      exact(body, ["key", "quote", "draftRevision"]);
      if (typeof body.key !== "string" || !/^[a-f\d-]{36}$/i.test(body.key))
        fail("La referencia del intento no es válida.");
      integer(body.draftRevision, "draftRevision", 0);
      const q = unquote(body.quote, owner),
        payloadHash = hash(JSON.stringify(body));
      result = await transaction(async (tx) => {
        const old = (
          await tx.execute({
            sql: "SELECT id,payload_hash FROM pedidos WHERE session_id=? AND operation_key=?",
            args: [owner, body.key],
          })
        ).rows[0];
        if (old) {
          if (old.payload_hash !== payloadHash)
            throw new Problem(
              409,
              "Este intento contiene otros datos. Recupera el pedido original.",
              "IDEMPOTENCY",
            );
          return { order: await order(tx, String(old.id), owner) };
        }
        const session = (
          await tx.execute({
            sql: "SELECT attempt FROM sesiones WHERE id=?",
            args: [owner],
          })
        ).rows[0];
        const retained = session.attempt
          ? JSON.parse(String(session.attempt))
          : null;
        if (
          retained &&
          (retained.key !== body.key ||
            retained.quote !== body.quote ||
            retained.draftRevision !== body.draftRevision)
        ) {
          throw new Problem(
            409,
            "Recupera la selección enviada desde otra vista antes de guardar otro pedido.",
            "ATTEMPT_CONFLICT",
            { current: retained },
          );
        }
        if (q.expires < Date.now())
          throw new Problem(
            409,
            "La revisión caducó. Revisa de nuevo tu pedido.",
            "QUOTE_EXPIRED",
          );
        const totals = await priceLines(tx, owner, q.input);
        const id = randomUUID(),
          folio = "TM" + randomBytes(4).toString("hex").toUpperCase();
        await tx.execute({
          sql: "INSERT INTO pedidos(id,session_id,folio,total_cents,created_at,pickup,operation_key,payload_hash) VALUES(?,?,?,?,?,?,?,?)",
          args: [
            id,
            owner,
            folio,
            totals.totalCents,
            new Date().toISOString(),
            JSON.stringify(q.pickup),
            body.key,
            payloadHash,
          ],
        });
        for (const l of totals.lines)
          await tx.execute({
            sql: "INSERT INTO lineas_pedido(id,order_id,product_id,name,quantity,price_cents,illustration) VALUES(?,?,?,?,?,?,?)",
            args: [
              randomUUID(),
              id,
              l.productId,
              l.name,
              l.quantity,
              l.priceCents,
              l.illustration,
            ],
          });
        await tx.execute({
          sql: "UPDATE sesiones SET draft=?,revision=revision+1 WHERE id=? AND revision=?",
          args: [JSON.stringify(emptyDraft), owner, body.draftRevision],
        });
        await tx.execute({
          sql: "UPDATE sesiones SET attempt=? WHERE id=?",
          args: [JSON.stringify(body), owner],
        });
        return { order: await order(tx, id, owner) };
      });
    } else if (route === "orders" && req.method === "GET") {
      const os = (
        await db.execute({
          sql: "SELECT id FROM pedidos WHERE session_id=? ORDER BY created_at DESC",
          args: [owner],
        })
      ).rows;
      result = {
        orders: await Promise.all(
          os.map((o) => order(db, String(o.id), owner)),
        ),
      };
    } else if (route === "recover" && req.method === "GET") {
      const o = (
        await db.execute({
          sql: "SELECT id FROM pedidos WHERE session_id=? AND operation_key=?",
          args: [owner, req.nextUrl.searchParams.get("key") || ""],
        })
      ).rows[0];
      result = { order: o ? await order(db, String(o.id), owner) : null };
    } else if (path[0] === "orders" && path.length === 2) {
      if (req.method === "GET")
        result = { order: await order(db, path[1], owner) };
      else {
        exact(body, ["status", "version"]);
        integer(body.version, "version");
        if (!["preparando", "listo", "cancelado"].includes(body.status))
          fail("El estado solicitado no es válido.");
        result = await transaction(async (tx) => {
          const current = await order(tx, path[1], owner);
          if (
            current.version !== body.version ||
            !(
              (current.status === "pendiente" &&
                ["preparando", "cancelado"].includes(body.status)) ||
              (current.status === "preparando" && body.status === "listo")
            )
          )
            throw new Problem(
              409,
              "El pedido cambió. Consulta su estado actual.",
              "ORDER_CONFLICT",
              { current },
            );
          await tx.execute({
            sql: "UPDATE pedidos SET status=?,version=version+1 WHERE id=? AND session_id=? AND version=?",
            args: [body.status, path[1], owner, body.version],
          });
          return { order: await order(tx, path[1], owner) };
        });
      }
    } else if (
      path[0] === "products" &&
      req.method === "POST" &&
      path.length <= 2
    ) {
      const edit = path.length === 2;
      exact(
        body,
        edit
          ? ["name", "description", "categoryId", "price", "active", "revision"]
          : ["name", "description", "categoryId", "price"],
      );
      const name = text(body.name, "name", 2, 80),
        description = text(body.description, "description", 0, 500);
      if (
        typeof body.price !== "string" ||
        !/^\d+(\.\d{1,2})?$/.test(body.price)
      )
        fail("Escribe un precio positivo con hasta dos decimales.", {
          price: "Escribe un precio positivo con hasta dos decimales.",
        });
      const [whole, fraction = ""] = body.price.split(".");
      const exactCents =
        BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
      if (
        exactCents > BigInt(Number.MAX_SAFE_INTEGER) ||
        exactCents <= BigInt(0)
      )
        fail("El precio debe ser positivo y seguro.", {
          price: "El precio debe ser positivo y seguro.",
        });
      const priceCents = Number(exactCents);
      if (typeof body.categoryId !== "string")
        fail("Elige una categoría válida.");
      const c = (
        await db.execute({
          sql: "SELECT id FROM categorias WHERE id=? AND session_id=?",
          args: [body.categoryId, owner],
        })
      ).rows[0];
      if (!c)
        fail("Elige una categoría válida.", {
          categoryId: "Elige una categoría válida.",
        });
      if (edit) {
        integer(body.revision, "revision");
        if (typeof body.active !== "boolean")
          fail("Indica si el producto está activo.");
      }
      result = await transaction(async (tx) => {
        const id = edit ? path[1] : randomUUID();
        if (edit) {
          const current = (
            await tx.execute({
              sql: "SELECT * FROM productos WHERE id=? AND session_id=?",
              args: [id, owner],
            })
          ).rows[0];
          if (!current)
            throw new Problem(404, "No encontramos este recurso.", "NOT_FOUND");
          if (Number(current.revision) !== body.revision)
            throw new Problem(
              409,
              "El producto cambió. Compara antes de guardar.",
              "PRODUCT_CONFLICT",
              { current: product(current) },
            );
          await tx.execute({
            sql: "UPDATE productos SET name=?,description=?,category_id=?,price_cents=?,active=?,revision=revision+1 WHERE id=? AND session_id=?",
            args: [
              name,
              description,
              body.categoryId,
              priceCents,
              body.active ? 1 : 0,
              id,
              owner,
            ],
          });
        } else
          await tx.execute({
            sql: "INSERT INTO productos(id,session_id,category_id,name,description,price_cents) VALUES(?,?,?,?,?,?)",
            args: [id, owner, body.categoryId, name, description, priceCents],
          });
        return {
          product: product(
            (
              await tx.execute({
                sql: "SELECT * FROM productos WHERE id=? AND session_id=?",
                args: [id, owner],
              })
            ).rows[0],
          ),
        };
      });
    } else throw new Problem(404, "No encontramos este recurso.", "NOT_FOUND");
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof Problem)
      return NextResponse.json(
        { error: e.message, code: e.code, ...e.extra },
        { status: e.status, headers: { "Cache-Control": "no-store" } },
      );
    console.error(
      "Application request failed",
      e instanceof Error ? e.message : "Unknown error",
    );
    return NextResponse.json(
      {
        error:
          "No pudimos consultar el servidor. Conserva tus datos e inténtalo de nuevo.",
        code: "SERVER",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
