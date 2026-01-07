# Start Chrome Bridge - All Components
# Run this before using browser automation in Claude Code
#
# Usage:
#   .\start-all.ps1                    # Use debug profile, kill Chrome only if needed
#   .\start-all.ps1 -Profile debug     # Same as above
#   .\start-all.ps1 -Profile work      # Use named profile "work"
#   .\start-all.ps1 -NoKill            # Never kill Chrome, fail if can't start
#
# Profiles are stored in: %USERPROFILE%\chrome-debug-profile-<name>

param(
    [string]$Profile = "debug",
    [switch]$NoKill
)

$ErrorActionPreference = "SilentlyContinue"
$ChromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$HostPath = "$PSScriptRoot\src\index.js"

# Set user data directory based on profile name
$UserDataDir = "$env:USERPROFILE\chrome-debug-profile-$Profile"
$ProfileName = $Profile

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Chrome Bridge Startup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Profile: $ProfileName" -ForegroundColor Gray
Write-Host "Data dir: $UserDataDir" -ForegroundColor DarkGray
Write-Host ""

# Check if Chrome debugging port is already active
$chromeDebug = netstat -an | findstr ":9222.*LISTENING"
if ($chromeDebug) {
    Write-Host "[OK] Chrome already running with debugging" -ForegroundColor Green
} else {
    # Check if Chrome is running without debugging
    $chromeRunning = Get-Process -Name chrome -ErrorAction SilentlyContinue

    if ($chromeRunning) {
        if ($NoKill) {
            Write-Host "[FAIL] Chrome is running without debugging" -ForegroundColor Red
            Write-Host "       Close Chrome manually or run without -NoKill flag" -ForegroundColor Gray
            exit 1
        }
        Write-Host "[..] Chrome running without debugging, restarting..." -ForegroundColor Yellow
        Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue
        Start-Sleep 2
    } else {
        Write-Host "[..] Starting Chrome with debugging..." -ForegroundColor Yellow
    }

    $chromeArgs = @("--remote-debugging-port=9222", "--user-data-dir=`"$UserDataDir`"")
    Start-Process $ChromePath -ArgumentList $chromeArgs
    Start-Sleep 3

    # Verify
    $chromeDebug = netstat -an | findstr ":9222.*LISTENING"
    if ($chromeDebug) {
        Write-Host "[OK] Chrome started successfully" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Chrome failed to start with debugging" -ForegroundColor Red
        Write-Host "       Try closing all Chrome windows and run again" -ForegroundColor Gray
        exit 1
    }
}

# Check if Windows host is already running
$hostRunning = netstat -an | findstr ":19222.*LISTENING"
if ($hostRunning) {
    Write-Host "[OK] Windows host already running" -ForegroundColor Green
} else {
    Write-Host "[..] Starting Windows host..." -ForegroundColor Yellow

    # Kill any existing node processes on our port
    $nodeProcs = Get-NetTCPConnection -LocalPort 19222 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
    foreach ($proc in $nodeProcs) {
        Stop-Process -Id $proc -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep 1

    Start-Process node -ArgumentList $HostPath -WindowStyle Hidden
    Start-Sleep 3

    # Verify
    $hostRunning = netstat -an | findstr ":19222.*LISTENING"
    if ($hostRunning) {
        Write-Host "[OK] Windows host started successfully" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Windows host failed to start" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Chrome Bridge Ready!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Chrome debugging: localhost:9222" -ForegroundColor Gray
Write-Host "WebSocket bridge: localhost:19222" -ForegroundColor Gray
Write-Host ""
Write-Host "You can now use browser tools in Claude Code (WSL)" -ForegroundColor Cyan
Write-Host ""
