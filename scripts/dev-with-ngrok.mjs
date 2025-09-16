#!/usr/bin/env node
// Launches `npm run dev` and ngrok bound to a reserved domain.
// Usage:
//   node scripts/dev-with-ngrok.mjs --domain your-domain.ngrok-free.app --port 5000
// Options:
//   --no-kill   Do not auto-kill existing local ngrok processes

import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.includes('=') ? a.slice(2).split('=') : [a.slice(2), argv[i + 1]];
      if (v && !v.startsWith('--')) { out[k] = v; if (!a.includes('=')) i++; } else { out[k] = true; }
    }
  }
  return out;
}

const args = parseArgs(process.argv);
const domain = args.domain || process.env.NGROK_DOMAIN || 'nonstriped-jocelyn-nonnormal.ngrok-free.app';
let port = Number(args.port || process.env.DEV_PORT || process.env.PORT || 5000);
const publicUrl = `https://${domain}`;
const killExisting = args['no-kill'] ? false : true;

console.log(`[dev-with-ngrok] Desired port ${port}. Exposing ${publicUrl}`);
console.log(`[dev-with-ngrok] If ngrok errors with ERR_NGROK_108, end other agent sessions first or use a plan allowing multiple sessions.`);

// Utilities
function checkPort(p) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', (err) => {
      srv.close();
      resolve(false);
    });
    srv.once('listening', () => {
      srv.close(() => resolve(true));
    });
    srv.listen(p, '0.0.0.0');
  });
}

async function findFreePort(start, maxTries = 15) {
  let p = start;
  for (let i = 0; i < maxTries; i++, p++) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await checkPort(p);
    if (ok) return p;
  }
  return start; // fallback; let Node surface EADDRINUSE
}

port = await findFreePort(port);
if (String(port) !== (args.port || process.env.DEV_PORT || process.env.PORT || '5000')) {
  console.log(`[dev-with-ngrok] Port in use; switching to available port ${port}.`);
}

// Ensure client env points API/UPLOAD to the public ngrok domain
function ensureClientEnvFiles(baseUrl) {
  try {
    const clientDir = path.resolve(process.cwd(), 'client');
    const envLocal = path.join(clientDir, '.env.local');
    const envProd = path.join(clientDir, '.env.production');
    const content = `VITE_API_BASE=${baseUrl}\nVITE_UPLOAD_BASE=${baseUrl}\nVITE_FORCE_WEB_RECORDER=false\n`;
    fs.mkdirSync(clientDir, { recursive: true });
    fs.writeFileSync(envLocal, content, 'utf8');
    try { fs.writeFileSync(envProd, content, 'utf8'); } catch {}
    console.log(`[dev-with-ngrok] Set VITE_API_BASE in client env to ${baseUrl}`);
  } catch (e) {
    console.warn('[dev-with-ngrok] Could not write client env files:', e?.message || e);
  }
}

ensureClientEnvFiles(publicUrl);

// Start the app dev server
const devEnv = { ...process.env, PORT: String(port), PUBLIC_URL: publicUrl, HMR_HOST: domain };
// Use a shell so Windows can resolve npm/npx reliably when launched from Explorer
const dev = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: devEnv,
});

let shuttingDown = false;
const cleanExit = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  try { ngrok?.kill('SIGINT'); } catch {}
  try { dev?.kill('SIGINT'); } catch {}
  setTimeout(() => process.exit(0), 200);
};

process.on('SIGINT', cleanExit);
process.on('SIGTERM', cleanExit);

// Start ngrok after a short delay
let ngrok;
function execDetached(cmd, args, opts={}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: 'ignore', shell: false, ...opts });
    p.on('exit', () => resolve());
    p.on('error', () => resolve());
  });
}

async function killExistingNgrok() {
  if (!killExisting) return;
  console.log('[dev-with-ngrok] Killing existing local ngrok processes (if any)...');
  if (process.platform === 'win32') {
    // Force kill ngrok.exe if running
    await execDetached('taskkill', ['/F', '/IM', 'ngrok.exe']);
  } else {
    // Try pkill; ignore if not present
    await execDetached('pkill', ['-f', '[/]ngrok']);
  }
}

function startNgrok() {
  console.log(`[dev-with-ngrok] Launching ngrok on ${publicUrl} -> http://localhost:${port}`);
  const ngrokCmd = process.platform === 'win32' ? 'ngrok.exe' : 'ngrok';
  ngrok = spawn(ngrokCmd, ['http', `--domain=${domain}`, String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });

  ngrok.stdout.on('data', (d) => process.stdout.write(d));
  ngrok.stderr.on('data', (d) => {
    const s = d.toString();
    process.stderr.write(d);
    if (s.includes('ERR_NGROK_108')) {
      console.error('\n[dev-with-ngrok] Another ngrok agent session is active.');
      console.error('[dev-with-ngrok] End it in the dashboard (Agents -> End session)');
      console.error('[dev-with-ngrok] or stop it locally: taskkill /IM ngrok.exe /F');
    }
  });

  ngrok.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`[dev-with-ngrok] ngrok exited (code=${code}, signal=${signal}).`);
      console.error('[dev-with-ngrok] You can relaunch it after resolving the above.');
    }
  });
}

// If the dev server dies, shut down ngrok too
dev.on('exit', (code, signal) => {
  console.log(`[dev-with-ngrok] dev server exited (code=${code}, signal=${signal}). Shutting down ngrok.`);
  cleanExit();
});

// Kill any lingering local ngrok, then start
killExistingNgrok().finally(() => setTimeout(startNgrok, 800));
