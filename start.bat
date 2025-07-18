@echo off
echo Starting Tidal Dashboard...
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python is not installed or not in PATH
    echo Please install Python 3.8 or higher from https://www.python.org/downloads/
    pause
    exit /b 1
)

REM Check if virtual environment exists
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Install requirements if needed
if not exist "venv\Lib\site-packages\flask" (
    echo Installing requirements...
    pip install -r requirements.txt
)

REM Start the application
echo Starting Flask server...
python app.py

pause 