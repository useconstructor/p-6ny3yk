"use client";
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import branding from "@/branding.json";
import {
  Search,
  Plus,
  Minus,
  ArrowRight,
  ArrowLeft,
  ShoppingBag,
  Trash2,
  Check,
  Hourglass,
  RotateCcw,
  Utensils,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  api,
  initialize,
  ApiError,
  money,
  newDraft,
  Illustration,
  ErrorBox,
  HistoricalLines,
  PickupDetails,
  type Product,
  type Category,
  type Draft,
  type Quote,
  type Order,
  type Attempt,
} from "./shared";
const validQty = (s: string) =>
  /^\d+$/.test(s) && Number.isSafeInteger(Number(s)) && Number(s) > 0;
type Conflict =
  | { code: "DRAFT_CONFLICT"; error: string; current: { draft: Draft; revision: number } }
  | { code: "PRODUCT_CONFLICT"; error: string; current: Product };
function attemptQuote(value: Attempt): Quote {
  const data = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(
        atob(value.quote.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")),
        (character) => character.charCodeAt(0),
      ),
    ),
  );
  return {
    quote: value.quote,
    lines: data.lines,
    pickup: data.pickup,
    totalCents: data.totalCents,
  };
}
function Quantity({
  name,
  value,
  onChange,
  error,
  inputId,
}: {
  name: string;
  value: string;
  onChange: (s: string) => void;
  error?: string;
  inputId?: string;
}) {
  return (
    <div className="quantity">
      <button
        type="button"
        aria-label={`Reducir cantidad de ${name}`}
        disabled={!validQty(value) || Number(value) <= 1}
        onClick={() => onChange(String(Number(value) - 1))}
      >
        <Minus size={16} />
      </button>
      <input
        id={inputId}
        aria-label={`Cantidad de ${name}`}
        aria-invalid={!!error}
        aria-describedby={error && inputId ? `${inputId}-error` : undefined}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        aria-label={`Aumentar cantidad de ${name}`}
        disabled={!validQty(value) || !Number.isSafeInteger(Number(value) + 1)}
        onClick={() => onChange(String(Number(value) + 1))}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
function ProductCard({
  p,
  categoryName,
  onAdd,
  selectionUnavailable,
}: {
  p: Product;
  categoryName: string;
  onAdd: (p: Product, n: number) => boolean;
  selectionUnavailable: boolean;
}) {
  const [q, setQ] = useState("1"),
    [error, setError] = useState("");
  return (
    <article className="product-card" data-product-id={p.id}>
      <Illustration src={p.illustration} name={p.name} />
      <div className="product-copy">
        <div className="product-name-price">
          <h3>{p.name}</h3>
          <strong>{money(p.priceCents)} <small>MXN</small></strong>
        </div>
        <p className="category-label">
          {categoryName}
        </p>
        {p.description && (
          <p className="product-description">{p.description}</p>
        )}
        <div className="product-actions">
          <Quantity
            name={p.name}
            value={q}
            error={error}
            inputId={`catalog-quantity-${p.id}`}
            onChange={(v) => {
              setQ(v);
              setError("");
            }}
          />
          <button
            className="add-button"
            disabled={selectionUnavailable}
            onClick={() => {
              if (!validQty(q)) {
                setError("Escribe una cantidad entera positiva.");
                return;
              }
              if (onAdd(p, Number(q))) setError("");
              else setError("La cantidad excede el límite numérico seguro.");
            }}
          >
            <Plus size={16} />
            Añadir
          </button>
        </div>
        {error && (
          <p role="alert" className="field-error" id={`catalog-quantity-${p.id}-error`}>
            {error}
          </p>
        )}
      </div>
    </article>
  );
}
function DraftComparison({ previous, local, current, products }: {
  previous: Draft; local: Draft; current: Draft; products: Product[];
}) {
  const versions = [previous, local, current];
  const labels = ["Último borrador confirmado", "Tu edición", "Guardado actual"];
  const ids = [...new Set(versions.flatMap(value => value.lines.map(line => line.productId)))];
  const rows = [
    ...ids.map(id => ({
      name: products.find(product => product.id === id)?.name || "Producto pendiente de consultar",
      values: versions.map(value => {
        const line = value.lines.find(item => item.productId === id);
        return line ? `${line.quantity} ${line.quantity === 1 ? "unidad" : "unidades"}` : "Sin seleccionar";
      }),
    })),
    ...(!ids.length ? [{ name: "Productos", values: versions.map(() => "Sin productos") }] : []),
    { name: "Nombre", values: versions.map(value => value.pickup.name || "Sin indicar") },
    { name: "Horario solicitado", values: versions.map(value => value.pickup.time || "Sin indicar") },
    { name: "Notas", values: versions.map(value => value.pickup.notes || "Sin notas") },
  ];
  return (
    <div className="draft-comparison-table" aria-label="Comparación de borradores">
      <span className="comparison-head">Dato</span>
      {rows.map((row, index) => <strong className="comparison-field-name" key={row.name}
        style={{ "--field-index": index } as CSSProperties}>{row.name}</strong>)}
      {labels.map((label, version) => <div className="draft-comparison" key={label}
        style={{ "--version-index": version } as CSSProperties}>
        <strong className="comparison-head">{label}</strong>
        {rows.map((row, index) => <div className="comparison-cell" key={row.name}
          style={{ "--field-index": index } as CSSProperties}>
          <span className="comparison-version">{label}: </span>
          <span className="comparison-value">{row.values[version]}</span>
        </div>)}
      </div>)}
    </div>
  );
}
export default function MenuApp() {
  const [products, setProducts] = useState<Product[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [draft, setDraft] = useState<Draft>(newDraft),
    [ready, setReady] = useState(false),
    [loadError, setLoadError] = useState(""),
    [draftError, setDraftError] = useState(""),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("Todo"),
    [stage, setStage] = useState<
      "catalog" | "checkout" | "review" | "uncertain" | "saved"
    >("catalog"),
    [quote, setQuote] = useState<Quote | null>(null),
    [saved, setSaved] = useState<Order | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [fields, setFields] = useState<Record<string, string>>({}),
    [conflict, setConflict] = useState<Conflict | null>(null),
    [saveState, setSaveState] = useState(""),
    [announcement, setAnnouncement] = useState(""),
    [pulse, setPulse] = useState<{ id: string; n: number }>({ id: "", n: 0 }),
    [raw, setRaw] = useState<Record<string, string>>({});
  const [lastConfirmed, setLastConfirmed] = useState<Draft>(newDraft);
  const latest = useRef(draft),
    revision = useRef(0),
    dirty = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    queue = useRef<Promise<boolean>>(Promise.resolve(true)),
    attempt = useRef<Attempt | null>(null),
    conflictRef = useRef<Conflict | null>(null),
    comanda = useRef<HTMLElement>(null);
  function showConflict(c: Conflict | null) {
    conflictRef.current = c;
    setConflict(c);
  }
  useEffect(() => {
    if (stage === "uncertain" && ready)
      comanda.current?.scrollIntoView({ block: "start" });
  }, [stage, ready]);
  async function load() {
    try {
      await initialize();
      setLoadError("");
      setDraftError("");
      const [catalogResult, draftResult] = await Promise.allSettled([api("catalog"), api("draft")]);
      if (catalogResult.status === "fulfilled") {
        setProducts(catalogResult.value.products);
        setCategories(catalogResult.value.categories);
      } else setLoadError(catalogResult.reason.message);
      if (draftResult.status === "rejected") {
        setDraftError(draftResult.reason.message);
        setReady(true);
        return;
      }
      const d = draftResult.value;
      if (catalogResult.status === "rejected") setProducts(d.products);
      latest.current = d.draft;
      revision.current = d.revision;
      setLastConfirmed(d.draft);
      setDraft(d.draft);
      dirty.current = false;
      if (d.draft.lines.length) setSaveState("Borrador recuperado");
      if (d.attempt) {
        attempt.current = d.attempt;
        setQuote(attemptQuote(d.attempt));
        setStage("uncertain");
      }
      setReady(true);
    } catch (e) {
      setLoadError((e as Error).message);
      setDraftError("No pudimos consultar tu comanda. Reintenta para recuperar tu selección.");
      setReady(true);
    }
  }
  function requestEdit(destination: "catalog" | "checkout") {
    if (busy) return;
    if (attempt.current) {
      setStage("uncertain");
      setError("Antes de editar, consulta el intento pendiente. Conservamos la selección enviada. Usa Recuperar pedido para confirmar su estado.");
      comanda.current?.scrollIntoView({ block: "start" });
      return;
    }
    setQuote(null);
    setStage(destination);
  }
  function update(next: Draft) {
    if (attempt.current) {
      requestEdit("checkout");
      return;
    }
    latest.current = next;
    setDraft(next);
    dirty.current = true;
    setSaveState("Guardando borrador…");
    setQuote(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 350);
  }
  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    queue.current = queue.current.then(async () => {
      if (!dirty.current) return true;
      if (conflictRef.current) return false;
      const snapshot = latest.current;
      try {
        const r = await api("draft", {
          draft: snapshot,
          revision: revision.current,
        });
        revision.current = r.revision;
        setLastConfirmed(r.draft);
        if (latest.current === snapshot) {
          dirty.current = false;
          setSaveState("Borrador guardado");
        }
        return true;
      } catch (e) {
        setSaveState("Borrador sin confirmar");
        if (e instanceof ApiError && e.status === 409) showConflict(e.data as Conflict);
        else setError((e as Error).message);
        return false;
      }
    });
    return queue.current;
  }
  const loadInitial = useEffectEvent(load);
  const flushOnLeave = useEffectEvent(flush);
  useEffect(() => {
    void Promise.resolve().then(loadInitial);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (dirty.current) void flushOnLeave();
    };
  }, []);
  function add(p: Product, n: number) {
    const existing = latest.current.lines.find((l) => l.productId === p.id),
      quantity = (existing?.quantity || 0) + n;
    const total =
      latest.current.lines.reduce(
        (sum, l) =>
          sum +
          (products.find((p) => p.id === l.productId)?.priceCents || 0) *
            l.quantity,
        0,
      ) +
      p.priceCents * n;
    if (!Number.isSafeInteger(quantity) || !Number.isSafeInteger(total))
      return false;
    update({
      ...latest.current,
      lines: existing
        ? latest.current.lines.map((l) =>
            l.productId === p.id ? { ...l, quantity } : l,
          )
        : [
            ...latest.current.lines,
            { productId: p.id, quantity, revision: p.revision },
          ],
    });
    setRaw((r) => ({ ...r, [p.id]: String(quantity) }));
    setPulse((v) => ({ id: p.id, n: v.n + 1 }));
    setAnnouncement(`${p.name} añadido. Cantidad en la comanda: ${quantity}.`);
    return true;
  }
  function editQty(id: string, value: string) {
    setRaw({ ...raw, [id]: value });
    if (!validQty(value)) {
      setFields((f) => ({
        ...f,
        ["quantity-" + id]: "Escribe una cantidad entera positiva.",
      }));
      return;
    }
    const next = {
      ...latest.current,
      lines: latest.current.lines.map((l) =>
        l.productId === id ? { ...l, quantity: Number(value) } : l,
      ),
    };
    if (
      !Number.isSafeInteger(
        next.lines.reduce(
          (t, l) =>
            t +
            (products.find((p) => p.id === l.productId)?.priceCents || 0) *
              l.quantity,
          0,
        ),
      )
    ) {
      setFields((f) => ({
        ...f,
        ["quantity-" + id]: "La cantidad excede el límite numérico seguro.",
      }));
      return;
    }
    setFields((f) => {
      const n = { ...f };
      delete n["quantity-" + id];
      return n;
    });
    update(next);
  }
  function clearField(key: string) {
    setFields((f) => {
      const next = { ...f };
      delete next[key];
      return next;
    });
  }
  function focusError(errors: Record<string, string>) {
    setFields(errors);
    setTimeout(() => {
      const key = Object.keys(errors)[0];
      if (key?.startsWith("quantity-"))
        document
          .querySelector<HTMLInputElement>(
            `[data-comanda-line="${key.slice(9)}"] input`,
          )
          ?.focus();
      else document.getElementById("pickup-" + key)?.focus();
    }, 0);
  }
  async function review(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const f: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(fields).filter(([k]) => k.startsWith("quantity-")),
      ),
    };
    for (const l of draft.lines)
      if (raw[l.productId] !== undefined && !validQty(raw[l.productId]))
        f["quantity-" + l.productId] = "Escribe una cantidad entera positiva.";
    if (
      draft.pickup.name.trim().length < 2 ||
      draft.pickup.name.trim().length > 80
    )
      f.name = "Escribe un nombre de entre 2 y 80 caracteres.";
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.pickup.time))
      f.time = "Indica un horario válido en formato HH:mm.";
    if (draft.pickup.notes.length > 500)
      f.notes = "Escribe como máximo 500 caracteres.";
    if (Object.keys(f).length) {
      focusError(f);
      return;
    }
    setFields({});
    setBusy(true);
    try {
      if (!(await flush())) return;
      const q = await api("quote", latest.current);
      setQuote(q);
      setStage("review");
      setTimeout(() => comanda.current?.scrollIntoView({ block: "start" }), 0);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) showConflict(e.data as Conflict);
      else if (e instanceof ApiError && e.data.fields)
        focusError(e.data.fields);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function completed(o: Order) {
    setSaved(o);
    setStage("saved");
    setError("");
    setFields({});
    const key = attempt.current?.key;
    try {
      const d = await api("draft");
      setDraft(d.draft);
      latest.current = d.draft;
      revision.current = d.revision;
      setLastConfirmed(d.draft);
      dirty.current = false;
      setRaw({});
    } catch {
      setError(
        "El pedido está guardado. No pudimos actualizar el borrador; vuelve al menú para recuperarlo.",
      );
    }
    if (key) await api("attempt", { key, clear: true }).catch(() => {});
    attempt.current = null;
    setTimeout(() => comanda.current?.scrollIntoView({ block: "start" }), 0);
  }
  async function confirm(recover = false) {
    setBusy(true);
    setError("");
    try {
      let intent = attempt.current;
      if (!intent) {
        if (!quote) return;
        intent = {
          key: crypto.randomUUID(),
          quote: quote.quote,
          draftRevision: revision.current,
        };
        attempt.current = intent;
        await api("attempt", intent);
      }
      if (recover) {
        const r = await api("recover?key=" + intent.key);
        if (r.order) {
          await completed(r.order);
          return;
        }
      }
      const r = await api("orders", intent);
      await completed(r.order);
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        setError(e.message);
        if (e.data.code === "ATTEMPT_CONFLICT") {
          attempt.current = e.data.current as Attempt;
          setQuote(attemptQuote(e.data.current as Attempt));
          setStage("uncertain");
          return;
        }
        if (e.data.current) showConflict(e.data as Conflict);
        if (
          ["PRODUCT_CONFLICT", "QUOTE_EXPIRED", "VALIDATION"].includes(
            e.data.code,
          ) &&
          attempt.current
        ) {
          const key = attempt.current.key;
          const r = await api("recover?key=" + key).catch(() => null);
          if (r && !r.order) {
            await api("attempt", { key, clear: true });
            attempt.current = null;
            setQuote(null);
            setStage("checkout");
          } else setStage("uncertain");
        } else setStage("uncertain");
      } else {
        setError(
          "Aún no sabemos si el pedido se guardó. Conservamos la selección enviada. Usa Recuperar pedido para consultar el mismo intento.",
        );
        setStage("uncertain");
      }
    } finally {
      setBusy(false);
    }
  }
  async function editUncertain() {
    setBusy(true);
    try {
      const a = attempt.current;
      if (!a) return;
      const r = await api("recover?key=" + a.key);
      if (r.order) {
        await completed(r.order);
        return;
      }
      await confirm(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reconcile(useServer: boolean) {
    if (!conflict) return;
    try {
      if (conflict.code === "DRAFT_CONFLICT") {
        revision.current = conflict.current.revision;
        const next = useServer ? conflict.current.draft : latest.current;
        showConflict(null);
        update(next);
        await flush();
      } else {
        const c = await api("catalog");
        setProducts(c.products);
        const next = {
          ...latest.current,
          lines: latest.current.lines.flatMap((l) => {
            const p = c.products.find((p: Product) => p.id === l.productId);
            return p?.active ? [{ ...l, revision: p.revision }] : [];
          }),
        };
        showConflict(null);
        update(next);
        setError("");
        setQuote(null);
        if (stage === "review") setStage("checkout");
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const visible = products.filter(
    (p) =>
      p.active &&
      (category === "Todo" ||
        categories.find((c) => c.id === p.categoryId)?.name === category) &&
      normalize(p.name + " " + p.description).includes(normalize(query)),
  );
  const selection = draft.lines.map((l) => {
    const p = products.find((p) => p.id === l.productId);
    return {
      ...l,
      name: p?.name || "Producto no disponible",
      priceCents: p?.priceCents || 0,
      illustration: p?.illustration || null,
    };
  });
  const total = selection.reduce((t, l) => t + l.quantity * l.priceCents, 0),
    count = draft.lines.reduce((t, l) => t + l.quantity, 0);
  const invalidQuantity = Object.keys(fields).some((key) => key.startsWith("quantity-"));
  const frozen = stage === "saved" ? saved : quote;
  return (
    <main
      className={`main-shell ${stage !== "catalog" ? "conversion-shell" : ""}`}
    >
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <div className="page-heading">
        <div>
          <h1>
            {stage === "catalog"
              ? "Del menú a tu comanda"
              : stage === "checkout"
                ? "Prepara tu pedido"
                : stage === "review"
                  ? "Revisa tu pedido"
                  : stage === "uncertain"
                    ? "Recupera tu pedido"
                    : "Tu pedido, guardado"}
          </h1>
          {stage === "catalog" && <p>Elige, ajusta y revisa tu selección.</p>}
        </div>
        {stage === "catalog" && (
          <span className="menu-caption">
            Tacos y bebidas<span>Precios en MXN</span>
          </span>
        )}
        {stage !== "catalog" && stage !== "saved" && (
          <button className="text-button" disabled={busy} onClick={() => requestEdit("catalog")}>
            <ArrowLeft size={18} />
            Seguir eligiendo
          </button>
        )}
      </div>
      {!ready ? (
        <div className="loading-state" role="status">
          Preparando tu demostración…
        </div>
      ) : (
        <>
          {stage === "catalog" && !loadError && !draftError && (
            <div className="menu-toolbar">
              <label className="search-field">
                <Search size={20} />
                <Input
                  aria-label="Buscar productos"
                  placeholder="Buscar productos"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    aria-label="Borrar búsqueda"
                    onClick={() => setQuery("")}
                  >
                    ×
                  </button>
                )}
              </label>
              <div className="filters" aria-label="Filtrar por categoría">
                {["Todo", "Tacos", "Bebidas"].map((c) => (
                  <button
                    key={c}
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div
            className={`menu-workspace ${stage !== "catalog" ? "expanded" : ""}`}
          >
            {stage === "catalog" && (
              <section className="catalog" aria-label="Productos del menú">
                {loadError ? <ErrorBox error={loadError} retry={() => void load()} /> : <>
                <div className="catalog-label">
                  <span>{category === "Todo" ? "Nuestro menú" : category}</span>
                  <span>{visible.length} {visible.length === 1 ? "producto" : "productos"}</span>
                </div>
                <a className="mobile-comanda-access" href="#comanda">
                  <ShoppingBag size={18} />
                  <span>{draftError ? "Comanda no disponible" : invalidQuantity ? "Revisa la cantidad" : `Tu comanda · ${count} ${count === 1 ? "producto" : "productos"}`}</span>{" "}
                  {!draftError && <strong>{invalidQuantity && <span className="last-valid-label">Último total válido: </span>}{money(total)}</strong>}
                  <ArrowRight size={18} />
                </a>
                <div className="product-grid">
                  {visible.map((p) => (
                    <ProductCard
                      key={p.id}
                      p={p}
                      categoryName={
                        categories.find((c) => c.id === p.categoryId)?.name ||
                        ""
                      }
                      onAdd={add}
                      selectionUnavailable={!!draftError}
                    />
                  ))}
                </div>
                {!visible.length && (
                  <div className="empty-state">
                    <Search size={28} />
                    <h2>{products.some((p) => p.active) ? "Sin coincidencias" : "No hay productos activos"}</h2>
                    <p>{products.some((p) => p.active) ? "Prueba otro nombre o categoría." : "Puedes activar un producto o crear uno en tu demostración."}</p>
                    {products.some((p) => p.active) ? <button
                      className="secondary"
                      onClick={() => {
                        setQuery("");
                        setCategory("Todo");
                      }}
                    >
                      Limpiar filtros
                    </button> : <Link className="secondary" href="/administrar">Administrar productos</Link>}
                  </div>
                )}
                <p className="catalog-end">
                  Ilustraciones conceptuales · Una referencia para cada
                  elección.
                </p>
                </>}
              </section>
            )}
            <section
              id="comanda"
              ref={comanda}
              data-testid="comanda"
              className={`comanda ${selection.length || frozen?.lines.length ? "has-selection" : ""} ${stage === "catalog" ? "comanda-side" : "comanda-expanded"}`}
              aria-label="Tu comanda"
            >
              <div className="comanda-heading">
                <div>
                  <span className="comanda-kicker">{branding.logoText}</span>
                  <h2>
                    {stage === "saved"
                      ? "Pedido de demostración guardado"
                      : stage === "review"
                        ? "Tu selección, lista para revisar"
                        : stage === "uncertain"
                          ? "Selección enviada"
                          : "Tu comanda"}
                  </h2>
                </div>
                <ShoppingBag size={26} />
                <span className="comanda-fold" />
              </div>
              {["checkout", "review"].includes(stage) && (
                <nav className="comanda-shortcuts" aria-label="Ir a una sección de la comanda">
                  <a href="#comanda-actions">Total y siguiente paso <ArrowRight size={16} /></a>
                  <a href="#pickup-section">Datos de recogida <ArrowRight size={16} /></a>
                </nav>
              )}
              {stage === "uncertain" && (
                <div className="uncertainty-band" role="alert">
                  <strong>Estado por confirmar</strong>
                  <p className="uncertain-message">{error || "No pudimos confirmar si se guardó. Recupera el pedido antes de cambiar la selección enviada."}</p>
                  <div className="recovery-actions">
                    <Button id="recover-order" disabled={busy} className="primary" onClick={() => void confirm(true)}>
                      <RotateCcw size={18} />
                      {busy ? "Consultando…" : "Recuperar pedido"}
                    </Button>
                    <button disabled={busy} className="secondary" onClick={() => requestEdit("checkout")}>Editar</button>
                  </div>
                  <button disabled={busy} className="text-button" onClick={() => void editUncertain()}>
                    Consultar el intento antes de editar
                  </button>
                </div>
              )}
              {stage === "saved" && saved && (
                <div className="saved-banner" data-testid="order-confirmation">
                  <Check size={22} />
                  <div>
                    <strong>Folio {saved.folio}</strong>
                    <p>Guardado en tu demostración</p>
                  </div>
                  <span className="status">Pendiente</span>
                </div>
              )}
              {draftError ? <ErrorBox title="Comanda no disponible" error={draftError} retry={() => void load()} /> : stage === "catalog" && !selection.length ? (
                <div className="empty-comanda">
                  <Utensils size={34} strokeWidth={1.5} />
                  <h3>Todo empieza con tu elección</h3>
                  <p>
                    Añade un taco o una bebida.
                    <br />
                    Aquí iremos reuniendo tu selección.
                  </p>
                  <div className="empty-comanda-edge">
                    <span>Total</span>
                    <strong>{money(0)}</strong>
                  </div>
                </div>
              ) : (
                <>
                  {["review", "uncertain", "saved"].includes(stage) &&
                  frozen ? (
                    <HistoricalLines lines={frozen.lines} />
                  ) : (
                    <div className="comanda-lines">
                      {selection.map((l) => (
                        <div
                          key={
                            l.productId +
                            (pulse.id === l.productId ? "-" + pulse.n : "")
                          }
                          data-comanda-line={l.productId}
                          className={`comanda-line ${pulse.id === l.productId ? "line-added" : ""}`}
                        >
                          <Illustration src={l.illustration} name={l.name} compact />
                          <div className="line-spec">
                            <strong className="line-name">{l.name}</strong>
                            <p>{money(l.priceCents)} por unidad</p>
                            <strong className="line-subtotal">{money(l.priceCents * l.quantity)}</strong>
                          </div>
                          <div className="line-controls">
                            <Quantity
                              name={l.name + " en la comanda"}
                              value={raw[l.productId] ?? String(l.quantity)}
                              error={fields["quantity-" + l.productId]}
                              inputId={`pickup-quantity-${l.productId}`}
                              onChange={(v) => editQty(l.productId, v)}
                            />
                            <button
                              className="remove-button"
                              aria-label={`Quitar ${l.name}`}
                              onClick={() => {
                                update({
                                  ...draft,
                                  lines: draft.lines.filter(
                                    (x) => x.productId !== l.productId,
                                  ),
                                });
                                setFields((f) => {
                                  const next = { ...f };
                                  delete next["quantity-" + l.productId];
                                  return next;
                                });
                              }}
                            >
                              <Trash2 size={14} />
                              Quitar
                            </button>
                          </div>
                          {fields["quantity-" + l.productId] && (
                            <p className="field-error" role="alert" id={`pickup-quantity-${l.productId}-error`}>
                              {fields["quantity-" + l.productId]}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="comanda-action-edge" id="comanda-actions" tabIndex={-1}>
                    <div className="total">
                      <span>{invalidQuantity ? "Total de la última selección válida" : "Total de demostración"}</span>
                      <strong>
                        {money(
                          frozen &&
                            ["review", "uncertain", "saved"].includes(stage)
                            ? frozen.totalCents
                            : total,
                        )}
                        <small> MXN</small>
                      </strong>
                    </div>
              {conflict && (
                <div className="conflict-box" id="draft-conflict" role="alert">
                  <h3>Hay cambios que revisar</h3>
                  <p>{conflict.error}</p>
                  {conflict.code === "DRAFT_CONFLICT" ? (
                    <>
                      <DraftComparison previous={lastConfirmed} local={draft} current={conflict.current.draft} products={products} />
                      <div className="action-row">
                        <button
                          className="secondary"
                          onClick={() => void reconcile(true)}
                        >
                          Usar borrador guardado
                        </button>
                        <button
                          className="secondary"
                          onClick={() => void reconcile(false)}
                        >
                          Conservar mi edición
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>
                        <strong>Selección anterior:</strong>{" "}
                        {
                          selection.find(
                            (l) => l.productId === conflict.current?.id,
                          )?.name
                        }{" "}
                        ·{" "}
                        {money(
                          selection.find(
                            (l) => l.productId === conflict.current?.id,
                          )?.priceCents || 0,
                        )}
                      </p>
                      <p>
                        <strong>Producto actual:</strong>{" "}
                        {conflict.current?.name} ·{" "}
                        {money(conflict.current?.priceCents || 0)} ·{" "}
                        {conflict.current?.active ? "Activo" : "Inactivo"}
                      </p>
                      <button
                        className="secondary"
                        onClick={() => void reconcile(false)}
                      >
                        Aceptar cambios y revisar de nuevo
                      </button>
                    </>
                  )}
                </div>
              )}
                    {stage === "catalog" && (
                      <Button
                        className="primary full"
                        onClick={() => {
                          setStage("checkout");
                          (
                            window as Window & {
                              constructorTrack?: (event: string) => void;
                            }
                          ).constructorTrack?.("Pedido iniciado");
                          void flush();
                          setTimeout(
                            () =>
                              comanda.current?.scrollIntoView({
                                block: "start",
                              }),
                            0,
                          );
                        }}
                      >
                        Continuar con mi pedido
                        <ArrowRight size={18} />
                      </Button>
                    )}
                    {stage === "checkout" && (
                      <Button
                        type="submit"
                        form="checkout-form"
                        disabled={busy || !selection.length}
                        className="primary full"
                      >
                        {busy ? "Revisando…" : "Revisar pedido"}
                        <ArrowRight size={18} />
                      </Button>
                    )}
                    {stage === "review" && (
                      <div className="action-row confirmation-actions">
                        <Button
                          disabled={busy}
                          aria-busy={busy}
                          className="primary"
                          onClick={() => void confirm()}
                        >
                          {busy ? "Guardando…" : "Confirmar pedido"}
                          {busy ? <Hourglass size={18} /> : <ArrowRight size={18} />}
                        </Button>
                        <button
                          disabled={busy}
                          className="secondary"
                          onClick={() => requestEdit("checkout")}
                        >
                          Editar
                        </button>
                      </div>
                    )}
                    {stage === "saved" && (
                      <div className="action-row">
                        <Link className="primary" href="/pedidos">
                          Ver mis pedidos
                          <ArrowRight size={18} />
                        </Link>
                        <button
                          className="secondary"
                          onClick={() => {
                            setStage("catalog");
                            setSaved(null);
                            setQuote(null);
                            void load();
                          }}
                        >
                          Volver al menú
                        </button>
                      </div>
                    )}
                  </div>
                  {stage === "checkout" && (
                    <form
                      id="checkout-form"
                      className="pickup-form"
                      onSubmit={review}
                      noValidate
                    >
                      <h3 id="pickup-section" tabIndex={-1}>Datos de recogida</h3>
                      <p>Un nombre y un horario solicitado para tu pedido.</p>
                      {Object.keys(fields).length > 0 && (
                        <div className="validation-summary" role="alert">
                          <strong>Revisa estos datos</strong>
                          <ul>
                            {Object.entries(fields).map(([k, v]) => (
                              <li key={k}>
                                <a
                                  href={"#pickup-" + k}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    if (k.startsWith("quantity-"))
                                      document
                                        .querySelector<HTMLInputElement>(
                                          `[data-comanda-line="${k.slice(9)}"] input`,
                                        )
                                        ?.focus();
                                    else
                                      document
                                        .getElementById("pickup-" + k)
                                        ?.focus();
                                  }}
                                >
                                  {v}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="pickup-field-grid">
                        <label>
                          Nombre
                          <Input
                            id="pickup-name"
                            aria-label="Nombre"
                            autoComplete="given-name"
                            value={draft.pickup.name}
                            aria-invalid={!!fields.name}
                            aria-describedby={
                              fields.name ? "error-name" : undefined
                            }
                            onChange={(e) => {
                              clearField("name");
                              update({
                                ...draft,
                                pickup: {
                                  ...draft.pickup,
                                  name: e.target.value,
                                },
                              });
                            }}
                          />
                          {fields.name && (
                            <span id="error-name" className="field-error">
                              {fields.name}
                            </span>
                          )}
                        </label>
                        <label>
                          Horario solicitado
                          <Input
                            id="pickup-time"
                            aria-label="Horario solicitado"
                            type="text"
                            inputMode="numeric"
                            placeholder="HH:mm"
                            value={draft.pickup.time}
                            aria-invalid={!!fields.time}
                            aria-describedby={
                              fields.time ? "error-time" : "time-help"
                            }
                            onChange={(e) => {
                              clearField("time");
                              update({
                                ...draft,
                                pickup: {
                                  ...draft.pickup,
                                  time: e.target.value,
                                },
                              });
                            }}
                          />
                          {fields.time && (
                            <span id="error-time" className="field-error">
                              {fields.time}
                            </span>
                          )}
                          <small id="time-help">
                            Formato HH:mm. No confirma disponibilidad.
                          </small>
                        </label>
                      </div>
                      <label>
                        Notas opcionales
                        <textarea
                          id="pickup-notes"
                          aria-label="Notas opcionales"
                          rows={3}
                          value={draft.pickup.notes}
                          aria-invalid={!!fields.notes}
                          aria-describedby="notes-help"
                          onChange={(e) => {
                            clearField("notes");
                            update({
                              ...draft,
                              pickup: {
                                ...draft.pickup,
                                notes: e.target.value,
                              },
                            });
                          }}
                        />
                        <small id="notes-help">
                          {draft.pickup.notes.length}/500 caracteres
                          {fields.notes && " · " + fields.notes}
                        </small>
                      </label>
                    </form>
                  )}
                  {["review", "uncertain", "saved"].includes(stage) &&
                    frozen && <div id="pickup-section" tabIndex={-1}><PickupDetails pickup={frozen.pickup} /></div>}
                </>
              )}
              {!draftError && stage !== "saved" && stage !== "uncertain" && (
                <div className="draft-state">
                  <span>
                    {Object.keys(fields).length
                      ? "Revisa los datos. Los cambios inválidos no están confirmados."
                      : saveState || "Tu selección se conserva en esta sesión."}
                  </span>
                  {saveState === "Borrador sin confirmar" && !conflict && (
                    <button onClick={() => void flush()}>
                      Reintentar guardado
                    </button>
                  )}
                </div>
              )}
              {error && stage !== "uncertain" && <ErrorBox error={error} />}

            </section>
          </div>
        </>
      )}
    </main>
  );
}
