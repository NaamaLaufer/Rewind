<#
.SYNOPSIS
  End-to-end verification of the cloud deployment (assignment 4 grading table).
  Writes the results to docs\A4_VERIFY_RESULTS.md.
.EXAMPLE
  .\deploy\verify.ps1              # full check against https://$DOMAIN (certificate must be ACTIVE)
  .\deploy\verify.ps1 -ViaIp       # diagnostics only, while the certificate is PROVISIONING:
                                   #   talks to the LB IP directly (curl --resolve, TLS not verified)
  .\deploy\verify.ps1 -SkipE2E     # only the quick HTTP/infra checks
#>
param([switch]$ViaIp, [switch]$SkipE2E)
. (Join-Path $PSScriptRoot "common.ps1")
Assert-Config
Assert-Gcloud
$results = New-Object System.Collections.Generic.List[object]
function Add-Result([string]$n, [string]$topic, [bool]$ok, [string]$detail, [switch]$Pending) {
    $mark = if ($ok) { "✅" } elseif ($Pending) { "⚠️" } else { "❌" }
    $results.Add([pscustomobject]@{ N = $n; Topic = $topic; Mark = $mark; Detail = $detail })
    if ($ok) { Ok "$topic - $detail" } else { Warn "$topic - $detail" }
}

$ip = GcOut compute addresses describe rewind-ip --global --format="value(address)"
# --ssl-no-revoke: Windows curl (Schannel) otherwise fails when the CRL server is unreachable.
# The certificate chain and host name are still verified (no -k).
$curlBase = @("-s", "--max-time", "20", "--ssl-no-revoke")
if ($ViaIp) {
    $curlBase += @("--resolve", "${DOMAIN}:443:$ip", "--resolve", "${DOMAIN}:80:$ip", "-k")
    Warn "-ViaIp: TLS is NOT verified (diagnostics while the certificate is provisioning)"
}
function Curl([string[]]$extra) { & curl.exe @curlBase @extra }

Step "1. Domain and HTTPS"
$code = Curl @("-o", "NUL", "-w", "%{http_code}", "https://$DOMAIN/")
$certOk = ($code -eq "200")
Add-Result "1a" "https://$DOMAIN" ($certOk -and -not $ViaIp) "HTTP $code$(if (-not $ViaIp) { ', certificate verified by Windows (no -k)' } else { ' (via IP, TLS not verified)' })" -Pending:$ViaIp
$redir = Curl @("-o", "NUL", "-w", "%{http_code} %{redirect_url}", "http://$DOMAIN/history")
Add-Result "1b" "http -> https" ($redir -like "301 https://$DOMAIN/history*") "$redir"
$hsts = (Curl @("-I", "https://$DOMAIN/")) -match "strict-transport-security"
Add-Result "1c" "HSTS header" ([bool]$hsts) "$($hsts -join ' ')"

Step "2. Backend"
$health = Curl @("-w", " %{http_code}", "https://$DOMAIN/health")
Add-Result "2" "/health" ($health -match '^\{"status":"ok"\} 200$') "$health"

Step "3-4. E2E (Playwright, fake camera) against https://$DOMAIN"
if ($SkipE2E -or $ViaIp) { Add-Result "3" "E2E" $false "skipped" -Pending }
else {
    Push-Location (Join-Path $Root "e2e")
    try {
        $env:BASE_URL = "https://$DOMAIN"
        $log = Join-Path $env:TEMP "rewind-e2e-cloud.txt"
        & npx playwright test tests/grading.spec.js tests/noface.spec.js tests/secondpass.spec.js tests/cloud.spec.js tests/debugpanel.spec.js *> $log
        $e2eOk = ($LASTEXITCODE -eq 0)
        $summary = (Select-String -Path $log -Pattern "^\s+\d+ (passed|failed|skipped)" | ForEach-Object { $_.Line.Trim() }) -join ", "
        $x20 = (Select-String -Path $log -Pattern "x20:" | Select-Object -First 1).Line
        Add-Result "3" "E2E (register, login, YouTube, camera session + score, history, isolation, logout, no face, Second Pass)" $e2eOk $summary
        Add-Result "4" "data persists + 20x GET /api/users/me with one token" ($e2eOk -and $x20 -match "(200,){19}200") "$x20"
        Info "full log: $log"
    } finally { Remove-Item Env:BASE_URL -ErrorAction SilentlyContinue; Pop-Location }
}

Step "5. Availability"
$min = GcOut run services describe rewind-backend --region=$REGION --format="value(spec.template.metadata.annotations.'autoscaling.knative.dev/minScale')"
$minF = GcOut run services describe rewind-frontend --region=$REGION --format="value(spec.template.metadata.annotations.'autoscaling.knative.dev/minScale')"
Add-Result "5a" "min instances" ([int]("0$min") -ge 2 -and [int]("0$minF") -ge 1) "backend min=$min, frontend min=$minF"
$uptime = GcOut monitoring uptime list-configs --filter="displayName=rewind-health" --format="value(name)"
Add-Result "5b" "uptime check" ([bool]$uptime) $(if ($uptime) { "rewind-health exists (results: Console > Monitoring > Uptime checks)" } else { "missing" })

Step "+ Isolation: direct *.run.app URLs are blocked from outside"
foreach ($svc in @("rewind-backend", "rewind-frontend")) {
    $url = GcOut run services describe $svc --region=$REGION --format="value(status.url)"
    if (-not $url) { Add-Result "+" "$svc direct URL" $false "service not found"; continue }
    $c = & curl.exe -s --ssl-no-revoke -o NUL -w "%{http_code}" --max-time 20 "$url/health"
    Add-Result "+" "$svc direct URL" ($c -in @("403", "404")) "$url -> $c (expected 403/404: ingress = internal-and-cloud-load-balancing)"
}

Step "+ Secrets"
Push-Location $Root
$hits = & git grep -n -I -E "mongodb\+srv://[^<]|AIza[0-9A-Za-z_-]{20,}|JWT_SECRET=[0-9a-f]{32,}" 2>$null
Pop-Location
Add-Result "+" "secret scan (git grep)" (-not $hits) $(if ($hits) { "FOUND: $($hits.Count) lines" } else { "clean" })
$secretRefs = GcOut run services describe rewind-backend --region=$REGION --format="json(spec.template.spec.containers[0].env)"
Add-Result "+" "backend env from Secret Manager" ($secretRefs -match "secretKeyRef" -and $secretRefs -notmatch "mongodb\+srv") "MONGODB_URI / JWT_SECRET are secretKeyRef (Reference a secret)"

# ---- write the report ----
$out = Join-Path $Root "docs\A4_VERIFY_RESULTS.md"
$lines = @("# תוצאות אימות אוטומטיות (deploy/verify.ps1)", "", "נוצר: $(Get-Date -Format 'yyyy-MM-dd HH:mm') · דומיין: https://$DOMAIN · IP: $ip$(if ($ViaIp) { ' · **מצב -ViaIp (אבחון, בלי אימות TLS)**' })", "",
           "| # | בדיקה | תוצאה | פירוט |", "|---|---|---|---|")
foreach ($r in $results) { $lines += "| $($r.N) | $($r.Topic) | $($r.Mark) | $($r.Detail.Replace('|', '/')) |" }
[IO.File]::WriteAllLines($out, $lines, (New-Object Text.UTF8Encoding $false))
Step "Report: docs\A4_VERIFY_RESULTS.md"
$bad = @($results | Where-Object { $_.Mark -ne "✅" })
if ($bad.Count) { Warn "$($bad.Count) checks are not green"; exit 1 } else { Ok "all checks green" }
