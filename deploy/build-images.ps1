<#
.SYNOPSIS
  Builds the SAME two images as assignment 3 (same Dockerfiles, same code) for linux/amd64 and
  pushes them to Artifact Registry (and to Docker Hub when $DOCKERHUB_USER is set in config.ps1).
#>
param([switch]$DryRun)
. (Join-Path $PSScriptRoot "common.ps1")
Push-Location $Root
try {
    # The ONNX model is baked into the frontend image (not downloaded at runtime).
    $model = "frontend\public\models\v4_7.onnx"
    if (-not (Test-Path $model)) {
        New-Item -ItemType Directory -Force (Split-Path $model) | Out-Null
        Copy-Item "materials\focusflow-models\v4_7.onnx" $model -ErrorAction Stop
        Ok "copied the model into the frontend build context"
    }
    foreach ($svc in @("backend", "frontend")) {
        $tags = @("-t", "$AR/${svc}:$IMAGE_TAG")
        if ($DOCKERHUB_USER) { $tags += @("-t", "$DOCKERHUB_USER/rewind-${svc}:$IMAGE_TAG") }
        $cmd = @("buildx", "build", "--platform", "linux/amd64") + $tags + @("--push", ".\$svc")
        if ($DryRun) { Write-Host "    [dry-run] docker $($cmd -join ' ')" -ForegroundColor DarkGray; continue }
        & docker @cmd
        if ($LASTEXITCODE -ne 0) { throw "docker build/push of $svc failed" }
        Ok "$svc pushed: $($tags | Where-Object { $_ -ne '-t' })"
    }
} finally { Pop-Location }
