# Rewind on Google Cloud (assignment 4): settings. NO SECRETS in this file (it is in Git).
# Fill the TODO_USER values, then run:  powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1

$GCP_PROJECT_ID = "TODO_USER"            # the project ID in Google Cloud (the ID, not the display name)
$REGION         = "europe-west1"         # Belgium; Atlas M0 on GCP runs in the same region (WESTERN_EUROPE)
$DOMAIN         = "TODO_USER.ddns.net"   # the No-IP hostname
$PROJECT_SLUG   = "rewind"               # submission JSON id: English, no spaces
$MEMBERS        = @("TODO_USER Full Name 1", "TODO_USER Full Name 2")
$BUDGET_USD     = 50
$ALERT_EMAIL    = ""                     # optional: e-mail for the uptime alert

# Optional: Docker Hub user for the assignment-3 images (same code, tag 1.1.0). Empty = skip.
$DOCKERHUB_USER = ""

# Atlas (only used when the Atlas CLI is logged in; otherwise see docs/USER_TODO.md)
$ATLAS_PROJECT  = "rewind"
$ATLAS_CLUSTER  = "rewind"
$ATLAS_REGION   = "WESTERN_EUROPE"       # Atlas name of GCP europe-west1
$ATLAS_DB_USER  = "rewind-app"

$IMAGE_TAG      = "1.1.0"
