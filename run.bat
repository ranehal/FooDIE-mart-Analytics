@echo off
title FoodiBD Scraper Suite
cd /d "%~dp0"

echo ============================================
echo   FoodiBD Scraper - One-Click Launcher
echo ============================================
echo.

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found in PATH!
    pause
    exit /b 1
)

:: Install deps if needed
if not exist ".deps_installed" (
    echo [SETUP] Installing dependencies...
    pip install -r requirements.txt -q
    if %errorlevel% equ 0 (
        echo. > .deps_installed
        echo [SETUP] Done.
    ) else (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
)

echo.
echo [1] Run Scraper
echo [2] Start Dashboard
echo [3] Run Scraper + Dashboard
echo [4] Run Scraper (background) + Dashboard
echo.
set /p choice="Select (1-4): "

if "%choice%"=="1" goto scraper
if "%choice%"=="2" goto dashboard
if "%choice%"=="3" goto both
if "%choice%"=="4" goto bg
goto dashboard

:scraper
echo.
echo [SCRAPER] Starting scraper...
python scraper.py
echo.
echo [SCRAPER] Done. Press any key to exit.
pause >nul
exit /b 0

:dashboard
echo.
echo [DASHBOARD] Starting on http://localhost:8800
echo [DASHBOARD] Opening browser...
start "" http://localhost:8800
timeout /t 2 /nobreak >nul
python dashboard.py
pause
exit /b 0

:both
echo.
echo [SCRAPER] Running scraper first...
python scraper.py
echo.
echo [DASHBOARD] Starting dashboard on http://localhost:8800
echo [DASHBOARD] Opening browser...
start "" http://localhost:8800
timeout /t 2 /nobreak >nul
python dashboard.py
pause
exit /b 0

:bg
echo.
echo [SCRAPER] Starting scraper in background...
start /b python scraper.py
timeout /t 3 /nobreak >nul
echo [DASHBOARD] Starting dashboard on http://localhost:8800
echo [DASHBOARD] Opening browser...
start "" http://localhost:8800
timeout /t 2 /nobreak >nul
python dashboard.py
pause
exit /b 0
