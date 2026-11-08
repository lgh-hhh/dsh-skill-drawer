# Restore the newest DSH desktop profile configuration backup.
# This overwrites package.json / cordis.patch.yml and friends with the backed-up copies.
$ErrorActionPreference = 'Stop'

$profileDir = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
$profilesRoot = Split-Path -Parent $profileDir

if (-not (Test-Path -LiteralPath $profileDir)) {
    throw "DSH desktop profile not found: $profileDir"
}

$backup = Get-ChildItem -LiteralPath $profilesRoot -Directory -Filter 'desktop.skill-drawer-backup-*' |
    Sort-Object Name -Descending |
    Select-Object -First 1

if (-not $backup) {
    throw "No desktop.skill-drawer-backup-* folder found in $profilesRoot"
}

Write-Host "restoring from: $($backup.FullName)"
Get-ChildItem -LiteralPath $backup.FullName -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $profileDir $_.Name) -Force
    Write-Host ("  restored " + $_.Name)
}

Write-Host ''
Write-Host 'Done. Fully quit DeepSeek Harness (including the tray icon) and start it again.'
