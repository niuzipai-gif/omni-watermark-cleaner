$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$packageRoot = Join-Path $root "Omni-Watermark-Cleaner-Portable"
$shortcutInstaller = Join-Path $packageRoot "Create Desktop Shortcut.ps1"
$appExe = Join-Path $packageRoot "app\Omni Watermark Cleaner.exe"
$launcherDir = Join-Path $env:LOCALAPPDATA "Omni Watermark Cleaner Launcher"
$launcherPath = Join-Path $launcherDir "OmniWatermarkLauncher.ps1"
$cachedIcon = Join-Path $launcherDir "omni-cleaner.ico"
$pathFile = Join-Path $launcherDir "portable-root.txt"
$desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "Omni Watermark Cleaner.lnk"
$portableShortcut = Join-Path $packageRoot "Omni Watermark Cleaner.lnk"

if (-not (Test-Path -LiteralPath $shortcutInstaller)) {
  throw "Missing shortcut installer: $shortcutInstaller"
}
if (-not (Test-Path -LiteralPath $appExe)) {
  throw "Missing portable app exe: $appExe"
}
if (Test-Path -LiteralPath $portableShortcut) {
  throw "Portable package must not contain a machine-bound shortcut: $portableShortcut"
}

& powershell -NoProfile -ExecutionPolicy Bypass -File $shortcutInstaller

$requiredFiles = @($desktopShortcut, $launcherPath, $cachedIcon, $pathFile)
$missing = @($requiredFiles | Where-Object { -not (Test-Path -LiteralPath $_) })
if ($missing.Count -gt 0) {
  throw "Shortcut installer did not create required files:`n$($missing -join "`n")"
}

$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($desktopShortcut)
$expectedPowerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
if ($shortcut.TargetPath -ne $expectedPowerShell) {
  throw "Unexpected shortcut target: $($shortcut.TargetPath)"
}
if ($shortcut.Arguments -notmatch [regex]::Escape($launcherPath)) {
  throw "Shortcut arguments do not reference launcher: $($shortcut.Arguments)"
}
if ($shortcut.WorkingDirectory -ne $launcherDir) {
  throw "Unexpected shortcut working directory: $($shortcut.WorkingDirectory)"
}
if ($shortcut.IconLocation -ne "$cachedIcon,0") {
  throw "Unexpected shortcut icon location: $($shortcut.IconLocation)"
}

$launcherText = Get-Content -LiteralPath $launcherPath -Raw
if ($launcherText -notmatch "Find-PortableExe") {
  throw "Launcher script does not include portable path recovery logic"
}
if ($launcherText -notmatch "Omni-Watermark-Cleaner-Portable") {
  throw "Launcher script does not search for the portable folder name"
}

$recordedRoot = (Get-Content -LiteralPath $pathFile -Raw).Trim()
if ($recordedRoot -ne $packageRoot) {
  throw "Recorded portable root is wrong: $recordedRoot"
}

$before = @(Get-Process | Where-Object { $_.Path -eq $appExe } | Select-Object -ExpandProperty Id)
& powershell -NoProfile -ExecutionPolicy Bypass -File $launcherPath
Start-Sleep -Seconds 8
$after = @(Get-Process | Where-Object { $_.Path -eq $appExe })
$started = @($after | Where-Object { $before -notcontains $_.Id })
if ($started.Count -eq 0) {
  throw "Launcher did not start Omni Watermark Cleaner.exe"
}

$started | Stop-Process -Force

[PSCustomObject]@{
  Status = "OK"
  DesktopShortcut = $desktopShortcut
  TargetPath = $shortcut.TargetPath
  Arguments = $shortcut.Arguments
  IconLocation = $shortcut.IconLocation
  LauncherPath = $launcherPath
  CachedIcon = $cachedIcon
  StartedProcessCount = $started.Count
}
