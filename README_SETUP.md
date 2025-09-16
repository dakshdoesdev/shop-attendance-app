Shop Attendance — One-Click Setup (Windows)

Overview

- Runs on Windows with a stable reserved ngrok domain.
- Web‑only: mobile users use the browser; no native app required.
- One click: use the scripts/Start-Setup-And-Dev.cmd file.

Quick Start (Windows)

- Install everything: double-click `scripts/Install-All.cmd`.
- Start dev later: double-click `scripts/Start-Dev.cmd`.
- On first run, paste your ngrok authtoken when prompted.
- The script:
  - Installs Node LTS (via winget) and ngrok if missing.
  - Installs npm packages.
  - Writes env files pinned to `https://nonstriped-jocelyn-nonnormal.ngrok-free.app`.
  - Starts the dev server + ngrok on your reserved domain.

Daily Workflow

- Double-click `scripts/Start-Dev.cmd`.
- Open `https://nonstriped-jocelyn-nonnormal.ngrok-free.app`.
- To stop, close the window.

Manual Commands (optional)

- First-time setup only:
  - `npm run setup:win`
  - `ngrok config add-authtoken <YOUR_TOKEN>`
- Start dev (reserved domain):
  - `npm run dev:ngrok`
- Re-pin envs and clean any unused bits:
  - `npm run cleanup:win`

What is Installed/Configured

- Node.js LTS and ngrok agent (via winget) if not present.
- npm dependencies (uses `npm ci` when lockfile present).
- Env files pinned to your reserved domain:
  - `./.env`, `./.env.local`, `./.env.production`
  - `./client/.env.local`, `./client/.env.production`
- All scripts point to: `https://nonstriped-jocelyn-nonnormal.ngrok-free.app`.

Notes

- The script does not store or hardcode your ngrok authtoken. It prompts you once, then ngrok remembers it in `%USERPROFILE%\.config\ngrok\ngrok.yml`.
- Web-only: microphone and location use the browser's prompts and APIs.
- If you need to change the reserved domain, edit `package.json` (script `dev:ngrok`) and re-run `npm run cleanup:win`.

Troubleshooting

- Winget not found: install Node.js LTS manually from https://nodejs.org and ngrok from https://ngrok.com/download, then re-run the script.
- Port already in use: the launcher auto-switches to a free port and still binds the ngrok domain.
- SSL/HMR issues on LAN: the setup pins PUBLIC_URL/HMR_HOST for ngrok; use the cmd launcher for consistent behavior.
