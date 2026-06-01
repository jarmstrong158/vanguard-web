@echo off
title Vanguard  -  keep this window open while playing
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js / npm not found on PATH. Install Node.js first: https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo First run - installing dependencies, please wait...
  call npm install
)

REM If a server is already running on 5173, just open the game against it.
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:5173' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  echo A game server is already running - opening the game window...
  call "%~dp0_open.bat"
  exit /b 0
)

echo.
echo   Starting VANGUARD - a game window will open once the server is ready.
echo   Keep this console open while you play. Close it to quit.
echo.

REM open the game window as soon as the server responds (polls in the background)
start "" /b cmd /c "%~dp0_open.bat"

REM run the dev server in THIS window (keeps it alive)
call npm run dev -- --port 5173 --strictPort

echo.
echo (server stopped) - press any key to close.
pause >nul
