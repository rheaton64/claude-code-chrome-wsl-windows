# Start Chrome with remote debugging enabled
# This script must be run BEFORE starting the Windows host

$ChromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$UserDataDir = "$env:USERPROFILE\chrome-debug-profile"
$DebugPort = 9222

Write-Host "Starting Chrome with remote debugging on port $DebugPort..." -ForegroundColor Cyan

# Kill existing Chrome processes
$chromeProcesses = Get-Process -Name chrome -ErrorAction SilentlyContinue
if ($chromeProcesses) {
    Write-Host "Stopping existing Chrome processes..." -ForegroundColor Yellow
    Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue
    Start-Sleep 2
}

# Start Chrome with debugging
Write-Host "Launching Chrome..." -ForegroundColor Green
Start-Process $ChromePath -ArgumentList "--remote-debugging-port=$DebugPort", "--user-data-dir=$UserDataDir"

Write-Host ""
Write-Host "Chrome started with debugging enabled!" -ForegroundColor Green
Write-Host "Debug port: $DebugPort" -ForegroundColor Cyan
Write-Host "User data dir: $UserDataDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "Now run: .\start-host.ps1" -ForegroundColor Yellow
