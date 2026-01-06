# Start the Windows CDP Host
# This script should be run AFTER Chrome is started with debugging

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Starting Windows CDP Host..." -ForegroundColor Cyan
Write-Host ""

# Check if Chrome debugging port is accessible
try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:9222/json/version" -UseBasicParsing -TimeoutSec 5
    Write-Host "Chrome debugging port is accessible!" -ForegroundColor Green
} catch {
    Write-Host "WARNING: Chrome debugging port (9222) is not accessible!" -ForegroundColor Red
    Write-Host "Make sure Chrome is running with --remote-debugging-port=9222" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Run: .\start-chrome.ps1" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "Starting host on WebSocket port 19222..." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

# Start the host
Set-Location $ScriptDir
node src/index.js
