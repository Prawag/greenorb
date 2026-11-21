@echo off
rem Reads every PDF in Backend\downloaded_reports into GreenOrb, 20 at a time, using the settings
rem in worker\.env. Safe to stop with Ctrl+C and start again: files already read are skipped, and
rem reports that came back with no figures are read again with the newer extractor.
cd /d "%~dp0"
if exist .venv\Scripts\activate.bat call .venv\Scripts\activate.bat
python -m greenorb_worker bulk ..\Backend\downloaded_reports --batch 20 --retry-empty %*
echo.
echo Finished. You can close this window.
pause
