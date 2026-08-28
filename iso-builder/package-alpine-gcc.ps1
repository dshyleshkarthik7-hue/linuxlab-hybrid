$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "build-alpine-gcc.ps1")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
