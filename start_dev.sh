#!/bin/bash
set -e

echo "[INFO] Step 1/3: Stopping existing Python processes main.py..."
pkill -f "python main.py" || echo "[INFO] No existing main.py process found or failed to kill."

echo "[INFO] Step 2/3: Building Frontend..."
cd apps/dsa-web
npm run build
cd ../..

echo "[INFO] Step 3/3: Starting Backend..."
if [ -f ".venv/bin/python" ]; then
    echo "[INFO] Using virtual environment..."
    ./.venv/bin/python main.py --webui-only
else
    echo "[ERROR] Virtual environment not found in .venv!"
    exit 1
fi
