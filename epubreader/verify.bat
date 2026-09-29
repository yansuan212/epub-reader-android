@echo off
setlocal
cd /d "%~dp0"

set "PYEXE="
if exist "C:\Users\yansuan\AppData\Local\Programs\Python\Python312\python.exe" set "PYEXE=C:\Users\yansuan\AppData\Local\Programs\Python\Python312\python.exe"
if not "%PYEXE%"=="" goto pyok
for /f "delims=" %%i in ('where python 2^>nul') do set "PYEXE=%%i"
:pyok
if not "%PYEXE%"=="" goto node
echo.
echo   [!] Python not found.
echo.
pause
exit /b 1

:node
set "NODEEXE="
if exist "C:\Users\yansuan\.workbuddy\binaries\node\versions\22.22.2-3\node.exe" set "NODEEXE=C:\Users\yansuan\.workbuddy\binaries\node\versions\22.22.2-3\node.exe"
if not "%NODEEXE%"=="" goto mods
for /f "delims=" %%i in ('where node 2^>nul') do set "NODEEXE=%%i"
:mods
if not "%NODEEXE%"=="" goto run
echo.
echo   [!] Node.js not found.
echo.
pause
exit /b 1

:run
if exist "C:\Users\yansuan\.workbuddy\binaries\node\workspace\node_modules\jsdom" set "NODE_PATH=C:\Users\yansuan\.workbuddy\binaries\node\workspace\node_modules"

echo ============================================================
echo   EPUB Reader - offline verification (jsdom)
echo ============================================================
"%PYEXE%" tools\build.py
if errorlevel 1 goto fail
"%NODEEXE%" tools\verify.js
if errorlevel 1 goto failed
echo.
pause
exit /b 0

:failed
echo.
echo   Some checks FAILED - see the list above.
echo.
pause
exit /b 1

:fail
echo.
echo   Build FAILED.
echo.
pause
exit /b 1
