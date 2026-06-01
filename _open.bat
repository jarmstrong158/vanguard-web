@echo off
REM Wait until the Vite dev server is actually responding, then open the game
REM in an app-style window (no tabs / address bar). Polls instead of guessing a delay.
set "URL=http://localhost:5173"

echo Waiting for the game server to start...
set /a tries=0
:wait
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto ready
set /a tries+=1
if %tries% geq 60 (
  echo Server did not start in time. Opening anyway...
  goto ready
)
timeout /t 1 >nul
goto wait

:ready
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "CHROME86=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --app=%URL% --window-size=1280,768
) else if exist "%CHROME%" (
  start "" "%CHROME%" --app=%URL% --window-size=1280,768
) else if exist "%CHROME86%" (
  start "" "%CHROME86%" --app=%URL% --window-size=1280,768
) else (
  start "" %URL%
)
