# C_Building_OS Installer for Windows

Write-Host "📦 C_Building_OS Installer" -ForegroundColor Cyan
Write-Host "==========================" -ForegroundColor Cyan

# 1. Check for Node.js
Write-Host "`n🔍 Checking for Node.js..." -ForegroundColor Yellow
if (Get-Command "node" -ErrorAction SilentlyContinue) {
    $nodeVer = node --version
    Write-Host "✅ Node.js is installed ($nodeVer)" -ForegroundColor Green
} else {
    Write-Host "❌ Node.js is NOT installed." -ForegroundColor Red
    Write-Host "👉 Please download and install the LTS version from: https://nodejs.org/"
    Write-Host "   After installing, restart PowerShell and run this script again."
    exit
}

# 2. Install Project Dependencies
Write-Host "`n📥 Installing project dependencies (this may take a minute)..." -ForegroundColor Yellow
try {
    npm install
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Dependencies installed successfully!" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to install dependencies." -ForegroundColor Red
        exit
    }
} catch {
    Write-Host "❌ Error executing npm install." -ForegroundColor Red
    exit
}

# 3. Setup Database (Drizzle)
Write-Host "`n🗄️ Setting up the database..." -ForegroundColor Yellow
try {
    # Check if we need to run push or generate first. 
    # Usually 'db:push' syncs the schema to the SQLite/PG file.
    npm run db:push
    Write-Host "✅ Database schema synced!" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Database setup encountered an issue. You might need to check .env settings." -ForegroundColor Yellow
}

# 4. Tailscale Recommendation
Write-Host "`n🌐 [Optional] Tailscale Setup for Permanent URL" -ForegroundColor Cyan
Write-Host "   If you want a permanent link (e.g. http://bedi:5000) instead of a changing one:"
Write-Host "   1. Download Tailscale: https://tailscale.com/download/windows"
Write-Host "   2. Install & Log in."
Write-Host "   3. That's it! Your PC name is your website address."

Write-Host "`n✅ Setup Complete!" -ForegroundColor Green
Write-Host "👉 You can now run the app using: .\scripts\start-app.ps1"
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
