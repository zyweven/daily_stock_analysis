# 多模型专家会诊功能 - 设计探讨 (Design Proposal)

## 🎯 核心目标
实现 **"AI 专家会诊"** 模式：针对同一只股票，同时调度多个不同的 AI 模型（如 Gemini, OpenAI, DeepSeek, Claude）进行独立分析，并汇总展示不同"专家"的观点。

---

## 🛠️ 方案探讨

### 1. 配置方式 (Configuration)
目前系统通过 `GEMINI_API_KEY` 和 `OPENAI_API_KEY` 互斥地选择模型。

**建议方案**:
新增 `active_models` 配置项，允许同时启用多个模型。
```ini
# .env 示例
# 启用模型列表 (逗号分隔)
ENABLED_MODELS=gemini,openai,deepseek

# 模型 1: Gemini
GEMINI_API_KEY=xxx

# 模型 2: OpenAI (官方)
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1

# 模型 3: DeepSeek (通过 OpenAI 兼容接口)
DEEPSEEK_API_KEY=sk-yyy
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

### 2. 分析流程 (Pipeline)
需要改造 `StockAnalysisPipeline` 和 `Analyzer`。

**当前流程**:
Stocks -> Loop -> Fetch Data -> **Single Analyzer** -> Result -> Notify

**新流程**:
Stocks -> Loop -> Fetch Data -> **Multi-Model Manager** -> (Parallel Execution) ->
  ├── Gemini Agent -> Result A
  ├── DeepSeek Agent -> Result B
  └── OpenAI Agent -> Result C
  ↓
**Result Aggregator** (汇总/对比) -> Final Report -> Notify

### 3. 结果展示 (Presentation)
这是最关键的部分。多个专家的意见可能不一致，如何展示？

**方案 A: 独立展示 (Verbose)**
- 每只股票发送 3 条独立的消息。
- **优点**: 信息完整。
- **缺点**: 消息轰炸，太吵。

**方案 B: 汇总对比 (Comparison) - 推荐**
- 生成一张"会诊单"。
- **表头**: 模型 A vs 模型 B vs 模型 C
- **评分**: 80 vs 65 vs 40
- **建议**: 买入 vs 观望 vs 卖出
- **核心分歧点**: 为什么 A 看多 B 看空？
- **最终结论**: 加权平均或 LLM 再次总结。

**示例展示:**
```text
🤖 AI 专家会诊: 贵州茅台 (600519)

| 模型 | 评分 | 建议 | 核心观点 |
|:---|:---:|:---:|:---|
| Gemini | 85 | 🟢买入 | 估值回归，外资回流 |
| DeepSeek | 78 | 🟢买入 | 基本面稳健，但短期有压 |
| GPT-4 | 55 | 🟡观望 | 技术面破位，需等待企稳 |

📢 综合结论: 【轻仓尝试】多数专家看好基本面，但技术面存在分歧...
```

---

## 📋 待确认问题 (Questions for You)

1.  **展示形式 Prefer**: 您更倾向于看到详细的"多份报告"，还是上面这种"对比汇总表格"？
2.  **模型数量**: 主要是想同时对比哪几个模型？(是否通过 OpenAI 兼容接口接入 DeepSeek/Claude 等？)
3.  **成本考量**: 同时跑 3 个模型会消耗 3 倍的 Token，且如果是串行执行速度会变慢 (并行执行则依赖 API 并发限额)。是否需要"按需开启"（只对重点关注的股票开启）？

---

请告知您的想法，我将根据您的反馈完善设计并开始开发。
