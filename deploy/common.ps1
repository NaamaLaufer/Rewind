# Shared helpers, dot-sourced by every deploy script. Never prints a secret.
# "Continue", not "Stop": gcloud/atlas/docker write normal progress to stderr, and Windows
# PowerShell 5.1 turns every stderr line into a terminating error under "Stop". Instead every
# native call checks its exit code and throws on failure (Gc), and cmdlets use -ErrorAction Stop.
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "config.ps1")

# Portable CLIs installed by deploy\install-tools.ps1 (no admin rights needed).
$Tools = Join-Path $env:LOCALAPPDATA "rewind-tools"
foreach ($p in @("$Tools\google-cloud-sdk\bin", "$Tools\atlas\bin", "$Tools\gh\bin")) {
    if ((Test-Path $p) -and ($env:PATH -notlike "*$p*")) { $env:PATH = "$p;$env:PATH" }
}
$env:CLOUDSDK_CORE_DISABLE_PROMPTS = "1"
# Windows PowerShell 5.1 defaults to TLS 1.0/1.1; the Google load balancer needs TLS 1.2+.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$AR = "$REGION-docker.pkg.dev/$GCP_PROJECT_ID/rewind"
$BACKEND_SA = "rewind-backend@$GCP_PROJECT_ID.iam.gserviceaccount.com"
$FRONTEND_SA = "rewind-frontend@$GCP_PROJECT_ID.iam.gserviceaccount.com"
$script:IsDryRun = $false

function Step([string]$t) { Write-Host ""; Write-Host "==> $t" -ForegroundColor Cyan }
function Ok([string]$t) { Write-Host "    OK  $t" -ForegroundColor Green }
function Info([string]$t) { Write-Host "    ..  $t" }
function Warn([string]$t) { Write-Host "    !!  $t" -ForegroundColor Yellow }

# Run a gcloud command, stop the script if it fails. -DryRun prints it instead.
function GcRun {
    $a = @($args)
    if ($script:IsDryRun) { Write-Host "    [dry-run] gcloud $($a -join ' ')" -ForegroundColor DarkGray; return }
    & gcloud @a --quiet 2>&1 | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
    if ($LASTEXITCODE -ne 0) { throw "gcloud $($a[0..2] -join ' ') ... failed (exit $LASTEXITCODE)" }
}

# gcloud command whose output we need (e.g. a describe with --format).
function GcOut {
    $a = @($args)
    if ($script:IsDryRun) { return "" }
    $o = & gcloud @a --quiet 2>$null
    if ($LASTEXITCODE -ne 0) { return "" }
    return ($o -join "`n").Trim()
}

# True when "gcloud <describe ...>" succeeds, i.e. the resource already exists. In dry-run: false.
function Exists {
    $a = @($args)
    if ($script:IsDryRun) { return $false }
    & gcloud @a --quiet 2>&1 | Out-Null
    return ($LASTEXITCODE -eq 0)
}

# Write a value to a temp file WITHOUT a trailing newline (PowerShell adds one otherwise),
# run the block with the path, and always delete the file.
function With-TempSecretFile([string]$value, [scriptblock]$block) {
    $tmp = Join-Path $env:TEMP ("rw-" + [guid]::NewGuid().ToString("N") + ".tmp")
    try {
        [IO.File]::WriteAllText($tmp, $value)  # no BOM, no trailing newline
        & $block $tmp
    } finally {
        Remove-Item -Force -ErrorAction SilentlyContinue $tmp
    }
}

# Random alphanumeric string from a cryptographic RNG.
function New-RandomAlnum([int]$length = 32) {
    $chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".ToCharArray()
    $bytes = New-Object byte[] ($length * 2)
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $sb = New-Object System.Text.StringBuilder
    foreach ($b in $bytes) {
        if ($b -lt 248) { [void]$sb.Append($chars[$b % 62]) }  # 248 = 4*62: no modulo bias
        if ($sb.Length -eq $length) { break }
    }
    if ($sb.Length -lt $length) { return New-RandomAlnum $length }
    return $sb.ToString()
}

function New-RandomHex([int]$bytes = 32) {
    $buf = New-Object byte[] $bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
    return (($buf | ForEach-Object { $_.ToString("x2") }) -join "")
}

# Stop with a clear message when config.ps1 still has placeholders.
function Assert-Config {
    $missing = @()
    if ($GCP_PROJECT_ID -like "*TODO_USER*") { $missing += '$GCP_PROJECT_ID' }
    if ($DOMAIN -like "*TODO_USER*") { $missing += '$DOMAIN' }
    if ($missing.Count) {
        throw "deploy\config.ps1: fill $($missing -join ', ') first (see docs\USER_TODO.md)."
    }
}

# Stop with a clear message when gcloud is missing / not logged in / on another project.
function Assert-Gcloud {
    if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
        throw "gcloud not found. Run: powershell -ExecutionPolicy Bypass -File deploy\install-tools.ps1"
    }
    if ($script:IsDryRun) { return }
    $acct = GcOut auth list --filter=status:ACTIVE --format="value(account)"
    if (-not $acct) { throw "gcloud is not logged in. Run: gcloud auth login   (then run this script again)" }
    & gcloud config set project $GCP_PROJECT_ID --quiet *> $null
    Ok "gcloud: $acct, project $GCP_PROJECT_ID"
}

function Show-IpBanner([string]$ip) {
    $line = "#" * 72
    Write-Host ""
    Write-Host $line -ForegroundColor Magenta
    Write-Host "#" -ForegroundColor Magenta
    Write-Host "#   STATIC IP OF THE LOAD BALANCER:   $ip" -ForegroundColor Magenta
    Write-Host "#" -ForegroundColor Magenta
    Write-Host "#   >>> No-IP: set the hostname $DOMAIN" -ForegroundColor Magenta
    Write-Host "#   >>> to ONE A record with the IP $ip <<<" -ForegroundColor Magenta
    Write-Host "#" -ForegroundColor Magenta
    Write-Host $line -ForegroundColor Magenta
    Write-Host ""
}
