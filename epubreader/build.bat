@echo off
setlocal
cd /d "%~dp0"

set "PYEXE="
if exist "C:\Users\yansuan\AppData\Local\Programs\Python\Python312\python.exe" set "PYEXE=C:\Users\yansuan\AppData\Local\Programs\Python\Python312\python.exe"
if not "%PYEXE%"=="" goto run
for /f "delims=" %%i in ('where python 2^>nul') do set "PYEXE=%%i"
if not "%PYEXE%"=="" goto run

echo.
echo   [!] Python not found.
echo       Install Python 3.8+ and make sure it is on PATH.
echo.
pause
exit /b 1

:run
echo ============================================================
echo   EPUB Reader - build single-file reader.html
echo ============================================================
"%PYEXE%" tools\build.py
if errorlevel 1 goto fail
echo.
echo   Output : dist\reader.html
echo   Next   : build_apk.bat   (needs JDK 17 + Android SDK)
echo.
pause
exit /b 0

:fail
echo.
echo   Build FAILED.
echo.
pause
exit /b 1
