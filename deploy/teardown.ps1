<#
.SYNOPSIS
  Deletes ONLY the resources deploy.ps1 created, in dependency order. Do NOT run before grading.
  Atlas and the secrets are kept unless asked (-IncludeSecrets / the Atlas cluster is manual).
.EXAMPLE
  .\deploy\teardown.ps1 -Yes                    # LB + Cloud Run + images
  .\deploy\teardown.ps1 -Yes -IncludeSecrets    # also the secrets and service accounts
#>
param([switch]$Yes, [switch]$IncludeSecrets)
. (Join-Path $PSScriptRoot "common.ps1")
Assert-Config
Assert-Gcloud
if (-not $Yes) { throw "This deletes the live site. Run again with -Yes if you really mean it." }

function Remove-IfExists([string[]]$describe, [string[]]$delete) {
    if (Exists @describe) { GcRun @delete; Ok ($delete[0..2] -join " ") } else { Info "not found: $($describe[0..2] -join ' ')" }
}

Step "Load Balancer"
Remove-IfExists @("compute", "forwarding-rules", "describe", "rewind-https-fr", "--global") @("compute", "forwarding-rules", "delete", "rewind-https-fr", "--global")
Remove-IfExists @("compute", "forwarding-rules", "describe", "rewind-http-fr", "--global") @("compute", "forwarding-rules", "delete", "rewind-http-fr", "--global")
Remove-IfExists @("compute", "target-https-proxies", "describe", "rewind-https-proxy", "--global") @("compute", "target-https-proxies", "delete", "rewind-https-proxy", "--global")
Remove-IfExists @("compute", "target-http-proxies", "describe", "rewind-http-proxy", "--global") @("compute", "target-http-proxies", "delete", "rewind-http-proxy", "--global")
Remove-IfExists @("compute", "ssl-certificates", "describe", "rewind-cert", "--global") @("compute", "ssl-certificates", "delete", "rewind-cert", "--global")
Remove-IfExists @("compute", "url-maps", "describe", "rewind-urlmap", "--global") @("compute", "url-maps", "delete", "rewind-urlmap", "--global")
Remove-IfExists @("compute", "url-maps", "describe", "rewind-http-redirect", "--global") @("compute", "url-maps", "delete", "rewind-http-redirect", "--global")
foreach ($svc in @("backend", "frontend")) {
    Remove-IfExists @("compute", "backend-services", "describe", "rewind-$svc-bs", "--global") @("compute", "backend-services", "delete", "rewind-$svc-bs", "--global")
    Remove-IfExists @("compute", "network-endpoint-groups", "describe", "rewind-$svc-neg", "--region=$REGION") @("compute", "network-endpoint-groups", "delete", "rewind-$svc-neg", "--region=$REGION")
}
Remove-IfExists @("compute", "addresses", "describe", "rewind-ip", "--global") @("compute", "addresses", "delete", "rewind-ip", "--global")

Step "Cloud Run + images + monitoring"
foreach ($svc in @("rewind-backend", "rewind-frontend")) {
    Remove-IfExists @("run", "services", "describe", $svc, "--region=$REGION") @("run", "services", "delete", $svc, "--region=$REGION")
}
Remove-IfExists @("artifacts", "repositories", "describe", "rewind", "--location=$REGION") @("artifacts", "repositories", "delete", "rewind", "--location=$REGION")
$uptime = GcOut monitoring uptime list-configs --filter="displayName=rewind-health" --format="value(name)"
if ($uptime) { GcRun monitoring uptime delete $uptime; Ok "uptime check deleted" }

if ($IncludeSecrets) {
    Step "Secrets + service accounts"
    foreach ($s in @("MONGODB_URI", "JWT_SECRET", "GEMINI_API_KEY")) {
        Remove-IfExists @("secrets", "describe", $s) @("secrets", "delete", $s)
    }
    foreach ($sa in @($BACKEND_SA, $FRONTEND_SA)) {
        Remove-IfExists @("iam", "service-accounts", "describe", $sa) @("iam", "service-accounts", "delete", $sa)
    }
}
Info "Kept: the budget (free), the Atlas M0 cluster (free; delete it in the Atlas UI if you want)."
