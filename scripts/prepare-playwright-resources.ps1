$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$browserManifest = Join-Path $root "node_modules\playwright-core\browsers.json"
$vendorRoot = Join-Path $root "vendor\ms-playwright"
$cacheRoot = Join-Path $env:LOCALAPPDATA "ms-playwright"

if (!(Test-Path $browserManifest)) {
  throw "Cannot find Playwright browser manifest: $browserManifest"
}

$manifest = Get-Content $browserManifest -Raw | ConvertFrom-Json
$requiredNames = @("chromium", "chromium-headless-shell", "ffmpeg")

New-Item -ItemType Directory -Force $vendorRoot | Out-Null

foreach ($name in $requiredNames) {
  $entry = $manifest.browsers | Where-Object { $_.name -eq $name } | Select-Object -First 1
  if (!$entry) {
    throw "Cannot find Playwright browser entry: $name"
  }

  $directoryName = "$($entry.name.Replace('-', '_'))-$($entry.revision)"
  $source = Join-Path $cacheRoot $directoryName
  $destination = Join-Path $vendorRoot $directoryName

  if (!(Test-Path $source)) {
    throw "Missing Playwright runtime: $source. Run npx playwright install chromium first."
  }

  if (Test-Path $destination) {
    Remove-Item -LiteralPath $destination -Recurse -Force
  }
  Copy-Item -LiteralPath $source -Destination $destination -Recurse
}

Write-Output "Prepared Playwright runtime resources in $vendorRoot"
