# Stop Chrome Bridge - All Components
# Cleanly shuts down Chrome and the Windows host
# NOTE: Only kills processes on our specific ports, safe for other node apps

$ErrorActionPreference = "SilentlyContinue"

Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "  Stopping Chrome Bridge" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""

# Find and kill ONLY the node process on port 19222 (our host)
$hostProcs = Get-NetTCPConnection -LocalPort 19222 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($hostProcs) {
    foreach ($proc in $hostProcs) {
        Write-Host "[..] Stopping Windows host (PID: $proc)..." -ForegroundColor Yellow
        Stop-Process -Id $proc -Force -ErrorAction SilentlyContinue
    }
    Write-Host "[OK] Windows host stopped" -ForegroundColor Green
} else {
    Write-Host "[--] Windows host not running" -ForegroundColor Gray
}

# Optionally stop Chrome (ask user)
$chromeProcs = Get-Process -Name chrome -ErrorAction SilentlyContinue
if ($chromeProcs) {
    Write-Host ""
    $response = Read-Host "Stop Chrome as well? (y/N)"
    if ($response -eq 'y' -or $response -eq 'Y') {
        Write-Host "[..] Stopping Chrome..." -ForegroundColor Yellow
        Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue
        Write-Host "[OK] Chrome stopped" -ForegroundColor Green
    } else {
        Write-Host "[--] Chrome left running" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Chrome Bridge Stopped" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Note: Other node processes were not affected." -ForegroundColor Gray
Write-Host ""
