[CmdletBinding()]
param(
  [string]$Domain = "nonstriped-jocelyn-nonnormal.ngrok-free.app",
  [switch]$Aggressive # also remove optional/CI artifacts if present
)

$ErrorActionPreference = 'Stop'

function Write-Section($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Step($msg) { Write-Host "[cleanup] $msg" -ForegroundColor Gray }

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

$publicUrl = "https://$Domain"

Write-Section "Ensure env files pin reserved domain"
foreach ($p in @(".\.env",".\.env.local",".\.env.production",".\client\.env.local",".\client\.env.production")) {
  switch -Regex ($p) {
    '^\.\\\.env$' {
      UpsertKV -path $p -pairs @{ PUBLIC_URL = $publicUrl; CORS_ORIGIN = $publicUrl; HMR_HOST = $Domain }
    }
    default {
      UpsertKV -path $p -pairs @{ VITE_API_BASE = $publicUrl; VITE_UPLOAD_BASE = $publicUrl }
    }
  }
  Write-Step "Updated $p"
}

Write-Section "Normalize package.json dev:ngrok"
$pkgPath = Join-Path (Get-Location) 'package.json'
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
if (-not $pkg.scripts) { $pkg | Add-Member -MemberType NoteProperty -Name scripts -Value (@{}) }
$pkg.scripts.'dev:ngrok' = "node ./scripts/dev-with-ngrok.mjs --domain $Domain --port 5000"
$removeScripts = @('android','android:auto','android:run','android:install','android:open','android:sync')
foreach ($k in $removeScripts) {
  if ($pkg.scripts.PSObject.Properties.Name -contains $k) {
    $pkg.scripts.PSObject.Properties.Remove($k) | Out-Null
  }
}

# Prune unused deps
foreach ($dep in '@capacitor/android','@capacitor/geolocation') {
  if ($pkg.dependencies -and ($pkg.dependencies.PSObject.Properties.Name -contains $dep)) {
    $pkg.dependencies.PSObject.Properties.Remove($dep) | Out-Null
  }
}
foreach ($dep in '@capacitor/cli','@capacitor/core') {
  if ($pkg.devDependencies -and ($pkg.devDependencies.PSObject.Properties.Name -contains $dep)) {
    $pkg.devDependencies.PSObject.Properties.Remove($dep) | Out-Null
  }
}
$json = $pkg | ConvertTo-Json -Depth 10
Set-Content -Path $pkgPath -Value $json -Encoding UTF8
Write-Step "dev:ngrok now targets https://$Domain"

Write-Section "Normalize scripts/dev-with-ngrok.cmd"
$cmdPath = 'scripts/dev-with-ngrok.cmd'
if (Test-Path $cmdPath) {
  $content = Get-Content $cmdPath -Raw
  $content = [Regex]::Replace($content, '(?m)^set DOMAIN=.*$', "set DOMAIN=$Domain")
  Set-Content -Path $cmdPath -Value $content -Encoding UTF8
  Write-Step "Updated $cmdPath"
}

Write-Section "Remove scratch/editor artifacts"
$toDelete = @(
  'tmp_audio_section.txt',
  '.local', # replit artifacts
  'scripts/start-dev.ps1', # redundant now that dev-with-ngrok is used
  'android-plugin',
  'capacitor.config.ts',
  'deno.json',
  'deno_main.ts',
  'tmp_audio_section2.txt',
  'tmp_storage_section.txt'
)
foreach ($p in $toDelete) {
  if (Test-Path $p) {
    Remove-Item -Recurse -Force $p
    Write-Step "Deleted $p"
  }
}

if ($Aggressive) {
  # Optional CI or unused files; remove only if user opts-in
  $optional = @(
    '.github/workflows/deno-deploy.yml'
  )
  foreach ($p in $optional) { if (Test-Path $p) { Remove-Item -Recurse -Force $p; Write-Step "Deleted $p" } }
}

Write-Section "Cleanup complete"
Write-Host "Pinned domain: $publicUrl" -ForegroundColor Yellow
Write-Host "Run: npm run dev:ngrok" -ForegroundColor Yellow
