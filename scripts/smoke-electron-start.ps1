$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$stdout = Join-Path $root "electron-smoke.out.log"
$stderr = Join-Path $root "electron-smoke.err.log"

Remove-Item $stdout, $stderr -Force -ErrorAction SilentlyContinue

$process = Start-Process -FilePath "npm.cmd" `
  -ArgumentList @("start") `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdout `
  -RedirectStandardError $stderr `
  -PassThru

Start-Sleep -Seconds 8

$electronProcesses = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq "electron.exe" -and $_.ExecutablePath -like "*\node_modules\electron\dist\electron.exe"
})

$stdoutText = Get-Content $stdout -Raw -ErrorAction SilentlyContinue
$stderrText = Get-Content $stderr -Raw -ErrorAction SilentlyContinue

if ($electronProcesses.Count -eq 0) {
  if (Get-Process -Id $process.Id -ErrorAction SilentlyContinue) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }
  throw "Electron did not stay running.`nSTDOUT:`n$stdoutText`nSTDERR:`n$stderrText"
}

$electronProcesses | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}
if (Get-Process -Id $process.Id -ErrorAction SilentlyContinue) {
  Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
}

Remove-Item $stdout, $stderr -Force -ErrorAction SilentlyContinue
Write-Output "Electron smoke start passed."
