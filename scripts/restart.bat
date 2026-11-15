@echo off
rem Restart the site and/or API without admin rights.
rem Creates a flag file in the repo root; the server notices it within 2 s,
rem deletes it and exits, and the loop in start-site.bat / start-api.bat
rem (kept alive by the starter supervisor) starts it again.
rem Usage: scripts\restart.bat [site^|api^|all]   (default: all)
setlocal
set ROOT=%~dp0..
set WHAT=%~1
if "%WHAT%"=="" set WHAT=all
if /i "%WHAT%"=="site" call :flag site
if /i "%WHAT%"=="api" call :flag api
if /i "%WHAT%"=="all" (
  call :flag site
  call :flag api
)
exit /b 0

:flag
type nul > "%ROOT%\.restart-%1"
echo   restart requested: %1
exit /b 0
