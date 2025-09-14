[CmdletBinding()]
param(
  [int]$Port = 5000
)

$ErrorActionPreference = 'Stop'

Write-Host "Starting ngrok on port $Port..."
# Support reserved domain via NGROK_DOMAIN; fallback to random domain
$ngrokArgs = @("http")
if ($env:NGROK_DOMAIN -and $env:NGROK_DOMAIN.Trim().Length -gt 0) {
  $ngrokArgs += @("--domain", $env:NGROK_DOMAIN)
}
$ngrokArgs += "$Port"
$ngrok = Start-Process -FilePath "ngrok" -ArgumentList $ngrokArgs -WindowStyle Minimized -PassThru

# Poll ngrok's local API for the https public URL
$publicUrl = $null
$api = "http://127.0.0.1:4040/api/tunnels"
Write-Host "Waiting for ngrok public URL from $api ..."
for ($i=0; $i -lt 60; $i++) {
  try {
    $resp = Invoke-RestMethod -Uri $api -Method GET -TimeoutSec 2
    $https = $resp.tunnels | Where-Object { $_.public_url -like "https://*" } | Select-Object -First 1
    if ($https) { $publicUrl = $https.public_url; break }
  } catch { Start-Sleep -Milliseconds 500 }
  Start-Sleep -Milliseconds 500
}
if (-not $publicUrl) { Write-Error "Could not obtain public URL from ngrok API"; exit 1 }
Write-Host "ngrok public URL: $publicUrl"  # e.g., https://abc123.ngrok-free.app

# Upsert key=val lines into env files
function UpsertKV {
  param([string]$path,[hashtable]$pairs)
  if (-not (Test-Path $path)) { New-Item -ItemType File -Path $path | Out-Null }
  $content = Get-Content $path -Raw
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

# Root .env (if the server reads PUBLIC_URL)
UpsertKV -path ".\.env" -pairs @{ PUBLIC_URL = $publicUrl }

# Frontend envs (both possible locations)
foreach ($p in @(".\.env.local",".\.env.production",".\client\.env.local",".\client\.env.production")) {
  UpsertKV -path $p -pairs @{ VITE_API_BASE = $publicUrl; VITE_UPLOAD_BASE = $publicUrl }
}

Write-Host "Updated .env, .env.local, .env.production with $publicUrl"

# Optionally publish current API base to a public JSON (used by the Deno site)
# Requires env vars:
#   SUPABASE_URL          e.g. https://mfasiuftsrjvfjyrqjhk.supabase.co
#   SUPABASE_SERVICE_KEY  Service role key with Storage write access
try {
  if ($env:SUPABASE_URL -and $env:SUPABASE_SERVICE_KEY) {
    $bucket = 'config'
    $object = 'api.json'
    $cfgUrl = "$($env:SUPABASE_URL.TrimEnd('/'))/storage/v1/object/public/$bucket/$object"
    Write-Host "Publishing API config to Supabase Storage: $cfgUrl"
    # Publish using direct REST call (avoids path issues with external script)
    # Set cacheControl=0 to minimize CDN caching of the public object
    $uri = "$($env:SUPABASE_URL.TrimEnd('/'))/storage/v1/object/$bucket/$object?cacheControl=0"
    $body = @{ apiBase = $publicUrl; uploadBase = $publicUrl; updatedAt = (Get-Date -Format o) } | ConvertTo-Json -Depth 3
    $headers = @{
      'Authorization' = "Bearer $($env:SUPABASE_SERVICE_KEY)"
      'Content-Type'  = 'application/json'
      'x-upsert'      = 'true'
    }
    Write-Host "[supabase] PUT $uri"
    Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $body -ErrorAction Stop | Out-Null

    # Verify that the public JSON reflects the latest URL
    try {
      # Bust CDN caches when verifying by appending a timestamp query param
      $verifyHeaders = @{ 'Cache-Control' = 'no-cache' }
      $verifyUrl = "$cfgUrl?v=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
      $fetched = Invoke-RestMethod -Uri $verifyUrl -Method GET -Headers $verifyHeaders -TimeoutSec 10
      $apiBase = ($fetched | Select-Object -ExpandProperty apiBase -ErrorAction SilentlyContinue)
      $uploadBase = ($fetched | Select-Object -ExpandProperty uploadBase -ErrorAction SilentlyContinue)
      Write-Host ("Verified config: apiBase={0}, uploadBase={1}" -f $apiBase, $uploadBase)
      if ($apiBase -ne $publicUrl) {
        Write-Warning ("Config apiBase does not match current ngrok URL. Config={0} Ngrok={1}" -f $apiBase, $publicUrl)
      }
    } catch {
      Write-Warning "Could not fetch public config to verify update: $($_.Exception.Message)"
    }
  } else {
    Write-Host "SUPABASE_URL / SUPABASE_SERVICE_KEY not set; skipping publish of API config"
  }
} catch {
  Write-Warning "Failed to publish API config: $($_.Exception.Message)"
}

# Ensure database schema is ready before starting the server
try {
  Write-Host "Ensuring database schema (users default times) ..."
  # Warn if using Supabase pooler for DDL without a direct URL available
  if ($env:DATABASE_URL -and -not $env:DIRECT_DATABASE_URL -and ($env:DATABASE_URL -match 'pooler\.supabase\.com')) {
    Write-Warning "DATABASE_URL points to Supabase pooler; DDL may fail. Set DIRECT_DATABASE_URL to the non-pooled connection string for setup."
  }
  # Lightweight, safe DDL that only adds missing columns
  npx tsx tools/ensure-db.ts
} catch {
  Write-Warning "DB ensure step failed: $($_.Exception.Message)"
}

# Start dev server
Write-Host "Starting dev server: npm run dev"
npm run dev
