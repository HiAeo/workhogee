$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
python restore.py
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
