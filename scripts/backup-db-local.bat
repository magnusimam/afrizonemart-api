@echo off
REM Double-click launcher for backup-db-local.ps1.
REM
REM Edit the destination below to point at YOUR external drive,
REM then save this file. Double-clicking it runs the backup.

set "BACKUP_DEST=E:\afrizonemart-backups"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup-db-local.ps1" -Destination "%BACKUP_DEST%" %*
echo.
pause
