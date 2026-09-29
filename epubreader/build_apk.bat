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
echo.
pause
exit /b 1

:run
echo ============================================================
echo   EPUB Reader - build APK
echo ============================================================
echo.
echo   Needs: JDK 17 and Android SDK (build-tools + platforms).
echo   Set ANDROID_HOME if the script cannot find the SDK.
echo.
"%PYEXE%" tools\build.py
if errorlevel 1 goto fail
"%PYEXE%" android\tools\build_apk.py
if errorlevel 1 goto fail
echo.
echo   APK is in the dist folder.
echo.
pause
exit /b 0

:fail
echo.
echo   FAILED - see the message above.
echo.
pause
exit /b 1
