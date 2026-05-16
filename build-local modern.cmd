@echo off
setlocal enabledelayedexpansion

echo Building YouTube WebOS locally...
echo.

:: Check if node_modules exists. If not, run npm install (faster than ci)
if not exist "node_modules\" (
    echo [1/5] Installing dependencies...
    call npm install
    if !errorlevel! neq 0 (
        echo ERROR: npm install failed
        pause
        exit /b 1
    )
) else (
    echo [1/5] Dependencies already installed. Skipping...
)

echo [2/5] Building project...
call npm run build:modern
if !errorlevel! neq 0 (
    echo ERROR: npm run build failed
    echo Press any key to close...
    pause >nul
    exit /b 1
)

echo [3/5] Creating .ipk package...
call npm run package
if !errorlevel! neq 0 (
    echo ERROR: npm run package failed
    echo Press any key to close...
    pause >nul
    exit /b 1
)

echo [4/5] Renaming .ipk file for modern build...
:: 'dir /b /a-d /o-d' lists files sorted by newest first.
:: We grab the first (newest) one, rename it, and use 'goto' to immediately break the loop so it ignores any older files.
for /f "delims=" %%f in ('dir /b /a-d /o-d "youtube.leanback.v4_*_all.ipk" 2^>nul') do (
    ren "%%f" "%%~nf_webOS22+.ipk"
    echo Renamed newest build: "%%f" -^> "%%~nf_webOS22+.ipk"
    goto :rename_done
)
:rename_done

echo [5/5] Copying userScript.js to clipboard...

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