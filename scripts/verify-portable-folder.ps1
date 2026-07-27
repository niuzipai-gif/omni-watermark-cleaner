$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$packageRoot = Join-Path $root "Omni-Watermark-Cleaner-Portable"
$appRoot = Join-Path $packageRoot "app"

$requiredFiles = @(
  (Join-Path $appRoot "Omni Watermark Cleaner.exe"),
  (Join-Path $appRoot "resources\app.asar"),
  (Join-Path $appRoot "resources\app.asar.unpacked\node_modules\ffmpeg-static\ffmpeg.exe"),
  (Join-Path $appRoot "resources\app.asar.unpacked\node_modules\@img\sharp-win32-x64\lib\sharp-win32-x64.node"),
  (Join-Path $appRoot "resources\ms-playwright\chromium-1217\chrome-win64\chrome.exe"),
  (Join-Path $appRoot "resources\ms-playwright\chromium_headless_shell-1217\chrome-headless-shell-win64\chrome-headless-shell.exe"),
  (Join-Path $packageRoot "Start Omni Watermark Cleaner.cmd"),
  (Join-Path $packageRoot "Create Desktop Shortcut.cmd"),
  (Join-Path $packageRoot "Create Desktop Shortcut.ps1"),
  (Join-Path $packageRoot "Run Portable Self Test.cmd"),
  (Join-Path $packageRoot "README.txt"),
  (Join-Path $packageRoot "SHA256SUMS.txt"),
  (Join-Path $packageRoot "assets\omni-cleaner.ico")
)

$missing = @($requiredFiles | Where-Object { -not (Test-Path -LiteralPath $_) })
if ($missing.Count -gt 0) {
  throw "Portable package is missing required files:`n$($missing -join "`n")"
}

$ffmpeg = Get-Item -LiteralPath (Join-Path $appRoot "resources\app.asar.unpacked\node_modules\ffmpeg-static\ffmpeg.exe")
if ($ffmpeg.Length -lt 50000000) {
  throw "ffmpeg-static looks too small: $($ffmpeg.Length) bytes"
}

$sharpNative = Get-Item -LiteralPath (Join-Path $appRoot "resources\app.asar.unpacked\node_modules\@img\sharp-win32-x64\lib\sharp-win32-x64.node")
if ($sharpNative.Length -lt 100000) {
  throw "sharp native module looks too small: $($sharpNative.Length) bytes"
}

$appAsar = Get-Item -LiteralPath (Join-Path $appRoot "resources\app.asar")
if ($appAsar.Length -lt 1000000) {
  throw "app.asar looks too small: $($appAsar.Length) bytes"
}

$distMain = Get-Item -LiteralPath (Join-Path $root "dist-electron\main.js")
$distRendererIndex = Get-Item -LiteralPath (Join-Path $root "dist-renderer\index.html")
$newestDistWrite = @($distMain.LastWriteTime, $distRendererIndex.LastWriteTime) | Sort-Object -Descending | Select-Object -First 1
if ($appAsar.LastWriteTime -lt $newestDistWrite) {
  throw "Portable app.asar is older than current dist output. Run npm run package:portable-folder again."
}

$launcherText = Get-Content -LiteralPath (Join-Path $packageRoot "Start Omni Watermark Cleaner.cmd") -Raw
if ($launcherText -notmatch "Omni Watermark Cleaner\.exe") {
  throw "Launcher does not reference Omni Watermark Cleaner.exe"
}

$shortcutInstallerText = Get-Content -LiteralPath (Join-Path $packageRoot "Create Desktop Shortcut.ps1") -Raw
if ($shortcutInstallerText -notmatch "LOCALAPPDATA") {
  throw "Shortcut installer does not cache launcher assets in LOCALAPPDATA"
}
if ($shortcutInstallerText -notmatch "Find-PortableExe") {
  throw "Shortcut installer does not include portable path recovery logic"
}
if ($shortcutInstallerText -notmatch "omni-cleaner\.ico") {
  throw "Shortcut installer does not cache the app icon"
}

$readmeText = Get-Content -LiteralPath (Join-Path $packageRoot "README.txt") -Raw
if ($readmeText -notmatch "aspect ratio automatically") {
  throw "README does not describe automatic aspect-ratio behavior"
}
if ($readmeText -notmatch "Create Desktop Shortcut\.cmd") {
  throw "README does not explain how to regenerate a desktop shortcut after moving the folder"
}
if ($readmeText -notmatch "Run Portable Self Test\.cmd") {
  throw "README does not explain how to verify the copied portable folder"
}
if ($readmeText -notmatch "SHA256") {
  throw "README does not explain that self-test verifies SHA256 file integrity"
}

$hashManifestText = Get-Content -LiteralPath (Join-Path $packageRoot "SHA256SUMS.txt") -Raw
foreach ($relativePath in @(
  "app\Omni Watermark Cleaner.exe",
  "app\resources\app.asar",
  "app\resources\app.asar.unpacked\node_modules\ffmpeg-static\ffmpeg.exe",
  "app\resources\app.asar.unpacked\node_modules\@img\sharp-win32-x64\lib\sharp-win32-x64.node",
  "app\resources\ms-playwright\chromium-1217\chrome-win64\chrome.exe",
  "app\resources\ms-playwright\chromium_headless_shell-1217\chrome-headless-shell-win64\chrome-headless-shell.exe"
)) {
  if ($hashManifestText -notmatch [regex]::Escape($relativePath)) {
    throw "SHA256SUMS.txt does not include $relativePath"
  }
}

$size = (Get-ChildItem -LiteralPath $packageRoot -Recurse -File | Measure-Object -Property Length -Sum).Sum
$count = (Get-ChildItem -LiteralPath $packageRoot -Recurse -File | Measure-Object).Count

[PSCustomObject]@{
  PackageRoot = $packageRoot
  FileCount = $count
  SizeMB = [math]::Round($size / 1MB, 2)
  FfmpegMB = [math]::Round($ffmpeg.Length / 1MB, 2)
  SharpNativeMB = [math]::Round($sharpNative.Length / 1MB, 2)
  AppAsarMB = [math]::Round($appAsar.Length / 1MB, 2)
  AppAsarTime = $appAsar.LastWriteTime
  Status = "OK"
}
