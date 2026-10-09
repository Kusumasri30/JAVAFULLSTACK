@echo off
setlocal
cd /d "%~dp0"
if not exist out mkdir out
javac -d out src\main\java\game\Main.java
if errorlevel 1 exit /b 1
java -cp out game.Main