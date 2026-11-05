import "server-only";
import { createClient } from "@libsql/client";
export const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
let ready: Promise<unknown> | undefined;
export function schema() {
  return (ready ??= db
    .batch(
      [
        `CREATE TABLE IF NOT EXISTS sesiones (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, initialized INTEGER NOT NULL DEFAULT 0, draft TEXT NOT NULL DEFAULT '{"lines":[],"pickup":{"name":"","time":"","notes":""}}', revision INTEGER NOT NULL DEFAULT 0, attempt TEXT, created_at TEXT NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS categorias (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sesiones(id), name TEXT NOT NULL, UNIQUE(session_id,name))`,
        `CREATE TABLE IF NOT EXISTS productos (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sesiones(id), category_id TEXT NOT NULL REFERENCES categorias(id), name TEXT NOT NULL, description TEXT NOT NULL, price_cents INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1, revision INTEGER NOT NULL DEFAULT 1, illustration TEXT)`,
        `CREATE TABLE IF NOT EXISTS pedidos (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sesiones(id), folio TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pendiente', version INTEGER NOT NULL DEFAULT 1, total_cents INTEGER NOT NULL, created_at TEXT NOT NULL, pickup TEXT NOT NULL, operation_key TEXT NOT NULL, payload_hash TEXT NOT NULL, UNIQUE(session_id,operation_key))`,
        `CREATE TABLE IF NOT EXISTS lineas_pedido (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES pedidos(id), product_id TEXT NOT NULL REFERENCES productos(id), name TEXT NOT NULL, quantity INTEGER NOT NULL, price_cents INTEGER NOT NULL, illustration TEXT)`,
        `CREATE INDEX IF NOT EXISTS pedidos_owner ON pedidos(session_id,created_at)`,
        `CREATE INDEX IF NOT EXISTS productos_owner ON productos(session_id)`,
      ],
      "write",
    )
    .catch((e) => {
      ready = undefined;
      throw e;
    }));
}
