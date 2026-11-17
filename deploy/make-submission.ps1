<#
.SYNOPSIS
  Writes submission\<PROJECT_SLUG>.json from deploy\config.ps1 and validates it:
  valid JSON, file name == "project", domain = https://<host> without a trailing slash.
#>
. (Join-Path $PSScriptRoot "common.ps1")
$domainUrl = "https://$DOMAIN".TrimEnd("/")
$obj = [ordered]@{ project = $PROJECT_SLUG; domain = $domainUrl; members = @($MEMBERS) }
$path = Join-Path $Root "submission\$PROJECT_SLUG.json"
New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null
[IO.File]::WriteAllText($path, ($obj | ConvertTo-Json -Depth 3) + "`n", (New-Object Text.UTF8Encoding $false))

# ---- validation ----
$j = Get-Content -Raw -Encoding utf8 $path | ConvertFrom-Json
$problems = @()
if ([IO.Path]::GetFileNameWithoutExtension($path) -ne $j.project) { $problems += "file name != project" }
if ($j.project -notmatch "^[a-z0-9-]+$") { $problems += "project must be English, no spaces" }
if ($j.domain -notmatch "^https://[^/]+$") { $problems += "domain must be https://<host> without a trailing /" }
if (@($j.members).Count -lt 1) { $problems += "members is empty" }
$todo = (Get-Content -Raw $path) -match "TODO_USER"
Get-Content -Raw $path
if ($problems) { Warn ("invalid: " + ($problems -join "; ")); exit 1 }
if ($todo) { Warn "valid JSON, but it still contains TODO_USER: fill deploy\config.ps1 (`$DOMAIN, `$MEMBERS) and run this again"; exit 2 }
Ok "submission\$PROJECT_SLUG.json is valid"
