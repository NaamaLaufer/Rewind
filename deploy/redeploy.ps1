<#
.SYNOPSIS
  New version only: build + push the images and roll both Cloud Run services to them.
  Nothing else changes (secrets, LB, certificate, DNS stay as they are).
.EXAMPLE
  .\deploy\redeploy.ps1                 # rebuild $IMAGE_TAG from config.ps1
  .\deploy\redeploy.ps1 -Tag 1.1.1      # a new tag (remember to update $IMAGE_TAG in config.ps1)
#>
param([string]$Tag, [switch]$DryRun)
. (Join-Path $PSScriptRoot "common.ps1")
$script:IsDryRun = [bool]$DryRun
if ($Tag) { $IMAGE_TAG = $Tag }
Assert-Config
Assert-Gcloud

Step "Images $IMAGE_TAG"
& (Join-Path $PSScriptRoot "build-images.ps1") -DryRun:$DryRun

Step "Cloud Run"
# 'run services update --image' keeps every other setting (secrets, env, min instances, ingress).
GcRun run services update rewind-backend --region=$REGION --image="$AR/backend:$IMAGE_TAG"
Ok "rewind-backend -> $IMAGE_TAG"
GcRun run services update rewind-frontend --region=$REGION --image="$AR/frontend:$IMAGE_TAG"
Ok "rewind-frontend -> $IMAGE_TAG"
Info "Check: .\deploy\status.ps1"
