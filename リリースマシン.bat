@echo off
cd /d "%~dp0"
node scripts\release-machine\server.mjs --browser
if errorlevel 1 pause
