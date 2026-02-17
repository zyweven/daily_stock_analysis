@echo off
setlocal

echo [INFO] Step 1/3: Stopping existing Python processes...
taskkill /F /IM python.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] Existing Python processes terminated.
) else (
    echo [INFO] No running Python processes found.
)

echo [INFO] Step 2/3: Building Frontend...
cd apps/dsa-web
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed!
    pause
    exit /b %errorlevel%
)
cd ../..

echo [INFO] Step 3/3: Starting Backend...
if exist .\.venv\Scripts\python.exe (
    echo [INFO] Using virtual environment...
    .\.venv\Scripts\python main.py --webui-only
) else (
    echo [ERROR] Virtual environment not found in .\.venv!
    pause
    exit /b 1
)

endlocal
