@echo off
REM Double-click this on Windows to generate the labels PDF and open it.
cd /d "%~dp0"
python make_labels.py
if errorlevel 1 (
    echo.
    echo Something went wrong. Make sure Python is installed and you have run:
    echo     pip install -r requirements.txt
    pause
    exit /b 1
)
start "" "labels_to_print.pdf"
