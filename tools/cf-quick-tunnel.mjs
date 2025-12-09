#!/usr/bin/env node
// Start a Cloudflare quick tunnel and auto-write envs to the tunnel URL.
// Usage: npm run tunnel:cf

import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const apiUrl = process.env.API_URL || "http://localhost:5000";
const cloudflaredBin =
  process.env.CLOUDFLARED_BIN ||
  (fs.existsSync(path.join(process.env.HOME || "", ".local/bin/cloudflared"))
    ? path.join(process.env.HOME || "", ".local/bin/cloudflared")
    : "cloudflared");

function upsertKV(content, key, value) {
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) return content.replace(re, `${key}=${value}`);
  return `${content.trimEnd()}\n${key}=${value}\n`;
}

function writeEnv(filePath, updates) {
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    // file may not exist; start fresh
  }
  for (const [k, v] of Object.entries(updates)) {
    content = upsertKV(content || "", k, v);
  }
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`Updated ${filePath}`);
}

function updateEnvs(urlStr) {
  const u = new URL(urlStr);
  const host = u.hostname;
  const base = `${u.protocol}//${u.host}`;
  const rootEnv = path.resolve(".env");
  const envLocal = path.resolve(".env.local");
  const envProd = path.resolve(".env.production");
  const clientDir = path.resolve("client");
  const clientEnvLocal = path.join(clientDir, ".env.local");
  const clientEnvProd = path.join(clientDir, ".env.production");

  const commonRoot = {
    PUBLIC_URL: base,
    CORS_ORIGIN: base,
    HMR_HOST: host,
    COOKIE_SAMESITE: "none",
    COOKIE_SECURE: "true",
  };
  writeEnv(rootEnv, commonRoot);
  writeEnv(envLocal, { VITE_API_BASE: base, VITE_UPLOAD_BASE: base });
  writeEnv(envProd, { VITE_API_BASE: base, VITE_UPLOAD_BASE: base });
  fs.mkdirSync(clientDir, { recursive: true });
  writeEnv(clientEnvLocal, { VITE_API_BASE: base, VITE_UPLOAD_BASE: base, VITE_FORCE_WEB_RECORDER: "false" });
  writeEnv(clientEnvProd, { VITE_API_BASE: base, VITE_UPLOAD_BASE: base, VITE_FORCE_WEB_RECORDER: "false" });
  console.log(`Tunnel URL set to ${base}`);
  console.log("Restart dev/prod servers to pick up new envs.");
}

let wrote = false;
const proc = spawn(cloudflaredBin, ["tunnel", "--url", apiUrl], {
  stdio: ["ignore", "pipe", "pipe"],
});

proc.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  if (!wrote) {
    const match = text.match(/https?:\/\/[a-z0-9.-]+\.trycloudflare\.com/);
    if (match) {
      wrote = true;
      updateEnvs(match[0]);
    }
  }
});

proc.stderr.on("data", (chunk) => {
  process.stderr.write(chunk.toString());
});

proc.on("exit", (code) => {
  console.log(`cloudflared exited with code ${code ?? "null"}`);
});

process.on("SIGINT", () => {
  proc.kill("SIGINT");
  process.exit(0);
});
