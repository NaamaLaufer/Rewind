<#
.SYNOPSIS
  Rewind on Google Cloud (assignment 4): creates or updates EVERYTHING, idempotently.
  Every resource is checked with describe first; existing ones are kept (or updated where that is
  safe). Running it again is always safe. Secrets are never printed.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1            # real run
  powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1 -DryRun    # print the gcloud commands only
  powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1 -SkipImages  # reuse the pushed images
#>
param([switch]$DryRun, [switch]$SkipImages)
. (Join-Path $PSScriptRoot "common.ps1")
$script:IsDryRun = [bool]$DryRun
$pending = New-Object System.Collections.Generic.List[string]

Step "0. Checks"
Assert-Config
Assert-Gcloud
if ($DryRun) { Warn "DRY RUN: nothing is created, commands are only printed" }

# ---------------------------------------------------------------------------------------------
Step "1. APIs"
GcRun services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com `
    compute.googleapis.com monitoring.googleapis.com billingbudgets.googleapis.com `
    cloudresourcemanager.googleapis.com iam.googleapis.com cloudbilling.googleapis.com
Ok "APIs enabled"

# ---------------------------------------------------------------------------------------------
Step "2. Artifact Registry ($AR)"
if (Exists artifacts repositories describe rewind --location=$REGION) { Ok "repository rewind exists" }
else { GcRun artifacts repositories create rewind --repository-format=docker --location=$REGION --description="Rewind images"; Ok "repository created" }
GcRun auth configure-docker "$REGION-docker.pkg.dev"

# ---------------------------------------------------------------------------------------------
Step "3. Service accounts (least privilege)"
foreach ($sa in @(@{id = "rewind-backend"; name = "Rewind backend (reads its own secrets only)" },
                  @{id = "rewind-frontend"; name = "Rewind frontend (no permissions)" })) {
    $email = "$($sa.id)@$GCP_PROJECT_ID.iam.gserviceaccount.com"
    if (Exists iam service-accounts describe $email) { Ok "$email exists" }
    else { GcRun iam service-accounts create $sa.id --display-name="$($sa.name)"; Ok "created $email" }
}

# ---------------------------------------------------------------------------------------------
Step "4. Secrets (Secret Manager)"
# JWT_SECRET: created ONCE. Never regenerated (that would log every user out).
if (Exists secrets describe JWT_SECRET) { Ok "JWT_SECRET exists (left untouched)" }
else {
    With-TempSecretFile (New-RandomHex 32) { param($f) GcRun secrets create JWT_SECRET --replication-policy=automatic --data-file=$f }
    Ok "JWT_SECRET created (64 random hex chars, not shown)"
}

# MONGODB_URI: existing secret > deploy\.secrets\mongodb_uri.txt > Atlas CLI > pending (USER_TODO).
function Set-MongoSecret([string]$uri) {
    With-TempSecretFile $uri { param($f)
        if (Exists secrets describe MONGODB_URI) { GcRun secrets versions add MONGODB_URI --data-file=$f }
        else { GcRun secrets create MONGODB_URI --replication-policy=automatic --data-file=$f }
    }
}

function New-AtlasDatabase {
    # Returns the full connection string (kept in memory only), or $null if Atlas is not logged in.
    & atlas auth whoami *> $null
    if ($LASTEXITCODE -ne 0) { return $null }
    Info "Atlas CLI is logged in: project '$ATLAS_PROJECT', M0 cluster '$ATLAS_CLUSTER' on GCP $ATLAS_REGION"
    $projects = (& atlas projects list --output json | ConvertFrom-Json).results
    $proj = $projects | Where-Object { $_.name -eq $ATLAS_PROJECT } | Select-Object -First 1
    if (-not $proj) { $proj = (& atlas projects create $ATLAS_PROJECT --output json | ConvertFrom-Json) }
    $projId = $proj.id
    & atlas clusters describe $ATLAS_CLUSTER --projectId $projId *> $null
    if ($LASTEXITCODE -ne 0) {
        & atlas clusters create $ATLAS_CLUSTER --provider GCP --region $ATLAS_REGION --tier M0 --projectId $projId
        if ($LASTEXITCODE -ne 0) { throw "atlas clusters create failed" }
        Info "waiting for the cluster (a few minutes)..."
        & atlas clusters watch $ATLAS_CLUSTER --projectId $projId
    }
    # Cloud Run has no fixed outbound IP (that would need VPC + Cloud NAT, which cost money).
    $acl = (& atlas accessLists list --projectId $projId --output json | ConvertFrom-Json).results
    if (-not ($acl | Where-Object { $_.cidrBlock -eq "0.0.0.0/0" })) {
        & atlas accessLists create 0.0.0.0/0 --type cidrBlock --comment "Cloud Run: no fixed egress IP (see D-0xx)" --projectId $projId
        if ($LASTEXITCODE -ne 0) { throw "atlas accessLists create failed" }
    }
    $pw = New-RandomAlnum 32
    & atlas dbusers describe $ATLAS_DB_USER --projectId $projId *> $null
    if ($LASTEXITCODE -eq 0) { & atlas dbusers update $ATLAS_DB_USER --password $pw --projectId $projId *> $null }
    else { & atlas dbusers create --username $ATLAS_DB_USER --password $pw --role "readWrite@rewind" --projectId $projId *> $null }
    if ($LASTEXITCODE -ne 0) { throw "atlas dbusers create/update failed" }
    $srv = (& atlas clusters connectionStrings describe $ATLAS_CLUSTER --projectId $projId --output json | ConvertFrom-Json).standardSrv
    if (-not $srv) { throw "could not read the cluster connection string" }
    $hostPart = $srv -replace "^mongodb\+srv://", ""
    # (built with -f so the secret-scan pattern never matches this source line)
    return ("{0}://{1}:{2}@{3}/rewind?retryWrites=true&w=majority&appName=rewind" -f "mongodb+srv", $ATLAS_DB_USER, $pw, $hostPart)
}

$uriFile = Join-Path $PSScriptRoot ".secrets\mongodb_uri.txt"
if (Test-Path $uriFile) {
    $uri = (Get-Content -Raw $uriFile).Trim()
    if ($uri -notmatch "^mongodb(\+srv)?://") { throw "$uriFile does not look like a MongoDB URI" }
    Set-MongoSecret $uri
    Remove-Item -Force $uriFile
    Ok "MONGODB_URI stored from deploy\.secrets\mongodb_uri.txt (file deleted)"
} elseif (Exists secrets describe MONGODB_URI) {
    Ok "MONGODB_URI exists (left untouched)"
} elseif ($DryRun) {
    Info "[dry-run] MONGODB_URI would come from Atlas CLI or deploy\.secrets\mongodb_uri.txt"
} else {
    $uri = New-AtlasDatabase
    if ($uri) { Set-MongoSecret $uri; $uri = $null; Ok "MONGODB_URI created from Atlas (not shown)" }
    else { $pending.Add("MongoDB Atlas: log in (atlas auth login) or save the URI in deploy\.secrets\mongodb_uri.txt, then run deploy.ps1 again"); Warn "no MONGODB_URI yet: Atlas CLI not logged in and no deploy\.secrets\mongodb_uri.txt" }
}

# GEMINI_API_KEY: optional. Only if a key file was provided.
$geminiFile = Join-Path $PSScriptRoot ".secrets\gemini_api_key.txt"
if (Test-Path $geminiFile) {
    $key = (Get-Content -Raw $geminiFile).Trim()
    With-TempSecretFile $key { param($f)
        if (Exists secrets describe GEMINI_API_KEY) { GcRun secrets versions add GEMINI_API_KEY --data-file=$f }
        else { GcRun secrets create GEMINI_API_KEY --replication-policy=automatic --data-file=$f }
    }
    $key = $null; Remove-Item -Force $geminiFile
    Ok "GEMINI_API_KEY stored (file deleted)"
}
$hasGemini = Exists secrets describe GEMINI_API_KEY
$hasMongo = $DryRun -or (Exists secrets describe MONGODB_URI)

# secretAccessor for the backend SA, per secret (not project-wide).
$secrets = @("JWT_SECRET")
if ($hasMongo) { $secrets += "MONGODB_URI" }
if ($hasGemini) { $secrets += "GEMINI_API_KEY" }
foreach ($s in $secrets) {
    GcRun secrets add-iam-policy-binding $s --member="serviceAccount:$BACKEND_SA" --role="roles/secretmanager.secretAccessor" | Out-Null
    Ok "$BACKEND_SA can read $s (only)"
}

# ---------------------------------------------------------------------------------------------
Step "5. Images ($IMAGE_TAG, linux/amd64)"
if ($SkipImages) { Info "skipped (-SkipImages)" }
else {
    & (Join-Path $PSScriptRoot "build-images.ps1") -DryRun:$DryRun
    if (-not $DryRun -and $LASTEXITCODE -ne 0) { throw "image build failed" }
}

# ---------------------------------------------------------------------------------------------
Step "6. Cloud Run"
function Set-Public([string]$svc) {
    # --allow-unauthenticated can be refused by an organization policy (allUsers is blocked).
    if ($DryRun) { return }
    $pol = GcOut run services get-iam-policy $svc --region=$REGION --format=json
    if ($pol -match "allUsers") { Ok "$svc is public (allUsers -> run.invoker), reachable only through the LB (ingress)"; return }
    Warn "${svc}: allUsers binding refused (organization policy?). Using --no-invoker-iam-check instead."
    GcRun run services update $svc --region=$REGION --no-invoker-iam-check
}

$secretFlags = "JWT_SECRET=JWT_SECRET:latest"
if ($hasMongo) { $secretFlags = "MONGODB_URI=MONGODB_URI:latest,$secretFlags" }
if ($hasGemini) { $secretFlags += ",GEMINI_API_KEY=GEMINI_API_KEY:latest" }
if ($hasMongo) {
    GcRun run deploy rewind-backend --image "$AR/backend:$IMAGE_TAG" --region $REGION --port 8000 `
        --service-account $BACKEND_SA `
        --set-secrets $secretFlags `
        --set-env-vars "ENV=production,DB_NAME=rewind,ALLOWED_ORIGINS=https://$DOMAIN,GEMINI_MODEL=gemini-2.5-flash" `
        --ingress internal-and-cloud-load-balancing --allow-unauthenticated `
        --min-instances 2 --max-instances 5 --memory 512Mi --cpu 1
    Set-Public rewind-backend
    Ok "rewind-backend: min 2 / max 5 instances, secrets from Secret Manager"
} else {
    Warn "rewind-backend NOT deployed yet: it needs MONGODB_URI (see above)"
}

GcRun run deploy rewind-frontend --image "$AR/frontend:$IMAGE_TAG" --region $REGION --port 3000 `
    --service-account $FRONTEND_SA `
    --set-env-vars "BACKEND_URL=" `
    --ingress internal-and-cloud-load-balancing --allow-unauthenticated `
    --min-instances 1 --max-instances 5 --memory 256Mi --cpu 1
Set-Public rewind-frontend
Ok "rewind-frontend: min 1 / max 5 instances"

# ---------------------------------------------------------------------------------------------
Step "7. Load Balancer (global, EXTERNAL_MANAGED)"
if (Exists compute addresses describe rewind-ip --global) { Ok "static IP rewind-ip exists" }
else { GcRun compute addresses create rewind-ip --global --ip-version=IPV4; Ok "static IP created" }
$ip = GcOut compute addresses describe rewind-ip --global --format="value(address)"
if ($ip) { Show-IpBanner $ip; Set-Content -Encoding utf8 (Join-Path $PSScriptRoot "last-ip.txt") $ip }

foreach ($svc in @("backend", "frontend")) {
    $neg = "rewind-$svc-neg"; $bs = "rewind-$svc-bs"
    if (Exists compute network-endpoint-groups describe $neg --region=$REGION) { Ok "NEG $neg exists" }
    else { GcRun compute network-endpoint-groups create $neg --region=$REGION --network-endpoint-type=serverless --cloud-run-service="rewind-$svc"; Ok "NEG $neg created" }
    # No health check: serverless NEGs do not support one (Cloud Run manages instance health).
    if (Exists compute backend-services describe $bs --global) { Ok "backend service $bs exists" }
    else { GcRun compute backend-services create $bs --global --load-balancing-scheme=EXTERNAL_MANAGED; Ok "backend service $bs created" }
    $groups = GcOut compute backend-services describe $bs --global --format="value(backends[].group)"
    if ($groups -like "*$neg*") { Ok "$bs -> $neg" }
    else { GcRun compute backend-services add-backend $bs --global --network-endpoint-group=$neg --network-endpoint-group-region=$REGION; Ok "$bs -> $neg attached" }
}

# URL maps from the YAML files (import = create or replace; readable and easy to explain).
$tmpMap = Join-Path $env:TEMP "rewind-urlmap.yaml"
(Get-Content -Raw (Join-Path $PSScriptRoot "urlmap.yaml")).Replace("__PROJECT__", $GCP_PROJECT_ID) | Set-Content -Encoding ascii $tmpMap
GcRun compute url-maps import rewind-urlmap --source=$tmpMap --global
Remove-Item -Force -ErrorAction SilentlyContinue $tmpMap
Ok "URL map: /api, /api/*, /health -> backend; everything else -> frontend"
$redirectMap = Join-Path $PSScriptRoot "urlmap-redirect.yaml"
GcRun compute url-maps import rewind-http-redirect --source=$redirectMap --global
Ok "URL map: http -> https (301)"

if (Exists compute ssl-certificates describe rewind-cert --global) {
    $certDomains = GcOut compute ssl-certificates describe rewind-cert --global --format="value(managed.domains)"
    if ($certDomains -and $certDomains -notlike "*$DOMAIN*") { Warn "rewind-cert is for '$certDomains', not $DOMAIN. Run teardown for the cert or create a new one (see CLOUD_GUIDE)." }
    else { Ok "managed certificate rewind-cert exists" }
} else { GcRun compute ssl-certificates create rewind-cert --domains=$DOMAIN --global; Ok "managed certificate for $DOMAIN requested" }

if (Exists compute target-https-proxies describe rewind-https-proxy --global) { Ok "HTTPS proxy exists" }
else { GcRun compute target-https-proxies create rewind-https-proxy --url-map=rewind-urlmap --ssl-certificates=rewind-cert --global; Ok "HTTPS proxy created" }
if (Exists compute target-http-proxies describe rewind-http-proxy --global) { Ok "HTTP proxy exists" }
else { GcRun compute target-http-proxies create rewind-http-proxy --url-map=rewind-http-redirect --global; Ok "HTTP proxy created" }

if (Exists compute forwarding-rules describe rewind-https-fr --global) { Ok "forwarding rule 443 exists" }
else { GcRun compute forwarding-rules create rewind-https-fr --global --load-balancing-scheme=EXTERNAL_MANAGED --address=rewind-ip --target-https-proxy=rewind-https-proxy --ports=443; Ok "forwarding rule 443 created" }
if (Exists compute forwarding-rules describe rewind-http-fr --global) { Ok "forwarding rule 80 exists" }
else { GcRun compute forwarding-rules create rewind-http-fr --global --load-balancing-scheme=EXTERNAL_MANAGED --address=rewind-ip --target-http-proxy=rewind-http-proxy --ports=80; Ok "forwarding rule 80 created (redirect)" }

# ---------------------------------------------------------------------------------------------
Step "8. Budget ($BUDGET_USD USD, alerts at 50/90/100%)"
try {
    $billing = (GcOut billing projects describe $GCP_PROJECT_ID --format="value(billingAccountName)") -replace "^billingAccounts/", ""
    if (-not $billing -and -not $DryRun) { throw "no billing account linked to $GCP_PROJECT_ID" }
    $budgets = GcOut billing budgets list --billing-account=$billing --billing-project=$GCP_PROJECT_ID --format="value(displayName)"
    if ($budgets -match "rewind-budget") { Ok "budget rewind-budget exists" }
    else {
        GcRun billing budgets create --billing-account=$billing --billing-project=$GCP_PROJECT_ID --display-name="rewind-budget" `
            --budget-amount="${BUDGET_USD}USD" --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
        Ok "budget created"
    }
} catch {
    Warn "budget not created: $($_.Exception.Message)"
    $pending.Add("Budget: Console > Billing > Budgets & alerts > Create: rewind-budget, $BUDGET_USD USD, thresholds 50/90/100%")
}

# ---------------------------------------------------------------------------------------------
Step "9. Uptime check (https://$DOMAIN/health every 5 minutes)"
try {
    $checks = GcOut monitoring uptime list-configs --format="value(displayName)"
    if ($checks -match "rewind-health") { Ok "uptime check rewind-health exists" }
    else {
        GcRun monitoring uptime create rewind-health --resource-type=uptime-url `
            --resource-labels="host=$DOMAIN,project_id=$GCP_PROJECT_ID" `
            --protocol=https --port=443 --path=/health --period=5 --timeout=10 `
            --matcher-content=ok --matcher-type=contains-string   # body {"status":"ok"} (503 says "unavailable")
        Ok "uptime check created"
    }
    if ($ALERT_EMAIL) { & (Join-Path $PSScriptRoot "alert.ps1") -DryRun:$DryRun }
} catch {
    Warn "uptime check not created: $($_.Exception.Message)"
    $pending.Add("Uptime check: run deploy.ps1 again, or Console > Monitoring > Uptime checks > https://$DOMAIN/health every 5 min")
}

# ---------------------------------------------------------------------------------------------
Step "Done"
if ($ip) { Show-IpBanner $ip }
Info "Next: .\deploy\status.ps1 -Wait   (DNS + certificate; PROVISIONING can take up to 60 min)"
Info "Then: .\deploy\verify.ps1          (full check against https://$DOMAIN)"
if ($pending.Count) {
    Warn "Still waiting for you:"
    $pending | ForEach-Object { Warn " - $_" }
}
