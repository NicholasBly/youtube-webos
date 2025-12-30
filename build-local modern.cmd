@echo off
setlocal enabledelayedexpansion

echo Building YouTube WebOS locally...
echo.

:: Check if node_modules exists. If not, run npm install (faster than ci)
if not exist "node_modules\" (
    echo [1/4] Installing dependencies...
    call npm install
    if !errorlevel! neq 0 (
        echo ERROR: npm install failed
        pause
        exit /b 1
    )
) else (
    echo [1/4] Dependencies already installed. Skipping...
)

echo [2/4] Building project...
call npm run build:modern
if !errorlevel! neq 0 (
    echo ERROR: npm run build failed
    echo Press any key to close...
    pause >nul
    exit /b 1
)

echo [3/4] Creating .ipk package...
call npm run package
if !errorlevel! neq 0 (
    echo ERROR: npm run package failed
    echo Press any key to close...
    pause >nul
    exit /b 1
)

echo [4/4] Copying userScript.js to clipboard...

SET "SOURCE_FILE=dist\webOSUserScripts\userScript.js"

IF EXIST "%SOURCE_FILE%" (
    powershell.exe -NoProfile -Command "[System.IO.File]::ReadAllText('%SOURCE_FILE%') | Set-Clipboard"
    echo Success! userScript.js contents copied to clipboard.
) ELSE (
    echo ERROR: Could not find userScript.js at %SOURCE_FILE%
    echo Please edit the batch file to point to the correct build location.
)

echo.
echo Build complete!