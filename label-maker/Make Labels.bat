@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Label Maker

REM ---------------------------------------------------------------------------
REM Double-click this to build labels_to_print.pdf from the Print Labels tab.
REM On the first run it auto-installs the Python packages it needs.
REM ---------------------------------------------------------------------------

REM --- 1. Find a working Python (prefer the 'py' launcher, then 'python') -----
set "PY="
py -3 --version >nul 2>nul && set "PY=py -3"
if not defined PY (
    python --version >nul 2>nul && set "PY=python"
)
if not defined PY (
    echo.
    echo  ============================================================
    echo   Python was not found.
    echo.
    echo   Install Python 3 from https://www.python.org/downloads/
    echo   and be sure to check "Add Python to PATH" during setup.
    echo  ============================================================
    echo.
    pause
    exit /b 1
)
echo Using Python:
%PY% --version

REM --- 2. Make sure openpyxl and reportlab are installed ---------------------
echo Checking required packages...
%PY% -c "import openpyxl, reportlab" >nul 2>nul
if errorlevel 1 (
    echo Installing required packages ^(first run only, needs internet^)...
    %PY% -m pip install --upgrade pip >nul 2>nul
    %PY% -m pip install -r requirements.txt
    if errorlevel 1 (
        echo.
        echo  Could not install the packages automatically. Try running this
        echo  command in a Command Prompt, then run this file again:
        echo.
        echo      %PY% -m pip install openpyxl reportlab
        echo.
        pause
        exit /b 1
    )
    REM verify the install actually worked
    %PY% -c "import openpyxl, reportlab" >nul 2>nul
    if errorlevel 1 (
        echo.
        echo  Packages still not available after install. See messages above.
        echo.
        pause
        exit /b 1
    )
    echo Packages installed.
)

REM --- 3. Build the labels ---------------------------------------------------
echo.
echo Building labels...
%PY% make_labels.py
if errorlevel 1 (
    echo.
    echo  The label script reported an error ^(see the messages above^).
    echo  Common causes: the workbook is open in Excel, or no SKUs were picked.
    echo.
    pause
    exit /b 1
)

REM --- 4. Open the finished PDF ----------------------------------------------
echo.
echo Done. Opening labels_to_print.pdf ...
start "" "labels_to_print.pdf"
exit /b 0
