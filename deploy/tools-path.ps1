# Dot-source in a terminal to use the portable CLIs:   . .\deploy\tools-path.ps1
$t = Join-Path $env:LOCALAPPDATA "rewind-tools"
foreach ($p in @("$t\google-cloud-sdk\bin", "$t\atlas\bin", "$t\gh\bin")) {
    if ((Test-Path $p) -and ($env:PATH -notlike "*$p*")) { $env:PATH = "$p;$env:PATH" }
}
Write-Host "gcloud / atlas / gh are on PATH for this terminal."
