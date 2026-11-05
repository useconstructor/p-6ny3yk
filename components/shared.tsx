"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X, ArrowRight, RotateCcw } from "lucide-react";
import branding from "@/branding.json";
import { withSessionLock } from "./session-lock";
export type Product = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceCents: number;
  active: boolean;
  revision: number;
  illustration: string | null;
};
export type Category = { id: string; name: string };
export type LineInput = {
  productId: string;
  quantity: number;
  revision: number;
};
export type Pickup = { name: string; time: string; notes: string };
export type Draft = { lines: LineInput[]; pickup: Pickup };
export type SnapshotLine = {
  productId: string;
  name: string;
  quantity: number;
  priceCents: number;
  illustration: string | null;
};
export type Order = {
  id: string;
  folio: string;
  status: string;
  version: number;
  totalCents: number;
  createdAt: string;
  pickup: Pickup;
  lines: SnapshotLine[];
};
export type Quote = {
  quote: string;
  lines: SnapshotLine[];
  pickup: Pickup;
  totalCents: number;
};
export type Attempt = { key: string; quote: string; draftRevision: number };
export class ApiError extends Error {
  constructor(
    public data: {
      error: string;
      code: string;
      fields?: Record<string, string>;
      current?: unknown;
    },
    public status: number,
  ) {
    super(data.error || "No pudimos conectar con el servidor.");
  }
}
export async function api(path: string, body?: unknown) {
  let res;
  try {
    res = await fetch("/api/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      keepalive: true,
    });
  } catch {
    throw new ApiError(
      {
        error: "No pudimos conectar con el servidor. Conservamos tu selección.",
        code: "NETWORK",
      },
      0,
    );
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw new ApiError(
      {
        error: "No pudimos confirmar la respuesta del servidor.",
        code: "NETWORK",
      },
      0,
    );
  }
  if (!res.ok) {
    if (res.status === 401) initializing = undefined;
    throw new ApiError(data, res.status);
  }
  return data;
}
let initializing: Promise<void> | undefined;
export function initialize() {
  return (initializing ??= (async () => {
    const run = async () => {
      await api("session", {});
      await api("session");
    };
    try {
      await withSessionLock(run);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(
        {
          error:
            "No pudimos coordinar tu sesión. Permite las cookies y el almacenamiento del sitio y vuelve a intentarlo.",
          code: "SESSION",
        },
        0,
      );
    }
  })().catch((e) => {
    initializing = undefined;
    throw e;
  }));
}
export const decimalCents = (c: number) =>
  `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
export const money = (c: number) =>
  `${new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.floor(c / 100))}.${String(c % 100).padStart(2, "0")}`;
export const statusName = (s: string) =>
  ({
    pendiente: "Pendiente",
    preparando: "Preparando",
    listo: "Listo",
    cancelado: "Cancelado",
  })[s] || s;
export const newDraft = (): Draft => ({
  lines: [],
  pickup: { name: "", time: "", notes: "" },
});
export function Header() {
  const path = usePathname(),
    [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === path;
  const setOpen = (value: boolean) => setOpenPath(value ? path : null);
  const btn = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLAnchorElement>("a")?.focus();
  }, [open]);
  const links = [
    ["/", "Menú"],
    ["/pedidos", "Mis pedidos"],
    ["/administrar", "Administrar"],
  ];
  return (
    <>
      <header className="site-header">
        <Link href="/" className="brand" aria-label={branding.logoText}>
          {/* Serve the exact SVG mark or an owner supplied URL without rewriting its identity. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={branding.logoImageUrl || "/brand-mark.svg"}
            data-brand-logo
            alt=""
            width="64"
            height="64"
          />
          <span>
            <span>{branding.logoText.split(" ")[0]}</span>
            <strong>{branding.logoText.split(" ").slice(1).join(" ")}</strong>
          </span>
        </Link>
        <nav className="desktop-nav" aria-label="Navegación principal">
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        <button
          ref={btn}
          className="mobile-toggle"
          aria-label={open ? "Cerrar navegación" : "Abrir navegación"}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
          <span>Vistas</span>
        </button>
        {open && (
          <nav
            ref={panel}
            id="mobile-nav"
            className="mobile-nav"
            aria-label="Navegación móvil"
            onKeyDown={(e) => {
              const els =
                panel.current?.querySelectorAll<HTMLAnchorElement>("a");
              if (e.key === "Escape") {
                setOpen(false);
                btn.current?.focus();
              }
              if (e.key === "Tab" && els) {
                if (e.shiftKey && document.activeElement === els[0]) {
                  e.preventDefault();
                  els[els.length - 1].focus();
                } else if (
                  !e.shiftKey &&
                  document.activeElement === els[els.length - 1]
                ) {
                  e.preventDefault();
                  els[0].focus();
                }
              }
            }}
          >
            {links.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                aria-current={path === href ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {label}
                <ArrowRight size={18} />
              </Link>
            ))}
          </nav>
        )}
      </header>
      <div className="demo-notice">
        <span className="notice-dot" />
        Prototipo ficticio · Productos y precios de demostración · Sin cobros ni
        preparación real.
      </div>
    </>
  );
}
export function Illustration({
  src,
  name,
  compact = false,
}: {
  src: string | null;
  name: string;
  compact?: boolean;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null),
    [retry, setRetry] = useState(0);
  const failed = src !== null && failedSource === src;
  return (
    <>
    <div className="illustration-frame">
      {src && !failed ? (
        // Versioned SVGs use their canonical URL, including the explicit resource retry.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src + (retry ? `?retry=${retry}` : "")}
          alt={`Ilustración conceptual de ${name}`}
          width="220"
          height="152"
          onError={() => setFailedSource(src)}
        />
      ) : src ? (
        <div className="image-recovery">
          <span className="sr-only">{name}: ilustración no disponible</span>
          {compact ? <small>Sin imagen</small> : <button
            aria-label="Reintentar imagen"
            title={`Recuperar ilustración de ${name}`}
            onClick={() => {
              setRetry(retry + 1);
              setFailedSource(null);
            }}
          >
            <small>Sin imagen</small>
            <strong>Reintentar</strong>
          </button>}
        </div>
      ) : (
        <div className="no-illustration">
          <span>{name}</span>
          <small>Sin ilustración</small>
        </div>
      )}
    </div>
    {compact && failed && (
      <button
        className="image-retry"
        aria-label="Reintentar imagen"
        title={`Recuperar ilustración de ${name}`}
        onClick={() => {
          setRetry(retry + 1);
          setFailedSource(null);
        }}
      >
        <RotateCcw size={16} />
        Reintentar imagen
        <span className="sr-only"> de {name}</span>
      </button>
    )}
    </>
  );
}
export function ErrorBox({
  error,
  retry,
  title = "No pudimos completar esta acción",
}: {
  error: string;
  retry?: () => void;
  title?: string;
}) {
  return (
    <div className="error-box" role="alert">
      <strong>{title}</strong>
      <p>{error}</p>
      {retry && (
        <button className="secondary" onClick={retry}>
          <RotateCcw size={16} />
          Reintentar
        </button>
      )}
    </div>
  );
}
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const prior = document.activeElement as HTMLElement;
    const scope = prior?.closest(
      "[data-order-id], .admin-product-record, main",
    );
    dialog?.showModal();
    return () => {
      dialog?.close();
      queueMicrotask(() => {
        const target =
          prior?.isConnected && !prior.matches(":disabled")
            ? prior
            : scope?.querySelector<HTMLElement>(
                "button:not(:disabled), a[href]",
              );
        target?.focus();
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === "Tab") {
          const nodes = ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
          );
          if (!nodes?.length) {
            e.preventDefault();
            return;
          }
          const first = nodes[0],
            last = nodes[nodes.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="dialog-title"
      className="dialog"
    >
      <h2 id="dialog-title">{title}</h2>
      {children}
    </dialog>
  );
}
export function HistoricalLines({ lines }: { lines: SnapshotLine[] }) {
  return (
    <div className="historical-lines">
      {lines.map((l) => (
        <div className="historical-line" key={l.productId} data-selected-product={l.productId}>
          <Illustration src={l.illustration} name={l.name} compact />
          <div className="historical-spec">
            <strong>{l.name}</strong>
            <div className="historical-amounts">
              <p>
              {l.quantity} × {money(l.priceCents)}
              </p>
              <strong>{money(l.quantity * l.priceCents)}</strong>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
export function PickupDetails({ pickup }: { pickup: Pickup }) {
  return (
    <dl className="pickup-details">
      <div>
        <dt>Nombre</dt>
        <dd>{pickup.name}</dd>
      </div>
      <div>
        <dt>Horario solicitado</dt>
        <dd>{pickup.time}</dd>
      </div>
      {pickup.notes && (
        <div className="notes-detail">
          <dt>Notas</dt>
          <dd>{pickup.notes}</dd>
        </div>
      )}
    </dl>
  );
}
