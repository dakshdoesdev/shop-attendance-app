#!/usr/bin/env tsx
import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('No DATABASE_URL set. Aborting wipe.');
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    console.log('Connected. Beginning wipe (TRUNCATE) …');
    // Disable triggers to avoid FK headaches; then truncate in safe order
    await client.query('BEGIN');
    // Audio references attendance, which references users.
    await client.query('TRUNCATE TABLE audio_recordings RESTART IDENTITY CASCADE');
    await client.query('TRUNCATE TABLE attendance_records RESTART IDENTITY CASCADE');
    await client.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
    await client.query('COMMIT');
    console.log('Wipe complete. Tables are now empty.');
    console.log('Tip: Admin login via hardcoded toggle will still work if enabled.');
  } catch (e: any) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Wipe failed:', e?.message || e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

