# Check if Node.js is installed
if (!(Get-Command "node" -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Node.js is not installed. Please install it first." -ForegroundColor Red
    exit
}

# Function to check if a port is in use
function Test-Port($port) {
    $tcp = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    return $tcp -ne $null
}

Write-Host "🚀 Starting C_Building_OS..." -ForegroundColor Cyan

# 1. Start Main Server (if not running)
if (Test-Port 5000) {
    Write-Host "✅ Server is already running on port 5000" -ForegroundColor Green
} else {
    Write-Host "⏳ Starting Main Server..." -ForegroundColor Yellow
    Start-Process -FilePath "npm" -ArgumentList "run", "dev" -NoNewWindow
    # Give it a moment to initialize
    Start-Sleep -Seconds 5
}

# 2. Start Cloudflare Tunnel (if not running)
# We can't easily check the tunnel process by port since it's outbound, 
# but we can check if the tunnel script is running or just restart it.
# For simplicity in this "all-in-one" script, we will launch it in a new window 
# so it can keep running and show its output (like the URL).

Write-Host "⏳ Starting Cloudflare Tunnel..." -ForegroundColor Yellow
# We launch a separate PowerShell window for the tunnel so it stays alive 
# and so we can capture its output to generate the QR code.
# The tunnel script (tools/cf-quick-tunnel.mjs) prints the URL to stdout.

$tunnelProcess = Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "npm run tunnel:cf | Tee-Object -FilePath tunnel_output.txt" -PassThru

Write-Host "👀 Waiting for Tunnel URL..." -ForegroundColor Cyan

# Loop to read the temporary file until we find the URL
$tunnelUrl = $null
$maxRetries = 30
$retryCount = 0

while ($null -eq $tunnelUrl -and $retryCount -lt $maxRetries) {
    Start-Sleep -Seconds 2
    if (Test-Path "tunnel_output.txt") {
        $content = Get-Content "tunnel_output.txt" -Raw
        if ($content -match "https://[a-z0-9.-]+\.trycloudflare\.com") {
            $tunnelUrl = $matches[0]
        }
    }
    $retryCount++
}

if ($tunnelUrl) {
    Write-Host "`n✅ Tunnel is UP!" -ForegroundColor Green
    Write-Host "🔗 URL: $tunnelUrl" -ForegroundColor Green
    
    # Generate QR Code using a public API (simplest way without extra dependencies)
    # or just display the URL prominently.
    
    Write-Host "`n📱 SCAN THIS QR CODE WITH YOUR PHONE:" -ForegroundColor Cyan
    
    # Using 'qrencode' logic is hard in pure PS without libraries. 
    # We will use a reliable public ASCII QR generator for the terminal.
    # Note: 'curl' in PowerShell is 'Invoke-WebRequest'.
    
    try {
        $qrRequest = Invoke-WebRequest -Uri "https://api.qrserver.com/v1/create-qr-code/?data=$tunnelUrl&size=200x200" -Method Get
        # Windows Terminal doesn't render image data easily.
        # Fallback: Use qrenco.de which returns ASCII text
        
        $asciiQr = (Invoke-WebRequest -Uri "https://qrenco.de/$tunnelUrl" -UseBasicParsing).Content
        Write-Host $asciiQr
    } catch {
        Write-Host "Could not generate ASCII QR code. Please open the URL manually." -ForegroundColor Red
    }

} else {
    Write-Host "❌ Timed out waiting for Tunnel URL. Please check the other window." -ForegroundColor Red
}

# Cleanup temp file
if (Test-Path "tunnel_output.txt") { Remove-Item "tunnel_output.txt" }

Write-Host "`nPress any key to exit this launcher (Server & Tunnel will stay running)..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
