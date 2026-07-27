$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$releaseResources = Join-Path $root "release\win-unpacked\resources"
$asarPath = Join-Path $releaseResources "app.asar"
$workDir = Join-Path $root "release\app-asar-work"
$asarCmd = Join-Path $root "node_modules\.bin\asar.cmd"

if (-not (Test-Path $asarPath)) {
  throw "Missing $asarPath. Run npm run dist:win at least once before syncing release app code."
}

if (-not (Test-Path $asarCmd)) {
  throw "Missing $asarCmd. Run npm install before syncing release app code."
}

foreach ($required in @("dist-electron", "dist-renderer", "package.json")) {
  $candidate = Join-Path $root $required
  if (-not (Test-Path $candidate)) {
    throw "Missing $candidate. Run npm run build before syncing release app code."
  }
}

Remove-Item -LiteralPath $workDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $workDir | Out-Null

& $asarCmd extract $asarPath $workDir

Remove-Item -LiteralPath (Join-Path $workDir "dist-electron") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $workDir "dist-renderer") -Recurse -Force -ErrorAction SilentlyContinue

Copy-Item -Path (Join-Path $root "dist-electron") -Destination (Join-Path $workDir "dist-electron") -Recurse -Force
Copy-Item -Path (Join-Path $root "dist-renderer") -Destination (Join-Path $workDir "dist-renderer") -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root "package.json") -Destination (Join-Path $workDir "package.json") -Force

& $asarCmd pack $workDir $asarPath

Remove-Item -LiteralPath $workDir -Recurse -Force -ErrorAction SilentlyContinue

$appAsar = Get-Item -LiteralPath $asarPath
[PSCustomObject]@{
  AppAsar = $appAsar.FullName
  SizeMB = [math]::Round($appAsar.Length / 1MB, 2)
  LastWriteTime = $appAsar.LastWriteTime
  Status = "OK"
}
