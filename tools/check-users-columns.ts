import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL!;
  const noSslVerify = (process.env.PG_NO_SSL_VERIFY || '').toLowerCase() === 'true';
  if (noSslVerify) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const pool = new Pool({ connectionString: url, ...(noSslVerify ? { ssl: { rejectUnauthorized: false } } : {}) });
  pool.on('error', (err) => console.error('Postgres pool error:', err));
  const res = await pool.query(
    `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name in ('default_start_time','default_end_time') order by column_name`);
  console.log(res.rows.map(r => r.column_name));
  await pool.end();
}

main().catch((e) => { console.error(e?.message || e); process.exitCode = 1; });
