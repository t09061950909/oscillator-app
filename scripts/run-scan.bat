@echo off
REM scripts\run-scan.bat - Windows用本番スキャン実行

setlocal

if "%~1"=="dry" (
  set DRY_RUN=true
  echo [DRY RUN モード] DBへの書き込みはスキップされます
) else (
  set DRY_RUN=false
  echo [本番モード] DBへ書き込みます
)

set MA_PAIR=25,75
set MARKET=JP

echo.
echo === GC/DC スキャン開始 ===
echo MAペア: %MA_PAIR%
echo DRY_RUN: %DRY_RUN%
echo.

npx tsx --env-file=.env.local scripts/scan.ts

endlocal
