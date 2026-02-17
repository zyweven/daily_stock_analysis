# 🏗️ 系统架构与原理解析

## 1. 核心工作流 (Workflow)

整个系统的核心是一个**ETL + AI 分析**的流水线：

```mermaid
graph TD
    A[启动 (main.py)] --> B{运行模式};
    B -->|定时任务| C[Scheduler];
    B -->|Web服务| D[FastAPI Server];
    B -->|单次运行| E[Pipeline];
    
    C -->|触发| E;
    D -->|API触发| E;
    
    subgraph "核心分析流水线 (Pipeline)"
        E --> F[1. 数据获取 (DataFetcher)];
        F --> G[2. 信息检索 (SearchService)];
        G --> H[3. AI 分析 (GeminiAnalyzer)];
        H --> I[4. 结果生成 (Report)];
        I --> J[5. 消息推送 (Notifier)];
    end
    
    F -- 获取行情 --> K[(数据源: AkShare/Tushare/YFinance)];
    G -- 搜索新闻 --> L[(搜索引擎: Tavily/Bocha/Google)];
    H -- 调用大模型 --> M[(LLM: Gemini/OpenAI/DeepSeek)];
    J -- 推送报告 --> N[用户: 飞书/微信/Telegram];
```

## 2. 模块详解

### 🛠️ 1. 混合配置与后端 (`src/core/config_backend.py`)
- **功能**: 实现配置的解耦。支持 **Env 模式**（读写 `.env`，适合本地开发）和 **DB 模式**（读写数据库 `system_config` 表，适合生产环境动态热更新）。
- **关键点**:
    - `ConfigManager` 作为中控，调度不同的配置后端。
    - 运行时检测 `CONFIG_STORAGE_TYPE` 环境变量进行模式切换。

### 📊 2. 数据获取方案
... (保持现状)

### 📊 2. 数据获取 (`src/data_provider/`)
- **功能**: 获取股票的实时价格、历史 K 线、技术指标。
- **多源策略**:
    - **A股**: 优先用 `efinance` / `akshare` (实时性好)。
    - **港/美股**: 使用 `yfinance`。
    - **加密货币**: 使用 `yfinance` 或 交易所 API。
- **数据清洗**: 统一不同数据源的格式，计算 MA5/MA10/MA20 等均线数据。

### 🔍 3. 信息检索 (`src/search_service.py`)
- **功能**: 为 AI 提供"只有人类分析师才知道"的实时消息。
- **原理**: 用股票名称构造关键词（如 "贵州茅台 利好 利空"），调用搜索引擎 API (Tavily/Bocha) 获取最新新闻摘要。
- **作用**: 让 AI 知道最近发生了什么（业绩预告、政策变动、突发事件），避免仅凭技术面瞎分析。

### 🧠 3. 专家会诊模式 (`src/core/expert_panel.py`)
- **核心逻辑**: 并行调度 + 共识算法。
- **并发调度**: 使用 `ThreadPoolExecutor` 同时发起最多 5 个分析请求，解决 LLM 响应慢的问题。
- **共识算法**: 汇总各模型的得分（均值）和操作建议（多数票制）。
- **Prompt 策略**: 为不同模型（Gemini vs OpenAI 兼容模型）适配不同的系统提示词模板。

### 📢 5. 消息推送 (`src/notification.py`)
- **功能**: 将枯燥的 JSON 数据转换成漂亮的研报。
- **适配**:
    - **飞书/钉钉**: 发送富文本卡片 (Interactive Cards)。
    - **微信**: 发送 Markdown 文本。
    - **邮件**: 生成 HTML 报表。

## 3. 为什么它能工作？

这个项目的本质是 **"RAG (检索增强生成)"** 的一个具体应用：

1.  **Retrieve (检索)**: 此时此刻的股价、成交量、最新新闻。
2.  **Augment (增强)**: 将这些实时数据填入 Prompt 模板。
3.  **Generate (生成)**: 让大模型基于这些事实，结合内置的交易逻辑，生成分析结论。

这就好比你雇了一个懂交易的秘书，他每天按你给的模版（Prompt），去网上搜集资料（Retrieve），填好表格交给你（Generate）。
