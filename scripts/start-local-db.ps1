$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $projectRoot '.local-postgres/data'
if (-not (Test-Path -LiteralPath (Join-Path $dataDir 'PG_VERSION'))) {
  throw 'Cluster PostgreSQL lokal tidak ditemukan. Gunakan docker-compose.yml atau buat database sendiri.'
}

$pgCtl = (Get-Command pg_ctl -ErrorAction SilentlyContinue)?.Source
if (-not $pgCtl) { $pgCtl = 'C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe' }
if (-not (Test-Path -LiteralPath $pgCtl)) { throw 'pg_ctl tidak ditemukan. Pasang PostgreSQL 16 atau tambahkan bin PostgreSQL ke PATH.' }

$pgIsReady = Join-Path (Split-Path -Parent $pgCtl) 'pg_isready.exe'
& $pgIsReady -h 127.0.0.1 -p 5433 *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Output 'PostgreSQL lokal sudah berjalan.'
  exit 0
}

$logPath = Join-Path $projectRoot '.local-postgres/postgres.log'
& $pgCtl -D $dataDir -l $logPath -o '-h 127.0.0.1 -p 5433' -w start
if ($LASTEXITCODE -ne 0) { throw 'Gagal menjalankan PostgreSQL lokal.' }
