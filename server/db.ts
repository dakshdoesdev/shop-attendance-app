import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

// Prefer direct (non-pooler) URL when available to reduce backend resets
const RUNTIME_DB_URL = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

if (!RUNTIME_DB_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Optional dev override to bypass TLS verification when encountering
// "self signed certificate in certificate chain" in certain networks.
// Set PG_NO_SSL_VERIFY=true in .env to enable (NOT recommended for production).
const noSslVerify = (process.env.PG_NO_SSL_VERIFY || '').toLowerCase() === 'true';
let supabaseHost = false;
try {
  const u = new URL(RUNTIME_DB_URL);
  supabaseHost = /\.supabase\.(co|com)$/i.test(u.hostname);
} catch {}
if (noSslVerify) {
  // As a last resort, disable TLS verification process-wide in dev
  // This helps when corporate proxies MITM TLS and pg still rejects certs
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  const rounded = Math.floor(parsed);
  return rounded > 0 ? rounded : undefined;
}

const poolMax = parsePositiveInt(process.env.PG_POOL_MAX);
const idleTimeout = parsePositiveInt(process.env.PG_IDLE_TIMEOUT);
const connectionTimeout = parsePositiveInt(process.env.PG_CONN_TIMEOUT);
const keepAlive = parsePositiveInt(process.env.PG_KEEPALIVE_IDLE);

const poolConfig: any = {
  connectionString: RUNTIME_DB_URL,
  // Default to verified TLS for Supabase; allow opt-out via PG_NO_SSL_VERIFY
  ...(noSslVerify
    ? { ssl: { rejectUnauthorized: false } }
    : (supabaseHost ? { ssl: true } : {})),
};

if (poolMax !== undefined) poolConfig.max = poolMax;
if (idleTimeout !== undefined) poolConfig.idleTimeoutMillis = idleTimeout;
if (connectionTimeout !== undefined) poolConfig.connectionTimeoutMillis = connectionTimeout;
if (keepAlive !== undefined) poolConfig.keepAliveInitialDelayMillis = keepAlive;

export const pool = new Pool(poolConfig);
export const db = drizzle(pool, { schema });

// Avoid crashing the process on transient database shutdowns (e.g., Supabase auto-pause)
// pg emits 'error' on the pool when a backend connection dies unexpectedly.
const benignCodes = new Set(['XX000']);
const warnThrottleMs = parsePositiveInt(process.env.PG_POOL_WARN_THROTTLE_MS) ?? 60_000;
let lastBenignLog = 0;

pool.on('error', (err: any) => {
  // Benign on Supabase: pooled backends can be terminated (e.g., auto-pause or DDL attempts elsewhere)
  const msg = String(err?.message || err || '');
  const code = (err && (err.code as string)) || '';
  if (benignCodes.has(code) || msg.includes('db_termination') || msg.includes('{:shutdown')) {
    const now = Date.now();
    if (now - lastBenignLog >= warnThrottleMs) {
      console.info('Postgres connection closed by server (likely pooled backend). Will reconnect on next query.');
      lastBenignLog = now;
    }
    return;
  }
  // Log and let future queries reconnect instead of bringing down the server
  console.error('Unexpected Postgres pool error. Will retry on next query:', err);
});

// Best-effort warm-up to wake paused databases (e.g., Supabase free tier)
export async function ensureDbReady(retries = 10, delayMs = 1500): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('select 1');
      return;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
