@echo off
chcp 65001 >nul
title Lunar Navigator API :44001
cd /d "%~dp0pipeline"

rem Point and square API (horizon from LOLA 40 m), used by the site through /api.
rem Kept alive by the starter supervisor; restart with scripts\restart.bat api.

echo.
echo   Lunar Landing Site Navigator - API
echo   address  http://127.0.0.1:44001
echo   restart  scripts\restart.bat api
echo.

:loop
..\.venv\Scripts\python -W ignore api.py
echo   API stopped, restarting in 2 s
timeout /t 2 /nobreak >nul
goto loop
