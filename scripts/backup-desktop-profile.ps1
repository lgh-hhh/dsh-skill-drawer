# Backup the DSH desktop profile configuration before installing a plugin.
# Only the files that carry bundle configuration are copied; node_modules is not touched.
$ErrorActionPreference = 'Stop'

$profileDir = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
if (-not (Test-Path -LiteralPath $profileDir)) {
    throw "DSH desktop profile not found: $profileDir"
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path (Split-Path -Parent $profileDir) "desktop.skill-drawer-backup-$stamp"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$files = @('package.json', 'cordis.patch.yml', 'cordis.yml', 'pnpm-lock.yaml', 'pnpm-workspace.yaml')
$copied = @()
foreach ($file in $files) {
    $source = Join-Path $profileDir $file
    if (Test-Path -LiteralPath $source) {
        Copy-Item -LiteralPath $source -Destination (Join-Path $backupDir $file) -Force
        $copied += $file
    }
}

if ($copied.Count -eq 0) {
    throw "nothing to back up in $profileDir"
}

Write-Host "backup ok -> $backupDir"
Write-Host ("files: " + ($copied -join ', '))
Write-Host "rollback: scripts\rollback-desktop-profile.cmd"
