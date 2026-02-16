# A股自选股智能分析系统 - 快速使用指南

## ❌ 报错原因解析

您遇到的 `ModuleNotFoundError: No module named 'dotenv'` 错误，是因为您直接使用了系统默认的 `python`，而项目的依赖库通常安装在**虚拟环境** (`.venv`) 中。

**✅ 正确的运行方式是使用虚拟环境中的 Python解释器：**
`.\.venv\Scripts\python`

---

## 🚀 常用指令速查 (请务必使用以下指令)

### 1. 启动 Web 界面 (推荐)
启动后，可以通过浏览器访问可视化界面，进行股票管理和查看报告。
```powershell
.\.venv\Scripts\python main.py --webui-only
```
- **访问地址**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **API 文档**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### 2. 执行一次完整分析
这会立即分析您配置的所有股票，并发送通知（如果配置了）。
```powershell
.\.venv\Scripts\python main.py
```

### 3. 启动定时任务模式
程序会持续运行，并在每天设定时间（默认 18:00）自动执行分析。
```powershell
.\.venv\Scripts\python main.py --schedule
```

### 4. 启动 Web 服务 + 定时任务
既提供 Web 界面，后台也会按计划执行任务。
```powershell
.\.venv\Scripts\python main.py --serve
```

---

## ⚙️ 如何添加/管理股票

目前有两种方式管理您的自选股：

### 方式一：通过 Web 界面 (推荐)
1. 启动 Web 服务: `.\.venv\Scripts\python main.py --webui-only`
2. 浏览器访问 [http://127.0.0.1:8000](http://127.0.0.1:8000)
3. 在 "System Config" 或 "Stocks" 页面进行添加 (具体取决于前端功能实现，后端API已支持)。

### 方式二：直接修改配置文件
1. 打开项目根目录下的 `.env` 文件。
2. 找到 `STOCK_LIST` 配置项。
3. 按格式添加股票代码（逗号分隔）：
   ```ini
   STOCK_LIST=600519,00700,AAPL,BTC-USD
   ```
   - **A股**: 6位代码 (如 `600519`)
   - **港股**: 5位代码 (如 `00700`)
   - **美股**: 代码 (如 `AAPL`)
   - **加密货币**: 代码 (如 `BTC-USD`)

---

## 🛠️ 项目主要功能

1.  **AI 智能分析**: 利用大模型 (Gemini/OpenAI) 对股票进行全方位分析。
2.  **决策仪表盘**: 生成包含买卖建议、支撑压力位、风险提示的直观日报。
3.  **多渠道推送**: 支持飞书、微信、Telegram 等多种通知方式。
4.  **大盘复盘**: 自动总结每日市场行情。
5.  **Web 管理**: 提供可视化的管理界面。

---

如有其他问题，欢迎随时询问！

---

## ❓ 常见问题与排查

### Q1: Web 界面显示 API JSON 而不是前端页面？
**原因**：通常是因为后台服务进程卡死，或者在前端编译完成前就启动了服务。
**解决方法**：
1. **强制关闭所有 Python 进程**（请在 PowerShell管理员模式下运行）：
   ```powershell
   taskkill /F /IM python.exe
   ```
2. **重新启动服务**：
   ```powershell
   .\.venv\Scripts\python main.py --webui-only
   ```
3. **刷新浏览器** (Ctrl+F5 强制刷新)。

### Q2: 提示 `ModuleNotFoundError`？
请确保使用虚拟环境启动：`.\.venv\Scripts\python`，而不是直接用 `python`。
