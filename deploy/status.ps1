<#
.SYNOPSIS
  State of the deployment: Cloud Run services, static IP, DNS (No-IP), managed certificate, /health.
.EXAMPLE
  .\deploy\status.ps1          # once
  .\deploy\status.ps1 -Wait    # poll every 2 minutes (max 60) until DNS points at the IP and the cert is ACTIVE
#>
param([switch]$Wait, [int]$IntervalMinutes = 2, [int]$MaxMinutes = 60)
. (Join-Path $PSScriptRoot "common.ps1")
Assert-Config
Assert-Gcloud

function Get-Status {
    $ip = GcOut compute addresses describe rewind-ip --global --format="value(address)"
    $dns = @()
    try { $dns = @(Resolve-DnsName -Name $DOMAIN -Type A -DnsOnly -ErrorAction Stop | Where-Object { $_.Type -eq "A" } | ForEach-Object { $_.IPAddress }) } catch { }
    $cert = GcOut compute ssl-certificates describe rewind-cert --global --format="value(managed.status)"
    $certDomain = GcOut compute ssl-certificates describe rewind-cert --global --format="value(managed.domainStatus)"
    $health = "-"
    try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 15 "https://$DOMAIN/health"; $health = "$($r.StatusCode) $($r.Content)" } catch { $health = "not reachable over HTTPS yet ($($_.Exception.Message.Split([Environment]::NewLine)[0]))" }
    return [pscustomobject]@{ Ip = $ip; Dns = ($dns -join ","); DnsOk = ($ip -and $dns.Count -eq 1 -and $dns[0] -eq $ip); Cert = $cert; CertDomain = $certDomain; Health = $health }
}

Step "Cloud Run"
foreach ($svc in @("rewind-backend", "rewind-frontend")) {
    $ready = GcOut run services describe $svc --region=$REGION --format="value(status.conditions[0].status)"
    $min = GcOut run services describe $svc --region=$REGION --format="value(spec.template.metadata.annotations.'autoscaling.knative.dev/minScale')"
    $ing = GcOut run services describe $svc --region=$REGION --format="value(metadata.annotations.'run.googleapis.com/ingress')"
    if ($ready) { Ok "$svc ready=$ready min-instances=$min ingress=$ing" } else { Warn "$svc not deployed" }
}

$deadline = (Get-Date).AddMinutes($MaxMinutes)
do {
    $s = Get-Status
    Step ("Domain / certificate  ({0:HH:mm})" -f (Get-Date))
    Info "static IP:   $($s.Ip)"
    if ($s.DnsOk) { Ok "DNS:         $DOMAIN -> $($s.Dns)" }
    else { Warn "DNS:         $DOMAIN -> '$($s.Dns)' (must be ONE A record = $($s.Ip); update it in No-IP)" }
    if ($s.Cert -eq "ACTIVE") { Ok "certificate: ACTIVE" }
    else {
        Warn "certificate: $($s.Cert) $($s.CertDomain)"
        if ($s.CertDomain -match "FAILED_NOT_VISIBLE") { Warn "  FAILED_NOT_VISIBLE = the A record does not point at $($s.Ip) yet. Fix it in No-IP; Google retries by itself." }
        elseif ($s.Cert -eq "PROVISIONING") { Info "  PROVISIONING is normal: up to 60 minutes after the DNS points at the IP." }
    }
    Info "/health:     $($s.Health)"
    if (-not $Wait -or ($s.DnsOk -and $s.Cert -eq "ACTIVE" -and $s.Health -like "200*")) { break }
    if ((Get-Date) -gt $deadline) { Warn "gave up after $MaxMinutes minutes; run .\deploy\status.ps1 -Wait again later"; break }
    Info "waiting $IntervalMinutes minutes..."
    Start-Sleep -Seconds ($IntervalMinutes * 60)
} while ($true)

if ($s.Cert -eq "ACTIVE" -and $s.Health -like "200*") { Ok "Ready. Next: .\deploy\verify.ps1" }
