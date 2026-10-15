@echo off
setlocal
cd /d "%~dp0"
title Song Decoder

set "PYTHON=%~dp0backend\.venv\Scripts\python.exe"
set "URL=http://127.0.0.1:8420"

if not exist "%PYTHON%" (
    echo.
    echo   Setup is missing: backend\.venv was not found.
    echo.
    echo   Run this once from the project folder:
    echo     py -3.11 -m venv backend\.venv
    echo     backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
    echo.
    pause
    exit /b 1
)

if not exist "%~dp0frontend\dist\index.html" (
    echo.
    echo   The web page has not been built yet.
    echo.
    echo   Run this once from the frontend folder:
    echo     npm install
    echo     npm run build
    echo.
    pause
    exit /b 1
)

echo Starting Song Decoder...

REM Launch the server in its own minimised window. Closing that window stops
REM the app. If it is already running this new one just fails to grab the port
REM and closes itself, which is fine - the health check below finds the
REM original and we go straight to the browser.
start "Song Decoder server" /min "%PYTHON%" "%~dp0backend\run.py"

REM Don't open the browser until the server actually answers, otherwise the
REM first page load races the ~3 seconds it takes librosa to import.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "for ($i = 0; $i -lt 90; $i++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%URL%/api/health' | Out-Null; exit 0 } catch { Start-Sleep -Milliseconds 500 } }; exit 1"

if errorlevel 1 (
    echo.
    echo   The server did not start. Check the "Song Decoder server" window
    echo   for the error message.
    echo.
    pause
    exit /b 1
)

start "" "%URL%"
exit /b 0
