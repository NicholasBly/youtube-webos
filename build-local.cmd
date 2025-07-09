@echo off
setlocal enabledelayedexpansion

echo Building YouTube WebOS locally...
echo.

echo [1/3] Installing dependencies...
call npm ci
if !errorlevel! neq 0 (
    echo ERROR: npm ci failed
    echo Press any key to close...
    pause >nul
    exit /b 1
)

echo [2/3] Building project...
call npm run build
if !errorlevel! neq 0 (
    echo ERROR: npm run build failed
    echo Press any key to close...
    pause >nul
    exit /b 1
)

echo [3/3] Creating .ipk package...
call npm run package
if !errorlevel! neq 0 (
    echo ERROR: npm run package failed
    echo Press any key to close...
    pause >nul
    exit /b 1
)

echo.
echo ✅ Build complete! Your .ipk file is ready.
echo Look for: youtube.leanback.v4_*_all.ipk
echo Press any key to close...
pause >nul