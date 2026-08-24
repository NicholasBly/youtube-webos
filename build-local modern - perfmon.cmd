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
call npm run build:perf
if !errorlevel! neq 0 (
    echo ERROR: npm run build failed
    echo Press any key to close...
    pause >nul
    exit /b 1
)

echo [3/5] Creating .ipk package...

:: Stash any existing (legacy) .ipk so packaging can't overwrite it
:: and so the rename step can't grab it
set "STASH=_ipk_stash"
if exist "%STASH%" rd /s /q "%STASH%"
md "%STASH%" >nul 2>&1
for /f "delims=" %%f in ('dir /b /a-d "dist\youtube.leanback.v4_*_all.ipk" 2^>nul') do (
    move /y "dist\%%f" "%STASH%\" >nul
)

call npm run package
if !errorlevel! neq 0 (
    echo ERROR: npm run package failed
    for /f "delims=" %%f in ('dir /b /a-d "%STASH%\*.ipk" 2^>nul') do move /y "%STASH%\%%f" "dist\" >nul
    rd /s /q "%STASH%" 2>nul
    echo Press any key to close...
    pause >nul
    exit /b 1
)

echo [4/5] Renaming .ipk file for modern build...
:: Only the freshly built modern .ipk can match now - the legacy one is stashed
for /f "delims=" %%f in ('dir /b /a-d /o-d "dist\youtube.leanback.v4_*_all.ipk" 2^>nul') do (
    if exist "dist\%%~nf_webOS22+.ipk" del /f /q "dist\%%~nf_webOS22+.ipk"
    ren "dist\%%f" "%%~nf_webOS22+.ipk"
    echo Renamed modern build: "dist\%%f" -^> "dist\%%~nf_webOS22+.ipk"
    goto :rename_done
)
:rename_done

:: Restore the legacy .ipk(s) exactly as they were
for /f "delims=" %%f in ('dir /b /a-d "%STASH%\*.ipk" 2^>nul') do move /y "%STASH%\%%f" "dist\" >nul
rd /s /q "%STASH%" 2>nul

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