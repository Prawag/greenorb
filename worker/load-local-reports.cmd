@echo off
setlocal
rem GreenOrb: read every PDF in Backend\downloaded_reports into the database set in worker\.env.
rem Safe to close and run again: files already read are skipped. Files that are not sustainability
rem reports, or belong to another company, are skipped and listed in Backend\bulk-skipped.csv.
cd /d "%~dp0"

if not exist ".env" (
  echo worker\.env is missing. Copy .env.example to .env and put your Neon DATABASE_URL in it.
  pause
  exit /b 1
)

set "PY=python"
where py >nul 2>nul && set "PY=py -3"

if not exist ".venv\Scripts\python.exe" (
  echo First run: creating a Python environment in worker\.venv ...
  %PY% -m venv .venv
  if errorlevel 1 goto :nopython
)
echo Checking Python packages ...
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -q -r requirements.txt
if errorlevel 1 goto :pipfail

echo.
echo Reading reports with 3 workers. Leave this window open; progress is also written to Backend\bulk-log.txt.
echo Press Ctrl+C to stop. Run this file again to continue where it stopped.
echo.
".venv\Scripts\python.exe" -m greenorb_worker bulk ..\Backend\downloaded_reports --workers 3 --batch 12 --retry-empty --harvest 100 --db-limit-mb 470 %*
echo.
echo Finished. You can close this window.
pause
exit /b 0

:nopython
echo Python 3.10 or newer was not found. Install it from https://www.python.org/downloads/ (tick "Add to PATH"), then run this again.
pause
exit /b 1

:pipfail
echo Installing Python packages failed. Check your internet connection and run this again.
pause
exit /b 1
