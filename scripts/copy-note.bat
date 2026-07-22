@echo off
echo ===== note copy tool =====
echo 1: Vol.1
echo 2: Vol.2
echo 3: Vol.3
echo.
set /p choice=Enter number: 

set "base=C:\Users\uck\.gemini\antigravity\brain\d54f485a-9b1e-4b5b-a6fd-dbce3ac20169"

if "%choice%"=="1" powershell -ExecutionPolicy Bypass -STA -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetText([System.IO.File]::ReadAllText('%base%\note_vol01.md', [System.Text.Encoding]::UTF8))"
if "%choice%"=="2" powershell -ExecutionPolicy Bypass -STA -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetText([System.IO.File]::ReadAllText('%base%\note_vol02.md', [System.Text.Encoding]::UTF8))"
if "%choice%"=="3" powershell -ExecutionPolicy Bypass -STA -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetText([System.IO.File]::ReadAllText('%base%\note_vol03.md', [System.Text.Encoding]::UTF8))"

echo Done! Paste to note.
pause
