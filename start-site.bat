@echo off
chcp 65001 >nul
title Lunar Navigator site :44000
cd /d "%~dp0"

rem Static site + /api proxy for space.mindal1ka.com (Caddy in front).
rem Kept alive by the starter supervisor (C:\Users\A\Documents\starter\data.txt).
rem The loop restarts the server by itself: scripts\restart.bat site kills it,
rem and it comes back here in 2 s without the window closing.

echo.
echo   Lunar Landing Site Navigator - site
echo   address  http://127.0.0.1:44000  (API proxied to :44001)
echo   restart  scripts\restart.bat site
echo.

:loop
node serve.mjs
echo   site stopped, restarting in 2 s
timeout /t 2 /nobreak >nul
goto loop
