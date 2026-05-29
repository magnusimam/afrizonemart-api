<#
.SYNOPSIS
  Dump the Railway Postgres DB to an external/local drive as a
  gzipped SQL file. Air-gapped tier of the 3-2-1 backup strategy.

.DESCRIPTION
  Calls pg_dump against the Railway DATABASE_PUBLIC_URL, writes a
  date-stamped .sql.gz to -Destination, verifies the file, and prunes
  old dumps so the drive does not fill up.

  This is the local copy you physically control. Pair it with the
  Railway-native daily snapshots (Pro tier, already on) and the R2
  cloud cron (separate PR). Each layer catches a different failure:
    * Railway snapshot   -> "I broke prod"
    * R2 cloud dump      -> "Railway is gone"
    * Local external HDD -> "Internet + my Railway account both gone"

.PARAMETER Destination
  Folder on the external drive to save dumps in. Created if missing.
  Example: E:\afrizonemart-backups

.PARAMETER Keep
  How many recent dumps to keep in the folder. Older ones are
  deleted (oldest-first). Default 12 = roughly a quarter of weekly
  backups, or two weeks of daily.

.PARAMETER EnvFile
  Path to a .env-style file containing DATABASE_PUBLIC_URL=postgres://...
  Default looks next to this script for `.env.backup` (gitignored).
  Skipped if $env:DATABASE_PUBLIC_URL is already set.

.EXAMPLE
  .\backup-db-local.ps1 -Destination E:\afrizonemart-backups
  Dumps to E:\afrizonemart-backups\afrizonemart-2026-05-30_1430.sql.gz

.NOTES
  Requires pg_dump.exe -- install once with:
    winget install PostgreSQL.PostgreSQL
  (Or download the EnterpriseDB installer and pick "Command Line
  Tools" only.)

  First-time setup:
    1. Plug in the external drive.
    2. Create scripts\.env.backup with:
         DATABASE_PUBLIC_URL=postgresql://...
       (Get the URL from Railway -> Postgres service -> Variables ->
        DATABASE_PUBLIC_URL. Treat it like a credential.)
    3. Double-click backup-db-local.bat (the .ps1 launcher) -- or
       run this script directly.
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$Destination,

  [int]$Keep = 12,

  [string]$EnvFile = $null
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$msg) {
  Write-Host "-> $msg" -ForegroundColor Cyan
}
function Write-Ok([string]$msg) {
  Write-Host "[OK] $msg" -ForegroundColor Green
}
function Write-Fail([string]$msg) {
  Write-Host "[FAIL] $msg" -ForegroundColor Red
}

# --- 1. Find pg_dump ----------------------------------------------
Write-Step 'Locating pg_dump.exe'
$cmd = Get-Command pg_dump.exe -ErrorAction SilentlyContinue
$pgDump = if ($cmd) { $cmd.Source } else { $null }
if (-not $pgDump) {
  # Probe the common Windows install paths.
  $candidates = @(
    'C:\Program Files\PostgreSQL\17\bin\pg_dump.exe',
    'C:\Program Files\PostgreSQL\16\bin\pg_dump.exe',
    'C:\Program Files\PostgreSQL\15\bin\pg_dump.exe',
    'C:\Program Files\PostgreSQL\14\bin\pg_dump.exe'
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) { $pgDump = $c; break }
  }
}
if (-not $pgDump) {
  Write-Fail 'pg_dump.exe not found. Install with:  winget install PostgreSQL.PostgreSQL'
  exit 1
}
Write-Ok "pg_dump -> $pgDump"

# --- 2. Resolve DATABASE_PUBLIC_URL --------------------------------
Write-Step 'Resolving DATABASE_PUBLIC_URL'
$dbUrl = $env:DATABASE_PUBLIC_URL
if (-not $dbUrl) {
  $envPath = if ($EnvFile) { $EnvFile } else { Join-Path $PSScriptRoot '.env.backup' }
  if (-not (Test-Path $envPath)) {
    Write-Fail "No DATABASE_PUBLIC_URL in env and no .env file at $envPath"
    Write-Host "Create $envPath with one line:"
    Write-Host "  DATABASE_PUBLIC_URL=postgresql://user:pw@host:port/dbname"
    exit 1
  }
  Get-Content $envPath | ForEach-Object {
    if ($_ -match '^\s*DATABASE_PUBLIC_URL\s*=\s*(.+?)\s*$') {
      $dbUrl = $matches[1].Trim('"').Trim("'")
    }
  }
  if (-not $dbUrl) {
    Write-Fail "Could not parse DATABASE_PUBLIC_URL from $envPath"
    exit 1
  }
}
# Show host only -- never log the credential.
$dbHostName = 'unknown'
if ($dbUrl -match '@([^/:]+)') { $dbHostName = $matches[1] }
Write-Ok "Connecting to host: $dbHostName"

# --- 3. Prepare destination folder ---------------------------------
Write-Step "Preparing destination: $Destination"
if (-not (Test-Path $Destination)) {
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  Write-Ok "Created $Destination"
}
$driveLetter = ([System.IO.Path]::GetPathRoot($Destination)).TrimEnd('\')
if ($driveLetter -and -not (Test-Path $driveLetter)) {
  Write-Fail "Drive $driveLetter not connected. Plug in the external drive and re-run."
  exit 1
}

# --- 4. Run pg_dump -> gzipped SQL ---------------------------------
$ts = Get-Date -Format 'yyyy-MM-dd_HHmm'
$outFile = Join-Path $Destination "afrizonemart-$ts.sql.gz"
Write-Step "Dumping to $outFile"

# pg_dump native compression (-Z 9) -> standard gzipped plain SQL.
# Universally restorable with: gunzip + psql
& $pgDump --format=plain --compress=9 --no-owner --no-privileges `
  --file=$outFile $dbUrl
if ($LASTEXITCODE -ne 0) {
  Write-Fail "pg_dump exited with code $LASTEXITCODE"
  if (Test-Path $outFile) { Remove-Item $outFile -Force }
  exit 1
}

# Sanity check: dump must be non-trivial. A "successful" 0-byte file
# means something went wrong silently.
$size = (Get-Item $outFile).Length
if ($size -lt 1024) {
  Write-Fail "Dump is only $size bytes -- something is wrong. Aborting."
  Remove-Item $outFile -Force
  exit 1
}
$sizeMB = [math]::Round($size / 1MB, 2)
Write-Ok "Wrote $sizeMB MB"

# --- 5. Prune older dumps -----------------------------------------
Write-Step "Pruning to last $Keep dumps"
$existing = @(Get-ChildItem $Destination -Filter 'afrizonemart-*.sql.gz' |
  Sort-Object LastWriteTime -Descending)
$toRemove = $existing | Select-Object -Skip $Keep
foreach ($f in $toRemove) {
  Remove-Item $f.FullName -Force
  Write-Host "  removed $($f.Name)" -ForegroundColor DarkGray
}
$kept = $existing.Count - @($toRemove).Count
Write-Ok "Keeping $kept of $($existing.Count) dumps"

# --- 6. Summary ----------------------------------------------------
Write-Host ''
Write-Host '----------------------------------------' -ForegroundColor DarkGray
Write-Ok 'Backup complete'
Write-Host "  file:       $outFile"
Write-Host "  size:       $sizeMB MB"
Write-Host "  drive:      $driveLetter"
Write-Host "  kept dumps: $kept"
Write-Host ''
Write-Host 'To restore on a fresh Postgres:' -ForegroundColor DarkGray
Write-Host '  gunzip < dump.sql.gz | psql $TARGET_URL' -ForegroundColor DarkGray
