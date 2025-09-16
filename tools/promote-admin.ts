#!/usr/bin/env tsx
import 'dotenv/config';
import { Client } from 'pg';

type ArgMap = Record<string, string | boolean>;

function parseArgs(argv: string[]): { id?: string; username?: string; role?: 'admin' | 'employee' } {
  const args = argv.slice(2);
  const map: ArgMap = {};
  let positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.replace(/^--/, '');
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        map[key] = next;
        i++;
      } else {
        map[key] = true;
      }
    } else {
      positional.push(a);
    }
  }

  let username = (map.username as string) || undefined;
  let id = (map.id as string) || undefined;
  let role = (map.role as string) as 'admin' | 'employee' | undefined;

  if (!id && !username && positional.length) {
    // support: tsx tools/promote-admin.ts <username>
    username = positional[0];
  }
  if (role !== 'admin' && role !== 'employee') role = 'admin';
  return { id, username, role };
}

async function main() {
  const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('No DATABASE_URL set. Aborting.');
    process.exit(1);
  }
  const { id, username, role } = parseArgs(process.argv);
  if (!id && !username) {
    console.log('Usage:');
    console.log('  npm run promote:admin -- <username> [--role admin|employee]');
    console.log('  npm run promote:admin -- --id <userId> [--role admin|employee]');
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    let res;
    if (id) {
      res = await client.query(
        'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, role',
        [role, id]
      );
    } else {
      res = await client.query(
        'UPDATE users SET role = $1 WHERE username = $2 RETURNING id, username, role',
        [role, username]
      );
    }
    if (res.rowCount === 0) {
      console.error('No matching user found.');
      process.exit(2);
    }
    const row = res.rows[0];
    console.log(`Success: ${row.username} (${row.id}) is now '${row.role}'.`);
  } catch (e: any) {
    console.error('Failed to update role:', e?.message || e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

