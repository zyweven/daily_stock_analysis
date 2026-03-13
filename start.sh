#!/bin/bash
# ===================================
# A股自选股智能分析系统 - 启动脚本
# ===================================

cd "$(dirname "$0")"

echo "======================================"
echo "  A股自选股智能分析系统 - Web UI"
echo "======================================"
echo ""

# 检查虚拟环境
if [ ! -d ".venv" ]; then
    echo "⚙️  创建虚拟环境..."
    uv venv .venv --python 3.11
fi

# 激活虚拟环境
source .venv/bin/activate

# 检查依赖
if [ ! -f ".venv/bin/python" ] || ! python -c "import fastapi" 2>/dev/null; then
    echo "⚙️  安装依赖..."
    uv pip install -r requirements.txt
fi

# 安装可选依赖（交易日检查）
if ! python -c "import exchange_calendars" 2>/dev/null; then
    echo "⚙️  安装 exchange-calendars（交易日检查）..."
    uv pip install exchange-calendars
fi

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "⚠️  未找到 .env 文件，使用默认配置"
    echo "   请复制 .env.example 为 .env 并填入配置"
fi

echo ""
echo "🚀 启动 Web UI..."
echo "   地址: http://localhost:8000"
echo "   按 Ctrl+C 停止"
echo ""

# 启动 Web UI
python main.py --webui
