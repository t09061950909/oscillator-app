@echo off
REM scripts\fetch-missing-dates.bat
REM 欠落日付の個別補完用

setlocal

echo === 欠落日付の補完 ===

echo [1/3] 2025-09-08 取得中...
set FETCH_MODE=date
set FETCH_DATE=2025-09-08
npx tsx --env-file=.env.local scripts/fetch-prices.ts

echo [2/3] 2025-09-09 取得中...
set FETCH_MODE=date
set FETCH_DATE=2025-09-09
npx tsx --env-file=.env.local scripts/fetch-prices.ts

echo [3/3] 2025-09-12 取得中...
set FETCH_MODE=date
set FETCH_DATE=2025-09-12
npx tsx --env-file=.env.local scripts/fetch-prices.ts

echo === 完了 ===
endlocal
