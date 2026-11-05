"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Check,
} from "lucide-react";
import {
  api,
  initialize,
  ApiError,
  money,
  statusName,
  ErrorBox,
  Dialog,
  HistoricalLines,
  PickupDetails,
  type Order,
} from "./shared";
export function OrderList({
  orders,
  setOrders,
  admin = false,
}: {
  orders: Order[];
  setOrders: (orders: Order[]) => void;
  admin?: boolean;
}) {
  const [open, setOpen] = useState<string[]>([]),
    [cancel, setCancel] = useState<Order | null>(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState<Record<string, string>>({}),
    [uncertainAction, setUncertainAction] = useState<Record<string, string>>({}),
    [uncertain, setUncertain] = useState<string[]>([]),
    [notice, setNotice] = useState("");
  function replace(o: Order) {
    setOrders(orders.map((x) => (x.id === o.id ? o : x)));
  }
  async function transition(o: Order, status: string) {
    setBusy(o.id);
    setNotice("");
    setError((e) => ({ ...e, [o.id]: "" }));
    try {
      const r = await api("orders/" + o.id, { status, version: o.version });
      replace(r.order);
      setNotice(
        status === "cancelado"
          ? "Cancelación confirmada."
          : `Estado actualizado: ${statusName(status)}.`,
      );
      setCancel(null);
    } catch (e) {
      setCancel(null);
      if (e instanceof ApiError && e.status === 409) {
        replace(e.data.current as Order);
        setError((v) => ({
          ...v,
          [o.id]:
            "El pedido cambió. Este es su estado actual; no confirmamos el cambio solicitado.",
        }));
      } else {
        setUncertainAction((v) => ({ ...v, [o.id]: status }));
        setUncertain((v) => [...v, o.id]);
        setError((v) => ({
          ...v,
          [o.id]:
            "No pudimos confirmar el cambio. Consulta el estado del pedido antes de volver a intentarlo.",
        }));
      }
    } finally {
      setBusy("");
    }
  }
  async function recover(id: string) {
    setBusy(id);
    try {
      const r = await api("orders/" + id);
      replace(r.order);
      setUncertain((v) => v.filter((x) => x !== id));
      setError((v) => ({ ...v, [id]: "" }));
      setNotice(`Estado confirmado: ${statusName(r.order.status)}.`);
    } catch (e) {
      setError((v) => ({ ...v, [id]: (e as Error).message }));
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      {notice && (
        <p className="success-message" role="status">
          <Check size={18} />
          {notice}
        </p>
      )}
      <div className="order-list">
        {orders.map((o) => (
          <article className="order-record" key={o.id} data-order-id={o.id}>
            <div className="order-top">
              <strong>{o.folio}</strong>
              <time dateTime={o.createdAt}>
                {new Intl.DateTimeFormat("es-MX", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(o.createdAt))}
              </time>
            </div>
            <div className="order-main">
              <div>
                <span className="small-label">Horario solicitado</span>
                <strong>{o.pickup.time}</strong>
              </div>
              <span className="status">{uncertain.includes(o.id) ? "Estado por confirmar" : statusName(o.status)}</span>
              <strong className="order-total">
                {money(o.totalCents)} <small>MXN</small>
              </strong>
              <button
                className="secondary"
                aria-expanded={open.includes(o.id)}
                onClick={() =>
                  setOpen((v) =>
                    v.includes(o.id)
                      ? v.filter((x) => x !== o.id)
                      : [...v, o.id],
                  )
                }
              >
                {open.includes(o.id) ? "Ocultar detalles" : "Ver detalles"}
                {open.includes(o.id) ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </button>
            </div>
            <div className="order-actions">
              {!uncertain.includes(o.id) && o.status === "pendiente" && (
                <button
                  className="text-button"
                  disabled={!!busy}
                  onClick={() => setCancel(o)}
                >
                  Cancelar pedido
                </button>
              )}
              {admin &&
                !uncertain.includes(o.id) &&
                ["pendiente", "preparando"].includes(o.status) && (
                  <button
                    className="primary"
                    disabled={!!busy}
                    onClick={() =>
                      void transition(
                        o,
                        o.status === "pendiente" ? "preparando" : "listo",
                      )
                    }
                  >
                    {busy === o.id
                      ? "Guardando…"
                      : o.status === "pendiente"
                        ? "Comenzar preparación"
                        : "Marcar listo"}
                    <ArrowRight size={16} />
                  </button>
                )}
              {uncertain.includes(o.id) && (
                <button
                  className="secondary"
                  disabled={!!busy}
                  onClick={() => void recover(o.id)}
                >
                  Consultar estado
                </button>
              )}
            </div>
            {error[o.id] && <ErrorBox
              error={error[o.id]}
              title={uncertain.includes(o.id)
                ? uncertainAction[o.id] === "cancelado"
                  ? "No pudimos confirmar la cancelación"
                  : "No pudimos confirmar el cambio"
                : undefined}
            />}
            {open.includes(o.id) && (
              <div className="order-expanded">
                <HistoricalLines lines={o.lines} />
                <PickupDetails pickup={o.pickup} />
              </div>
            )}
          </article>
        ))}
      </div>
      {!orders.length && (
        <div className="empty-state">
          <ClipboardList size={36} strokeWidth={1.5} />
          <h2>Aún no tienes pedidos guardados</h2>
          <p>Tu próxima selección empieza en el menú.</p>
          <Link className="primary" href="/">
            Volver al menú
            <ArrowRight size={18} />
          </Link>
        </div>
      )}
      {cancel && (
        <Dialog
          title="¿Cancelar este pedido?"
          onClose={() => {
            if (!busy) setCancel(null);
          }}
        >
          <p>
            Folio <strong>{cancel.folio}</strong> · {money(cancel.totalCents)}
          </p>
          <p>
            Solo puedes cancelarlo mientras siga pendiente. La comanda
            permanecerá en tu historial.
          </p>
          <div className="dialog-actions">
            <button
              autoFocus
              className="secondary"
              disabled={!!busy}
              onClick={() => setCancel(null)}
            >
              Conservar pedido
            </button>
            <button
              className="primary"
              disabled={!!busy}
              onClick={() => void transition(cancel, "cancelado")}
            >
              {busy ? "Cancelando…" : "Confirmar cancelación"}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
export default function OrdersApp() {
  const [orders, setOrders] = useState<Order[]>([]),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  async function load() {
    try {
      await initialize();
      setError("");
      setOrders((await api("orders")).orders);
      setReady(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void initialize().then(() => load(), (e: Error) => setError(e.message));
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return (
    <main className="main-shell interior-shell">
      <div className="page-heading">
        <div>
          <h1>Mis pedidos</h1>
          <p>Tus comandas guardadas, en un mismo lugar.</p>
        </div>
        <Link href="/" className="text-button">
          Volver al menú
          <ArrowRight size={18} />
        </Link>
      </div>
      {error ? (
        <ErrorBox error={error} retry={() => void load()} />
      ) : !ready ? (
        <div className="loading-state" role="status">
          Consultando tus pedidos…
        </div>
      ) : (
        <OrderList orders={orders} setOrders={setOrders} />
      )}
    </main>
  );
}
