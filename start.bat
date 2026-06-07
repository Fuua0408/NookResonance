@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo ================================
echo   NookResonance start
echo ================================
echo.

if not exist ".env" (
  echo [ERROR] .env not found.
  echo Copy .env.example to .env and set JWT_SECRET, then restart.
  echo.
  echo   copy .env.example .env
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [INFO] node_modules not found. Running npm install...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
  echo.
)

if not exist "data\" mkdir data

echo Starting server...
echo URL: http://localhost:18090
echo Press Ctrl+C to stop.
echo.

node src/index.js
