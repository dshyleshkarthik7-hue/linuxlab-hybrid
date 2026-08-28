```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$IsoBuilder  = $PSScriptRoot

$WorkRootWin = Join-Path $IsoBuilder "work"
$OutputRoot  = Join-Path $ProjectRoot "public"

$BashFile = Join-Path $IsoBuilder "build-linuxlab-gcc.sh"

Write-Host ""
Write-Host "============================================================"
Write-Host " LinuxLab Engine B - Alpine GCC ISO Builder"
Write-Host "============================================================"
Write-Host ""

Write-Host "Project root : $ProjectRoot"
Write-Host "Work         : $WorkRootWin"
Write-Host "Output       : $OutputRoot"
Write-Host "Bash builder : $BashFile"
Write-Host ""

# ------------------------------------------------------------
# Required directories
# ------------------------------------------------------------

New-Item -ItemType Directory -Force -Path $WorkRootWin | Out-Null
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

# ------------------------------------------------------------
# Bash builder must already exist
# ------------------------------------------------------------

if (-not (Test-Path -LiteralPath $BashFile -PathType Leaf)) {
    throw "Bash builder not found: $BashFile"
}

# ------------------------------------------------------------
# Find WSL
# ------------------------------------------------------------

$wslCommand = Get-Command wsl.exe -ErrorAction SilentlyContinue

if (-not $wslCommand) {
    throw "wsl.exe was not found."
}

# ------------------------------------------------------------
# Use Ubuntu
# ------------------------------------------------------------

$Distro = "Ubuntu"

$UbuntuCheck = wsl.exe -d $Distro -- bash -c "echo WSL-OK" 2>&1

if ($LASTEXITCODE -ne 0) {
    throw "WSL distribution '$Distro' could not be started. Output: $UbuntuCheck"
}

# ------------------------------------------------------------
# Convert Windows path to WSL path
# ------------------------------------------------------------

$BashFileFull = (Resolve-Path -LiteralPath $BashFile).Path
$OutputFull   = (Resolve-Path -LiteralPath $OutputRoot).Path

$BashWsl = (
    wsl.exe -d $Distro -- wslpath -a "$BashFileFull"
).Trim()

$OutputWsl = (
    wsl.exe -d $Distro -- wslpath -a "$OutputFull"
).Trim()

if ([string]::IsNullOrWhiteSpace($BashWsl)) {
    throw "Could not convert Bash builder path to WSL path."
}

if ([string]::IsNullOrWhiteSpace($OutputWsl)) {
    throw "Could not convert output path to WSL path."
}

Write-Host "WSL distribution : $Distro"
Write-Host "Bash WSL path     : $BashWsl"
Write-Host "Output WSL path   : $OutputWsl"
Write-Host ""

# ------------------------------------------------------------
# Check Bash syntax
# ------------------------------------------------------------

Write-Host "[1/5] Checking Bash syntax..."

wsl.exe -d $Distro -- bash -n "$BashWsl"

if ($LASTEXITCODE -ne 0) {
    throw "Bash syntax check failed."
}

Write-Host "Bash syntax: OK" -ForegroundColor Green

# ------------------------------------------------------------
# Make executable
# ------------------------------------------------------------

Write-Host ""
Write-Host "[2/5] Making Bash builder executable..."

wsl.exe -d $Distro -- chmod +x "$BashWsl"

if ($LASTEXITCODE -ne 0) {
    throw "Could not chmod Bash builder."
}

# ------------------------------------------------------------
# Linux-native build directory
# ------------------------------------------------------------

$WslWork = "/tmp/linuxlab-gcc-build"

Write-Host ""
Write-Host "[3/5] Preparing Linux-native WSL build directory..."
Write-Host "Linux work directory: $WslWork"

wsl.exe -d $Distro -- bash -c "rm -rf '$WslWork' && mkdir -p '$WslWork'"

if ($LASTEXITCODE -ne 0) {
    throw "Could not prepare WSL build directory."
}

# ------------------------------------------------------------
# Remove previous Windows ISO
# ------------------------------------------------------------

$Iso = Join-Path $OutputRoot "alpine.iso"

if (Test-Path -LiteralPath $Iso) {
    Write-Host "Removing previous ISO..."
    Remove-Item -LiteralPath $Iso -Force
}

# ------------------------------------------------------------
# Run builder
# ------------------------------------------------------------

Write-Host ""
Write-Host "[4/5] Running LinuxLab Alpine GCC builder..."
Write-Host ""

wsl.exe -d $Distro -- bash "$BashWsl" "$WslWork" "$OutputWsl"

$BuildExitCode = $LASTEXITCODE

if ($BuildExitCode -ne 0) {
    throw "LinuxLab ISO build failed with exit code $BuildExitCode."
}

# ------------------------------------------------------------
# Verify ISO
# ------------------------------------------------------------

Write-Host ""
Write-Host "[5/5] Verifying generated ISO..."

if (-not (Test-Path -LiteralPath $Iso -PathType Leaf)) {
    throw "Build reported success but ISO does not exist: $Iso"
}

$Size = (Get-Item -LiteralPath $Iso).Length

if ($Size -lt 1MB) {
    throw "Generated ISO is unexpectedly small: $Size bytes"
}

Write-Host ""
Write-Host "============================================================"
Write-Host " SUCCESS"
Write-Host "============================================================"
Write-Host ""
Write-Host "ISO : $Iso"
Write-Host ("Size: {0:N1} MB" -f ($Size / 1MB))
Write-Host ""
```
