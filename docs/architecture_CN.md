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

### 🛠️ 1. 配置加载 (`src/config.py`)
- **功能**: 系统启动时，首先加载 `.env` 文件。
- **关键点**:
    - 读取 API Keys (LLM, 搜索, 推送)。
    - 解析股票列表 (`STOCK_LIST`)。
    - 处理代理设置 (`HTTP_PROXY`)，**智能跳过国内数据源的代理**，防止获取 A 股行情失败。

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

### 🧠 4. AI 分析核心 (`src/analyzer.py`)
- **功能**: 扮演"资深交易员"。
- **输入**:
    - 技术面数据（价格、涨跌幅、均线形态）。
    - 消息面数据（新闻摘要）。
    - **系统提示词 (System Prompt)**: 也就是我们在 `GeminiAnalyzer` 类中看到的那个超长的 Prompt。
- **Prompt 策略**:
    - **严进策略**: 告诉 AI，乖离率 > 5% 必须喊停。
    - **趋势判断**: 教 AI 识别多头排列 (MA5 > MA10 > MA20)。
    - **输出格式**: 强制 AI 返回标准的 JSON 格式，包含评分、操作建议、风险提示。

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
