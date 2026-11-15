@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
if "%~1"=="" (
    python skymir.py scan
    echo.
    echo   extract ^| list ^| save ^| cosave ^| pdf ^| analyze  -- see README.md
    echo.
    pause
) else (
    python skymir.py %*
    pause
)
