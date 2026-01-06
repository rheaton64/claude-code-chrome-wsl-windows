# Claude Chrome Bridge - Windows Native Host Installer
# Run this script as Administrator in PowerShell

$ErrorActionPreference = "Stop"

Write-Host "Claude Chrome Bridge - Windows Native Host Installer" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""

# Get the directory where this script is located
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$HostDir = $ScriptDir

# Paths
$NativeHostName = "com.anthropic.claude_code_browser_extension"
$ChromeNMHDir = "$env:LOCALAPPDATA\Google\Chrome\User Data\NativeMessagingHosts"
$ManifestPath = "$ChromeNMHDir\$NativeHostName.json"

# Create a batch file to run the Node.js host
$BatchPath = "$HostDir\run-host.bat"
$BatchContent = @"
@echo off
cd /d "$HostDir"
node src\index.js
"@

Write-Host "Step 1: Creating launcher batch file..." -ForegroundColor Yellow
Set-Content -Path $BatchPath -Value $BatchContent -Encoding ASCII
Write-Host "  Created: $BatchPath" -ForegroundColor Green

# Create native messaging hosts directory if it doesn't exist
Write-Host ""
Write-Host "Step 2: Setting up Chrome Native Messaging Hosts directory..." -ForegroundColor Yellow
if (-not (Test-Path $ChromeNMHDir)) {
    New-Item -ItemType Directory -Path $ChromeNMHDir -Force | Out-Null
    Write-Host "  Created: $ChromeNMHDir" -ForegroundColor Green
} else {
    Write-Host "  Directory exists: $ChromeNMHDir" -ForegroundColor Green
}

# Create the manifest file
Write-Host ""
Write-Host "Step 3: Creating native messaging host manifest..." -ForegroundColor Yellow

$Manifest = @{
    name = $NativeHostName
    description = "Claude Code Chrome Bridge - Windows Native Host"
    path = $BatchPath
    type = "stdio"
    allowed_origins = @(
        "chrome-extension://fcoeoabgfenejglbffodgkkbkcdhcgfn/"
    )
}

$ManifestJson = $Manifest | ConvertTo-Json -Depth 10
Set-Content -Path $ManifestPath -Value $ManifestJson -Encoding UTF8
Write-Host "  Created: $ManifestPath" -ForegroundColor Green

# Verify installation
Write-Host ""
Write-Host "Step 4: Verifying installation..." -ForegroundColor Yellow

$Checks = @(
    @{ Path = $BatchPath; Name = "Launcher script" },
    @{ Path = $ManifestPath; Name = "Chrome manifest" },
    @{ Path = "$HostDir\src\index.js"; Name = "Host entry point" }
)

$AllGood = $true
foreach ($Check in $Checks) {
    if (Test-Path $Check.Path) {
        Write-Host "  [OK] $($Check.Name)" -ForegroundColor Green
    } else {
        Write-Host "  [MISSING] $($Check.Name): $($Check.Path)" -ForegroundColor Red
        $AllGood = $false
    }
}

# Check if node is available
Write-Host ""
Write-Host "Step 5: Checking Node.js installation..." -ForegroundColor Yellow
try {
    $NodeVersion = & node --version 2>&1
    Write-Host "  [OK] Node.js $NodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  [WARNING] Node.js not found in PATH" -ForegroundColor Red
    Write-Host "  Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    $AllGood = $false
}

# Install npm dependencies
Write-Host ""
Write-Host "Step 6: Installing npm dependencies..." -ForegroundColor Yellow
Push-Location $HostDir
try {
    & npm install 2>&1 | Out-Null
    Write-Host "  [OK] Dependencies installed" -ForegroundColor Green
} catch {
    Write-Host "  [WARNING] Failed to install dependencies" -ForegroundColor Red
    Write-Host "  Run 'npm install' manually in: $HostDir" -ForegroundColor Yellow
}
Pop-Location

# Summary
Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
if ($AllGood) {
    Write-Host "Installation completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Restart Chrome if it's running" -ForegroundColor White
    Write-Host "2. Install the 'Claude in Chrome' extension if not already installed" -ForegroundColor White
    Write-Host "3. In WSL, start the bridge: claude-chrome-bridge" -ForegroundColor White
    Write-Host "4. In WSL, start Claude Code: claude" -ForegroundColor White
} else {
    Write-Host "Installation completed with warnings." -ForegroundColor Yellow
    Write-Host "Please review the warnings above." -ForegroundColor Yellow
}
Write-Host ""
