import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  // Prefer a direct (non-pooler) DB URL for DDL, fallback to DATABASE_URL
  const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.log('No DATABASE_URL set; skipping DB ensure.');
    return;
  }

  const noSslVerify = (process.env.PG_NO_SSL_VERIFY || '').toLowerCase() === 'true';
  if (noSslVerify) {
    // As a last resort for networks with TLS MITM, disable verification
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }
  const pool = new Pool({
    connectionString: url,
    ...(noSslVerify ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  // Prevent unhandled 'error' events from crashing the process if the
  // database terminates connections unexpectedly (e.g., Supabase auto-pause).
  // Log and continue; the script will retry or exit via catch below.
  pool.on('error', (err) => {
    console.error('Postgres pool error during ensure:', err);
  });

  // Wake paused DBs (e.g., Supabase free tier)
  for (let i = 0; i < 10; i++) {
    try {
      await pool.query('select 1');
      break;
    } catch (e) {
      if (i === 9) throw e;
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  // Warn if running against Supabase pooler which may block DDL
  try {
    const u = new URL(url);
    if (u.hostname.includes('pooler.supabase.com')) {
      console.warn(
        'Detected Supabase pooler host. DDL may fail. Set DIRECT_DATABASE_URL to the non-pooler connection string for setup.'
      );
    }
  } catch {}

  // Verify users table exists
  const existsRes = await pool.query<{ exists: boolean }>(
    "select to_regclass('public.users') is not null as exists",
  );
  if (!existsRes.rows[0]?.exists) {
    console.warn('Users table not found. Skipping column add.');
    await pool.end();
    return;
  }

  // Apply minimal, safe DDL to match current app schema
  const ddl = [
    'alter table "public"."users" add column if not exists "default_start_time" text',
    'alter table "public"."users" add column if not exists "default_end_time" text',
  ];

  for (const stmt of ddl) {
    await pool.query(stmt);
  }

  console.log('DB ensure: users.default_start_time/default_end_time present.');
  await pool.end();
}

main().catch((err) => {
  console.error('DB ensure failed:', err?.message || err);
  process.exitCode = 1;
});
