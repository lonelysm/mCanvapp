@echo off
REM Flask 앱 실행 (AGENTS.md: 백엔드 Flask, 프론트 Jinja2+정적 JS)
cd /d "%~dp0"

python --version >nul 2>&1
if errorlevel 1 (
    echo Failed to start server. Please check if Python is installed and in the PATH.
    pause
    exit /b 1
)

if not exist "server\app.py" (
    echo server\app.py not found. Run from mCanvapp root.
    pause
    exit /b 1
)

echo.
echo Open http://127.0.0.1:5000 in your browser.
echo To stop the server, press Ctrl+C in this window.
echo.
set FLASK_APP=server.app
python -m flask run --host=127.0.0.1 --port=5000

pause
