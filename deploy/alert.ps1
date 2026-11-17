<#
.SYNOPSIS
  Optional: e-mail alert when the uptime check fails (only when $ALERT_EMAIL is set in config.ps1).
  Called by deploy.ps1. Uses an e-mail notification channel + an alert policy on the uptime check.
#>
param([switch]$DryRun)
. (Join-Path $PSScriptRoot "common.ps1")
$script:IsDryRun = [bool]$DryRun
if (-not $ALERT_EMAIL) { Info "no ALERT_EMAIL in config.ps1: no e-mail alert"; return }

$existing = GcOut beta monitoring channels list --filter="displayName=rewind-email" --format="value(name)"
if ($existing) { $channel = ($existing -split "`n")[0]; Ok "notification channel exists" }
else {
    GcRun beta monitoring channels create --display-name=rewind-email --type=email --channel-labels="email_address=$ALERT_EMAIL"
    $channel = (GcOut beta monitoring channels list --filter="displayName=rewind-email" --format="value(name)" -split "`n")[0]
    Ok "notification channel created"
}

$policies = GcOut monitoring policies list --filter="displayName=rewind-health-down" --format="value(name)"
if ($policies) { Ok "alert policy exists"; return }
$checkId = ((GcOut monitoring uptime list-configs --filter="displayName=rewind-health" --format="value(name)") -split "/")[-1]
$policy = @{
    displayName = "rewind-health-down"
    combiner = "OR"
    notificationChannels = @($channel)
    conditions = @(@{
        displayName = "https://$DOMAIN/health fails"
        conditionThreshold = @{
            filter = "metric.type=`"monitoring.googleapis.com/uptime_check/check_passed`" AND metric.label.check_id=`"$checkId`" AND resource.type=`"uptime_url`""
            comparison = "COMPARISON_GT"
            thresholdValue = 1
            duration = "600s"
            aggregations = @(@{ alignmentPeriod = "1200s"; perSeriesAligner = "ALIGN_NEXT_OLDER"; crossSeriesReducer = "REDUCE_COUNT_FALSE"; groupByFields = @("resource.label.host") })
        }
    })
} | ConvertTo-Json -Depth 8
$tmp = Join-Path $env:TEMP "rewind-policy.json"
[IO.File]::WriteAllText($tmp, $policy)
try { GcRun monitoring policies create --policy-from-file=$tmp; Ok "alert policy: e-mail to $ALERT_EMAIL when /health fails for 10 minutes" }
finally { Remove-Item -Force -ErrorAction SilentlyContinue $tmp }
