"use client";
import { useEffect, useState } from "react";
import { Plus, Pencil, Check, Package, Hourglass, ArrowRight } from "lucide-react";
import { Input } from "./ui/input";
import {
  api,
  initialize,
  ApiError,
  money,
  decimalCents,
  ErrorBox,
  Dialog,
  type Product,
  type Category,
  type Order,
} from "./shared";
import { OrderList } from "./orders-app";
type Edit = {
  id?: string;
  name: string;
  description: string;
  categoryId: string;
  price: string;
  active: boolean;
  revision?: number;
};
export default function AdminApp() {
  const [products, setProducts] = useState<Product[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [orders, setOrders] = useState<Order[]>([]),
    [tab, setTab] = useState("Productos"),
    [ready, setReady] = useState(false),
    [loadError, setLoadError] = useState(""),
    [edit, setEdit] = useState<Edit | null>(null),
    [original, setOriginal] = useState<Product | null>(null),
    [conflict, setConflict] = useState<Product | null>(null),
    [error, setError] = useState(""),
    [fields, setFields] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [deactivate, setDeactivate] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [notice, setNotice] = useState("");
  async function load() {
    try {
      await initialize();
      setLoadError("");
      const [c, o] = await Promise.all([api("catalog"), api("orders")]);
      setProducts(c.products);
      setCategories(c.categories);
      setOrders(o.orders);
      setReady(true);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }
  useEffect(() => {
    void initialize().then(() => load(), (e: Error) => setLoadError(e.message));
  }, []);
  function open(p?: Product) {
    setEdit(
      p
        ? {
            id: p.id,
            name: p.name,
            description: p.description,
            categoryId: p.categoryId,
            price: decimalCents(p.priceCents),
            active: p.active,
            revision: p.revision,
          }
        : {
            name: "",
            description: "",
            categoryId: categories[0]?.id || "",
            price: "",
            active: true,
          },
    );
    setOriginal(p || null);
    setConflict(null);
    setError("");
    setFields({});
    setNotice("");
    setUncertain(false);
  }
  function clearField(key: string) {
    setFields((f) => {
      const next = { ...f };
      delete next[key];
      return next;
    });
  }
  function validate() {
    if (!edit) return false;
    const f: Record<string, string> = {};
    if (edit.name.trim().length < 2 || edit.name.trim().length > 80)
      f.name = "Escribe un nombre de entre 2 y 80 caracteres.";
    if (
      !/^\d+(\.\d{1,2})?$/.test(edit.price) ||
      Number(edit.price) <= 0 ||
      !Number.isSafeInteger(Math.round(Number(edit.price) * 100))
    )
      f.price = "Escribe un precio positivo con hasta dos decimales.";
    if (!categories.some((c) => c.id === edit.categoryId))
      f.categoryId = "Elige una categoría.";
    if (edit.description.length > 500)
      f.description = "Escribe como máximo 500 caracteres.";
    setFields(f);
    if (Object.keys(f).length) {
      setTimeout(
        () => document.getElementById("product-" + Object.keys(f)[0])?.focus(),
        0,
      );
      return false;
    }
    return true;
  }
  async function save() {
    if (!edit) return;
    setBusy(true);
    setError("");
    try {
      const body = edit.id
        ? {
            name: edit.name,
            description: edit.description,
            categoryId: edit.categoryId,
            price: edit.price,
            active: edit.active,
            revision: edit.revision,
          }
        : {
            name: edit.name,
            description: edit.description,
            categoryId: edit.categoryId,
            price: edit.price,
          };
      const r = await api("products" + (edit.id ? "/" + edit.id : ""), body);
      setProducts((p) =>
        edit.id
          ? p.map((x) => (x.id === edit.id ? r.product : x))
          : [...p, r.product],
      );
      setEdit(null);
      setDeactivate(false);
      setNotice("Producto guardado.");
    } catch (e) {
      setDeactivate(false);
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 409)
        setConflict(e.data.current as Product);
      if (e instanceof ApiError && e.data.fields) setFields(e.data.fields);
      if (!(e instanceof ApiError) || !e.status || e.status >= 500)
        setUncertain(true);
    } finally {
      setBusy(false);
    }
  }
  async function consult() {
    setBusy(true);
    try {
      const c = await api("catalog");
      setProducts(c.products);
      if (edit?.id) {
        const p = c.products.find((p: Product) => p.id === edit.id);
        setConflict(p);
        setError(
          "Consulta los valores guardados antes de volver a guardar tu edición.",
        );
      } else {
        setError(
          "Catálogo consultado. Comprueba si tu producto aparece abajo antes de intentar crearlo otra vez.",
        );
      }
      setUncertain(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const editor = edit && (
    <form
      className="product-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (!validate() || uncertain || conflict) return;
        if (original?.active && !edit.active) setDeactivate(true);
        else void save();
      }}
      noValidate
    >
      <div className="section-heading">
        <h2>{edit.id ? "Editar producto" : "Crear producto"}</h2>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => setEdit(null)}
        >
          Cerrar
        </button>
      </div>
      {Object.keys(fields).length > 0 && (
        <div className="validation-summary" role="alert">
          <strong>Revisa estos datos</strong>
          <ul>
            {Object.entries(fields).map(([k, v]) => (
              <li key={k}>
                <a
                  href={"#product-" + k}
                  onClick={() =>
                    document.getElementById("product-" + k)?.focus()
                  }
                >
                  {v}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="product-field-grid">
        <label>
          Nombre del producto
          <Input
            id="product-name"
            aria-label="Nombre del producto"
            value={edit.name}
            aria-invalid={!!fields.name}
            aria-describedby={fields.name ? "product-name-error" : undefined}
            onChange={(e) => {
              clearField("name");
              setEdit({ ...edit, name: e.target.value });
            }}
          />
          {fields.name && (
            <span className="field-error" id="product-name-error">
              {fields.name}
            </span>
          )}
        </label>
        <label>
          Categoría
          <select
            id="product-categoryId"
            value={edit.categoryId}
            aria-invalid={!!fields.categoryId}
            aria-describedby={fields.categoryId ? "product-category-error" : undefined}
            onChange={(e) => {
              clearField("categoryId");
              setEdit({ ...edit, categoryId: e.target.value });
            }}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {fields.categoryId && <span className="field-error" id="product-category-error">{fields.categoryId}</span>}
        </label>
        <label>
          Precio en MXN
          <Input
            id="product-price"
            aria-label="Precio en MXN"
            inputMode="decimal"
            value={edit.price}
            aria-invalid={!!fields.price}
            aria-describedby={fields.price ? "product-price-error" : undefined}
            onChange={(e) => {
              clearField("price");
              setEdit({ ...edit, price: e.target.value });
            }}
          />
          {fields.price && <span className="field-error" id="product-price-error">{fields.price}</span>}
        </label>
        <label className="product-description-field">
          Descripción opcional
          <textarea
            id="product-description"
            aria-label="Descripción opcional"
            rows={2}
            value={edit.description}
            aria-invalid={!!fields.description}
            aria-describedby={fields.description ? "product-description-error" : undefined}
            onChange={(e) => {
              clearField("description");
              setEdit({ ...edit, description: e.target.value });
            }}
          />
          {fields.description && (
            <span className="field-error" id="product-description-error">{fields.description}</span>
          )}
        </label>
      </div>
      {edit.id && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={edit.active}
            onChange={(e) => setEdit({ ...edit, active: e.target.checked })}
          />
          Producto activo en el menú
        </label>
      )}
      {error && !conflict && <ErrorBox error={error} />}
      {conflict && (
        <div className="conflict-box" role="alert">
          <h3>El producto cambió</h3>
          <p>Compara los cambios antes de elegir qué conservar.</p>
          <div className="comparison">
            <div>
              <strong>Antes</strong>
              <p>
                {original?.name} · {money(original?.priceCents || 0)} MXN
              </p>
              <p>{original?.description}</p>
              <p>
                {categories.find((c) => c.id === original?.categoryId)?.name} ·{" "}
                {original?.active ? "Activo" : "Inactivo"}
              </p>
            </div>
            <div>
              <strong>Tu edición</strong>
              <p>
                {edit.name} · {money(Math.round(Number(edit.price) * 100))} MXN
              </p>
              <p>{edit.description}</p>
              <p>
                {categories.find((c) => c.id === edit.categoryId)?.name} ·{" "}
                {edit.active ? "Activo" : "Inactivo"}
              </p>
            </div>
            <div>
              <strong>Guardado actual</strong>
              <p>
                {conflict.name} · {money(conflict.priceCents)} MXN
              </p>
              <p>{conflict.description}</p>
              <p>
                {categories.find((c) => c.id === conflict.categoryId)?.name} ·{" "}
                {conflict.active ? "Activo" : "Inactivo"}
              </p>
            </div>
          </div>
          <div className="action-row">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setEdit({ ...edit, revision: conflict.revision });
                setOriginal(conflict);
                setConflict(null);
                setError("");
              }}
            >
              Conservar mi edición
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => open(conflict)}
            >
              Usar valores guardados
            </button>
          </div>
        </div>
      )}
      {uncertain ? (
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => void consult()}
        >
          Consultar productos guardados
        </button>
      ) : (
        <button className="primary" disabled={busy || !!conflict} type="submit">
          {busy ? "Guardando…" : "Guardar producto"}
          {busy ? <Hourglass size={18} /> : <ArrowRight size={18} />}
        </button>
      )}
    </form>
  );
  return (
    <main className="main-shell interior-shell">
      <div className="page-heading">
        <div>
          <h1>Tu demostración</h1>
          <p>Administra los productos y pedidos de esta sesión.</p>
        </div>
        <Package className="heading-icon" size={36} strokeWidth={1.5} />
      </div>
      {loadError ? (
        <ErrorBox error={loadError} retry={() => void load()} />
      ) : !ready ? (
        <div className="loading-state" role="status">
          Abriendo tu demostración…
        </div>
      ) : (
        <>
          <div className="admin-tabs" aria-label="Secciones de administración">
            {["Productos", "Pedidos"].map((t) => (
              <button
                key={t}
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
              >
                {t}
                <span>
                  {t === "Productos" ? products.length : orders.length}
                </span>
              </button>
            ))}
          </div>
          {notice && (
            <p className="success-message" role="status">
              <Check size={18} />
              {notice}
            </p>
          )}
          {tab === "Productos" ? (
            <>
              <div className="section-heading">
                <h2>Productos</h2>
                <button className="primary" onClick={() => open()}>
                  <Plus size={18} />
                  Crear producto
                </button>
              </div>
              {edit && !edit.id && editor}
              <div className="admin-product-list">
                <div className="product-list-labels">
                  <span>Producto</span>
                  <span>Categoría</span>
                  <span>Precio</span>
                  <span>Estado</span>
                  <span />
                </div>
                {products.map((p) => (
                  <div
                    key={p.id}
                    className="admin-product-record"
                    data-product-id={p.id}
                  >
                    <div className="admin-product-row">
                      <strong>{p.name}</strong>
                      <span>
                        {categories.find((c) => c.id === p.categoryId)?.name}
                      </span>
                      <span>
                        {money(p.priceCents)} <small>MXN</small>
                      </span>
                      <span className="status">
                        {p.active ? "Activo" : "Inactivo"}
                      </span>
                      <button
                        className="secondary"
                        aria-label={`Editar ${p.name}`}
                        onClick={() => open(p)}
                      >
                        <Pencil size={14} />
                        Editar
                      </button>
                    </div>
                    {edit?.id === p.id && editor}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="section-heading">
                <h2>Pedidos</h2>
                <button className="text-button" onClick={() => void load()}>
                  Actualizar pedidos
                </button>
              </div>
              <OrderList admin orders={orders} setOrders={setOrders} />
            </>
          )}
        </>
      )}
      {deactivate && (
        <Dialog
          title="¿Desactivar este producto?"
          onClose={() => {
            if (!busy) setDeactivate(false);
          }}
        >
          <p>
            <strong>{edit?.name}</strong> dejará de aparecer en el menú. Los
            pedidos guardados conservarán sus datos originales.
          </p>
          <div className="dialog-actions">
            <button
              autoFocus
              className="secondary"
              disabled={busy}
              onClick={() => {
                if (edit) setEdit({ ...edit, active: true });
                setDeactivate(false);
              }}
            >
              Conservar activo
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? "Guardando…" : "Confirmar desactivación"}
            </button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
