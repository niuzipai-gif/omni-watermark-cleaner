$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$sourceApp = Join-Path $root "release\win-unpacked"
$packageRoot = Join-Path $root "Omni-Watermark-Cleaner-Portable"
$appTarget = Join-Path $packageRoot "app"
$assetsTarget = Join-Path $packageRoot "assets"
$ffmpegSource = Join-Path $root "node_modules\ffmpeg-static\ffmpeg.exe"
$ffmpegTarget = Join-Path $appTarget "resources\app.asar.unpacked\node_modules\ffmpeg-static\ffmpeg.exe"

function Get-Sha256Hex([string]$path) {
  $stream = [System.IO.File]::OpenRead($path)
  try {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
      return [System.BitConverter]::ToString($sha256.ComputeHash($stream)).Replace("-", "").ToLowerInvariant()
    } finally {
      $sha256.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

if (-not (Test-Path $sourceApp)) {
  throw "Missing $sourceApp. Run npm run dist:win or update release\win-unpacked before packaging."
}

if (-not (Test-Path $ffmpegSource)) {
  throw "Missing $ffmpegSource. Run npm install before packaging."
}

Remove-Item -LiteralPath $packageRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $appTarget | Out-Null
New-Item -ItemType Directory -Force -Path $assetsTarget | Out-Null

Copy-Item -Path (Join-Path $sourceApp "*") -Destination $appTarget -Recurse -Force
New-Item -ItemType Directory -Force -Path (Split-Path $ffmpegTarget -Parent) | Out-Null
Copy-Item -LiteralPath $ffmpegSource -Destination $ffmpegTarget -Force

Copy-Item -LiteralPath (Join-Path $root "assets\omni-cleaner.ico") -Destination (Join-Path $assetsTarget "omni-cleaner.ico") -Force
Copy-Item -LiteralPath (Join-Path $root "assets\omni-cleaner-mascot.png") -Destination (Join-Path $assetsTarget "omni-cleaner-mascot.png") -Force

$manifestRelativePaths = @(
  "app\Omni Watermark Cleaner.exe",
  "app\resources\app.asar",
  "app\resources\app.asar.unpacked\node_modules\ffmpeg-static\ffmpeg.exe",
  "app\resources\ms-playwright\chromium-1217\chrome-win64\chrome.exe",
  "app\resources\ms-playwright\chromium_headless_shell-1217\chrome-headless-shell-win64\chrome-headless-shell.exe"
)
$manifestLines = foreach ($relativePath in $manifestRelativePaths) {
  $fullPath = Join-Path $packageRoot $relativePath
  if (-not (Test-Path -LiteralPath $fullPath)) {
    throw "Cannot create SHA256 manifest; missing $fullPath"
  }
  $hash = Get-Sha256Hex $fullPath
  "$hash  $relativePath"
}
$manifestLines | Set-Content -LiteralPath (Join-Path $packageRoot "SHA256SUMS.txt") -Encoding ASCII

$launcherContent = @(
  "@echo off",
  "setlocal",
  "set ""APP_DIR=%~dp0app""",
  "start """" ""%APP_DIR%\Omni Watermark Cleaner.exe"""
) -join [Environment]::NewLine
$launcherContent | Set-Content -LiteralPath (Join-Path $packageRoot "Start Omni Watermark Cleaner.cmd") -Encoding ASCII

$desktopShortcutInstaller = @'
$ErrorActionPreference = "Stop"

$packageDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcherDir = Join-Path $env:LOCALAPPDATA "Omni Watermark Cleaner Launcher"
$launcherPath = Join-Path $launcherDir "OmniWatermarkLauncher.ps1"
$pathFile = Join-Path $launcherDir "portable-root.txt"
$cachedIcon = Join-Path $launcherDir "omni-cleaner.ico"
$sourceIcon = Join-Path $packageDir "assets\omni-cleaner.ico"

New-Item -ItemType Directory -Force -Path $launcherDir | Out-Null
Copy-Item -LiteralPath $sourceIcon -Destination $cachedIcon -Force
Set-Content -LiteralPath $pathFile -Value $packageDir -Encoding ASCII

$launcherScript = @(
  '$ErrorActionPreference = "Stop"',
  '',
  '$launcherDir = Split-Path -Parent $MyInvocation.MyCommand.Path',
  '$pathFile = Join-Path $launcherDir "portable-root.txt"',
  '',
  'function Test-PortableExe([string]$root) {',
  '  if ([string]::IsNullOrWhiteSpace($root)) { return $null }',
  '  $candidate = Join-Path $root "app\Omni Watermark Cleaner.exe"',
  '  if (Test-Path -LiteralPath $candidate) { return $candidate }',
  '  return $null',
  '}',
  '',
  'function Find-PortableExe([string]$preferredRoot) {',
  '  $preferred = Test-PortableExe $preferredRoot',
  '  if ($preferred) { return $preferred }',
  '',
  '  $relativeExe = "Omni-Watermark-Cleaner-Portable\app\Omni Watermark Cleaner.exe"',
  '  $roots = @(',
  '    [Environment]::GetFolderPath("Desktop"),',
  '    [Environment]::GetFolderPath("MyDocuments"),',
  '    (Join-Path $env:USERPROFILE "Downloads"),',
  '    $env:USERPROFILE',
  '  )',
  '',
  '  foreach ($root in $roots) {',
  '    if ([string]::IsNullOrWhiteSpace($root)) { continue }',
  '    $candidate = Join-Path $root $relativeExe',
  '    if (Test-Path -LiteralPath $candidate) { return $candidate }',
  '  }',
  '',
  '  foreach ($drive in [System.IO.DriveInfo]::GetDrives()) {',
  '    if (-not $drive.IsReady) { continue }',
  '    if ($drive.DriveType -notin @([System.IO.DriveType]::Fixed, [System.IO.DriveType]::Removable)) { continue }',
  '    $candidate = Join-Path $drive.RootDirectory.FullName $relativeExe',
  '    if (Test-Path -LiteralPath $candidate) { return $candidate }',
  '  }',
  '',
  '  return $null',
  '}',
  '',
  '$preferredRoot = ""',
  'if (Test-Path -LiteralPath $pathFile) {',
  '  $preferredRoot = (Get-Content -LiteralPath $pathFile -Raw).Trim()',
  '}',
  '',
  '$exe = Find-PortableExe $preferredRoot',
  'if (-not $exe) {',
  '  Write-Error "Could not find Omni-Watermark-Cleaner-Portable\app\Omni Watermark Cleaner.exe. Move the portable folder to Desktop, Downloads, Documents, a drive root, or rerun Create Desktop Shortcut.cmd from the copied folder."',
  '  exit 1',
  '}',
  '',
  '$portableRoot = Split-Path -Parent (Split-Path -Parent $exe)',
  'Set-Content -LiteralPath $pathFile -Value $portableRoot -Encoding ASCII',
  'Start-Process -FilePath $exe -WorkingDirectory (Split-Path -Parent $exe)'
) -join [Environment]::NewLine

Set-Content -LiteralPath $launcherPath -Value $launcherScript -Encoding ASCII

$shortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "Omni Watermark Cleaner.lnk"
$powershellPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershellPath
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$launcherPath`""
$shortcut.WorkingDirectory = $launcherDir
$shortcut.IconLocation = "$cachedIcon,0"
$shortcut.Description = "Omni video watermark cleaner portable launcher"
$shortcut.Save()

Write-Host "Created desktop shortcut: $shortcutPath"
Write-Host "Launcher script: $launcherPath"
Write-Host "Cached icon: $cachedIcon"
'@
$desktopShortcutInstaller | Set-Content -LiteralPath (Join-Path $packageRoot "Create Desktop Shortcut.ps1") -Encoding ASCII

$desktopShortcutContent = @(
  "@echo off",
  "setlocal",
  "powershell -NoProfile -ExecutionPolicy Bypass -File ""%~dp0Create Desktop Shortcut.ps1""",
  "pause"
) -join [Environment]::NewLine
$desktopShortcutContent | Set-Content -LiteralPath (Join-Path $packageRoot "Create Desktop Shortcut.cmd") -Encoding ASCII

$selfTestContent = @(
  "@echo off",
  "setlocal",
  "set ""PACKAGE_DIR=%~dp0""",
  'powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = ''Stop''; function HashFile($path) { $stream = [System.IO.File]::OpenRead($path); try { $sha256 = [System.Security.Cryptography.SHA256]::Create(); try { return [System.BitConverter]::ToString($sha256.ComputeHash($stream)).Replace(''-'', '''').ToLowerInvariant() } finally { $sha256.Dispose() } } finally { $stream.Dispose() } }; $packageDir = ''%PACKAGE_DIR%''.TrimEnd(''\''); $appDir = Join-Path $packageDir ''app''; $manifestPath = Join-Path $packageDir ''SHA256SUMS.txt''; $required = @((Join-Path $appDir ''Omni Watermark Cleaner.exe''), (Join-Path $appDir ''resources\app.asar''), (Join-Path $appDir ''resources\app.asar.unpacked\node_modules\ffmpeg-static\ffmpeg.exe''), (Join-Path $appDir ''resources\ms-playwright\chromium-1217\chrome-win64\chrome.exe''), (Join-Path $appDir ''resources\ms-playwright\chromium_headless_shell-1217\chrome-headless-shell-win64\chrome-headless-shell.exe''), (Join-Path $packageDir ''Start Omni Watermark Cleaner.cmd''), (Join-Path $packageDir ''Create Desktop Shortcut.cmd''), (Join-Path $packageDir ''assets\omni-cleaner.ico''), $manifestPath); $missing = @($required | Where-Object { -not (Test-Path -LiteralPath $_) }); if ($missing.Count -gt 0) { throw (''Missing required files:'' + [Environment]::NewLine + ($missing -join [Environment]::NewLine)) }; $ffmpeg = Get-Item -LiteralPath (Join-Path $appDir ''resources\app.asar.unpacked\node_modules\ffmpeg-static\ffmpeg.exe''); if ($ffmpeg.Length -lt 50000000) { throw (''ffmpeg-static looks incomplete: '' + $ffmpeg.Length + '' bytes'') }; $appAsar = Get-Item -LiteralPath (Join-Path $appDir ''resources\app.asar''); if ($appAsar.Length -lt 1000000) { throw (''app.asar looks incomplete: '' + $appAsar.Length + '' bytes'') }; Get-Content -LiteralPath $manifestPath | Where-Object { $_.Trim() } | ForEach-Object { $parts = $_ -split ''  '', 2; if ($parts.Count -ne 2) { throw (''Invalid SHA256 manifest line: '' + $_) }; $expectedHash = $parts[0].Trim().ToLowerInvariant(); $relativePath = $parts[1].Trim(); $fullPath = Join-Path $packageDir $relativePath; if (-not (Test-Path -LiteralPath $fullPath)) { throw (''SHA256 target missing: '' + $relativePath) }; $actualHash = HashFile $fullPath; if ($actualHash -ne $expectedHash) { throw (''SHA256 mismatch: '' + $relativePath) } }; Write-Host ''Portable self test OK.''; Write-Host ''SHA256 integrity checks OK.''; Write-Host (''Folder: '' + $packageDir); Write-Host ''You can start the app with Start Omni Watermark Cleaner.cmd.''"',
  "pause"
) -join [Environment]::NewLine
$selfTestContent | Set-Content -LiteralPath (Join-Path $packageRoot "Run Portable Self Test.cmd") -Encoding ASCII

$readmeContent = @(
  "Omni Watermark Cleaner Portable",
  "",
  "Usage:",
  "1. Copy this whole folder to another Windows PC.",
  "2. Double-click Run Portable Self Test.cmd to verify the copied folder is complete and SHA256 checks pass.",
  "3. Double-click Start Omni Watermark Cleaner.cmd.",
  "4. Drag PNG, JPG, JPEG, or WEBP images for local Gemini image cleanup. Image dimensions and alpha are preserved.",
  "5. Drag MP4, M4V, MOV, or WEBM videos. The app detects aspect ratio automatically and tries the high-quality public-page cleanup first for all ratios, including 16:9 and 9:16.",
  "6. The default output folder is Omni Watermark Cleaner Output on the current user's Desktop. You can change it inside the app.",
  "7. On a new PC, double-click Create Desktop Shortcut.cmd to create a desktop shortcut. It caches the icon locally and can recover the portable folder path if the folder is on Desktop, Downloads, Documents, a drive root, or the last saved path.",
  "",
  "Notes:",
  "- Keep the app folder next to this launcher. Do not copy only the exe.",
  "- The .lnk inside this folder is a convenience copy. For the Desktop shortcut on a new PC, use Create Desktop Shortcut.cmd so the icon is cached locally and the launcher can find the copied folder.",
  "- Supported Gemini image cleanup is local. It does not upload images, crop them, or intentionally add blur or mosaic blocks.",
  "- Public-page cleanup requires internet access.",
  "- Local ffmpeg cleanup is a low-confidence fallback. It may leave blur or mosaic artifacts, so the app only uses it when Allow low confidence results is enabled."
) -join [Environment]::NewLine
$readmeContent | Set-Content -LiteralPath (Join-Path $packageRoot "README.txt") -Encoding ASCII

$shortcutPath = Join-Path $packageRoot "Omni Watermark Cleaner.lnk"
$targetPath = Join-Path $appTarget "Omni Watermark Cleaner.exe"
$iconPath = Join-Path $assetsTarget "omni-cleaner.ico"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = Split-Path $targetPath -Parent
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = "Omni video watermark cleaner portable"
$shortcut.Save()

$size = (Get-ChildItem -LiteralPath $packageRoot -Recurse -File | Measure-Object -Property Length -Sum).Sum
$count = (Get-ChildItem -LiteralPath $packageRoot -Recurse -File | Measure-Object).Count
[PSCustomObject]@{
  PackageRoot = $packageRoot
  FileCount = $count
  SizeMB = [math]::Round($size / 1MB, 2)
}
