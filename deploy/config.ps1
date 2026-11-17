# Rewind on Google Cloud (assignment 4): settings. NO SECRETS in this file (it is in Git).
# Run:  powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1

$GCP_PROJECT_ID = "rewind-515021"        # the project ID in Google Cloud (the ID, not the display name)
$REGION         = "europe-west1"         # Belgium; Atlas M0 on GCP runs in the same region (WESTERN_EUROPE)
$DOMAIN         = "rewind.ddns.net"      # the No-IP hostname
$PROJECT_SLUG   = "rewind"               # submission JSON id: English, no spaces
$MEMBERS        = @("Naama Laufer", "Tamar Laufer")

# Budget in the billing account's currency (this account is billed in ILS).
$BUDGET_AMOUNT   = 200
$BUDGET_CURRENCY = "ILS"
$ALERT_EMAIL     = "naama4212@gmail.com" # optional: e-mail for the uptime alert

# Docker Hub user for the assignment-3 images (same code, tag 1.1.0). Image names must be lowercase.
$DOCKERHUB_USER = "naamalaufer"

# Atlas (only used when the Atlas CLI is logged in; otherwise see docs/USER_TODO.md)
$ATLAS_PROJECT  = "rewind"
$ATLAS_CLUSTER  = "rewind"
$ATLAS_REGION   = "WESTERN_EUROPE"       # Atlas name of GCP europe-west1
$ATLAS_DB_USER  = "rewind-app"

$IMAGE_TAG      = "1.1.0"
