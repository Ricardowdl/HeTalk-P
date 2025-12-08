@echo off
setlocal ENABLEEXTENSIONS
cd /d %~dp0

where npm >nul 2>nul
if %errorlevel% neq 0 (
  echo npm/Node.js not found. Please install Node.js and try again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install
)

echo Starting backend and frontend...
start "Dev" cmd /k npm run dev

echo Opening browser...
timeout /t 4 /nobreak > nul
start "AI Story Game" http://localhost:5173/

echo If browser did not open automatically, visit: http://localhost:5173/
echo Check logs in the window named "Dev".
exit /b 0
