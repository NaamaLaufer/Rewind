<#
.SYNOPSIS
  Installs portable gcloud, Atlas CLI and GitHub CLI into %LOCALAPPDATA%\rewind-tools.
  No admin rights, no installer. The deploy scripts add these to PATH by themselves.
  For a normal terminal, run afterwards:  . .\deploy\tools-path.ps1
#>
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$dst = Join-Path $env:LOCALAPPDATA "rewind-tools"
New-Item -ItemType Directory -Force $dst | Out-Null

if (-not (Test-Path "$dst\google-cloud-sdk\bin\gcloud.cmd")) {
    Write-Host "gcloud (Google Cloud CLI, bundled Python)..."
    $z = Join-Path $env:TEMP "gcloud.zip"
    Invoke-WebRequest "https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-windows-x86_64-bundled-python.zip" -OutFile $z
    Expand-Archive $z -DestinationPath $dst -Force; Remove-Item $z
}
if (-not (Test-Path "$dst\atlas\bin\atlas.exe")) {
    Write-Host "Atlas CLI..."
    $rel = Invoke-RestMethod "https://api.github.com/repos/mongodb/mongodb-atlas-cli/releases?per_page=20"
    $a = ($rel | Where-Object { $_.tag_name -like "atlascli/*" } | Select-Object -First 1).assets | Where-Object { $_.name -like "*windows_x86_64.zip" } | Select-Object -First 1
    $z = Join-Path $env:TEMP "atlas.zip"
    Invoke-WebRequest $a.browser_download_url -OutFile $z
    Expand-Archive $z -DestinationPath "$dst\atlas" -Force; Remove-Item $z
}
if (-not (Test-Path "$dst\gh\bin\gh.exe")) {
    Write-Host "GitHub CLI..."
    $g = (Invoke-RestMethod "https://api.github.com/repos/cli/cli/releases/latest").assets | Where-Object { $_.name -like "*windows_amd64.zip" } | Select-Object -First 1
    $z = Join-Path $env:TEMP "gh.zip"
    Invoke-WebRequest $g.browser_download_url -OutFile $z
    Expand-Archive $z -DestinationPath "$dst\gh" -Force; Remove-Item $z
}
. (Join-Path $PSScriptRoot "tools-path.ps1")
gcloud --version | Select-Object -First 1
atlas --version | Select-Object -First 1
gh --version | Select-Object -First 1
