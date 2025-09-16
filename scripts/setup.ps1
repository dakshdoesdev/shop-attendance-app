[CmdletBinding()]
param(
  [string]$Domain = "nonstriped-jocelyn-nonnormal.ngrok-free.app",
  [switch]$ConfigureDatabase,
  [string]$DatabaseUrl,
  [string]$DirectDatabaseUrl,
  [switch]$ConfigureSupabase,
  [string]$SupabaseUrl,
  [string]$SupabaseServiceKey
)

$ErrorActionPreference = 'Stop'

function Write-Section($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Step($msg) { Write-Host "[setup] $msg" -ForegroundColor Gray }

Write-Section "Environment Setup (Windows)"
Write-Step "Desired ngrok domain: https://$Domain"

# 1) Ensure Node.js (>= 18)
function Get-NodeVersion() {
  try { (node -v) -replace '[^0-9\.]','' } catch { return $null }
}

$nodeVersion = Get-NodeVersion
if (-not $nodeVersion) {
  Write-Section "Installing Node.js LTS via winget"
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  } else {
    throw "winget not found. Please install Node.js LTS manually from https://nodejs.org/ and rerun."
  }
  $nodeVersion = Get-NodeVersion
}
Write-Step "Node.js version: $nodeVersion"

# 2) Ensure ngrok agent
function Has-Ngrok { try { ngrok version | Out-Null; $true } catch { $false } }
if (-not (Has-Ngrok)) {
  Write-Section "Installing ngrok agent via winget"
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install -e --id Ngrok.Ngrok --accept-package-agreements --accept-source-agreements
  } else {
    throw "winget not found. Please install ngrok from https://ngrok.com/download and rerun."
  }
}
Write-Step "ngrok available: $((Has-Ngrok) -as [bool])"

# 3) Install npm dependencies
Write-Section "Installing npm dependencies"
if (Test-Path package-lock.json) {
  npm ci
} else {
  npm install
}

# 4) Upsert key/value pairs into .env-style files
function UpsertKV {
  param([string]$path,[hashtable]$pairs)
  if (-not (Test-Path $path)) { New-Item -ItemType File -Path $path | Out-Null }
  $content = Get-Content $path -Raw -ErrorAction SilentlyContinue
  foreach ($k in $pairs.Keys) {
    $v = $pairs[$k]
    if ($content -match "(?m)^\s*$([Regex]::Escape($k))\s*=") {
      $content = [Regex]::Replace($content,"(?m)^\s*$([Regex]::Escape($k))\s*=.*$","$k=$v")
    } else {
      if ($content.Length -gt 0 -and -not $content.EndsWith("`r`n")) { $content += "`r`n" }
      $content += "$k=$v`r`n"
    }
  }
  Set-Content -Path $path -Value $content -Encoding UTF8
}

Write-Section "Configuring environment files"
$publicUrl = "https://$Domain"

# Root .env
$rand = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([Guid]::NewGuid().ToString('N')))
UpsertKV -path ".\.env" -pairs @{
  NODE_ENV = 'development'
  PUBLIC_URL = $publicUrl
  CORS_ORIGIN = $publicUrl
  HMR_HOST = $Domain
  COOKIE_SAMESITE = 'none'
  COOKIE_SECURE = 'true'
  SESSION_SECRET = ($env:SESSION_SECRET ?? $rand)
  JWT_SECRET = ($env:JWT_SECRET ?? $rand)
}

if ($ConfigureDatabase -or $DatabaseUrl -or $DirectDatabaseUrl) {
  UpsertKV -path ".\.env" -pairs @{
    DATABASE_URL = ($DatabaseUrl ?? '')
    DIRECT_DATABASE_URL = ($DirectDatabaseUrl ?? '')
  }
}

if ($ConfigureSupabase -or $SupabaseUrl -or $SupabaseServiceKey) {
  UpsertKV -path ".\.env" -pairs @{
    SUPABASE_URL = ($SupabaseUrl ?? '')
    SUPABASE_SERVICE_KEY = ($SupabaseServiceKey ?? '')
  }
}

# Root envs used by Vite (also mirrored in client envs)
foreach ($p in @(".\.env.local",".\.env.production",".\client\.env.local",".\client\.env.production")) {
  $dir = Split-Path $p -Parent
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  UpsertKV -path $p -pairs @{ VITE_API_BASE = $publicUrl; VITE_UPLOAD_BASE = $publicUrl }
}

Write-Step ".env files updated for $publicUrl"

Write-Section "Setup complete"
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1) Authenticate ngrok: ngrok config add-authtoken <YOUR_TOKEN>" -ForegroundColor Yellow
Write-Host "  2) Start dev with reserved domain: npm run dev:ngrok" -ForegroundColor Yellow
Write-Host "  3) Open: $publicUrl" -ForegroundColor Yellow
Write-Host "Optional: Provide DATABASE_URL/DIRECT_DATABASE_URL or rerun with -ConfigureDatabase and values." -ForegroundColor Yellow

