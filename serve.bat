@echo off
REM ES module + file:// CORS 회피: 로컬 HTTP 서버로 실행
cd /d "%~dp0"

python --version >nul 2>&1
if errorlevel 1 (
    echo Failed to start server. Please check if Python is installed and in the PATH.
    pause
    exit /b 1
)

echo.
echo Open http://127.0.0.1:8080 in your browser.
echo To stop the server, press Ctrl+C in this window.
echo Do not close this window. Closing it will stop the server.
echo.
python -m http.server 8080

pause
