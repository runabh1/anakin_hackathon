@echo off
title First Gen Navigator - Java Desktop App
echo.
echo  ======================================
echo   First Gen Navigator - Starting Java app...
echo  ======================================
echo.
echo  This launcher opens the JavaFX desktop application.
echo.

where java >nul 2>nul
if errorlevel 1 (
  echo Java was not found on PATH.
  echo Install JDK 21+ and try again.
  pause
  exit /b 1
)

if not exist "java-app\target\classes\com\firstgennavigator\App.class" (
  echo Java classes were not found.
  echo Build the Java app first in the java-app folder, then run this launcher again.
  pause
  exit /b 1
)

set "JFX_ROOT=%USERPROFILE%\.m2\repository\org\openjfx"
set "CP=java-app\target\classes;%USERPROFILE%\.m2\repository\com\google\code\gson\gson\2.11.0\gson-2.11.0.jar"
set "JFX_MODULE_PATH=%JFX_ROOT%\javafx-controls\21.0.5\javafx-controls-21.0.5-win.jar;%JFX_ROOT%\javafx-graphics\21.0.5\javafx-graphics-21.0.5-win.jar;%JFX_ROOT%\javafx-base\21.0.5\javafx-base-21.0.5-win.jar"

java --module-path "%JFX_MODULE_PATH%" --add-modules javafx.controls,javafx.graphics -cp "%CP%" com.firstgennavigator.App
