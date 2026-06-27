@echo off
REM scripts\run-test.bat - Windows用テストスキャン実行

setlocal

if "%~1"=="" (
  set TEST_SYMBOLS=7203,6758,9984,8306,6861
) else (
  set TEST_SYMBOLS=%~1
)

set MA_PAIR=25,75
set MARKET=JP

echo.
echo === テストスキャン開始 ===
echo 銘柄: %TEST_SYMBOLS%
echo MAペア: %MA_PAIR%
echo.

npx tsx --env-file=.env.local scripts/scan-test.ts

endlocal
