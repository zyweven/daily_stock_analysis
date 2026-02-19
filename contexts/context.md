# 项目核心上下文 (Project Context)

> [!NOTE]
> 本文档由 `memory_bank` 技能自动维护，记录项目的最新状态和关键决策。

## 1. 项目概况
- **名称**：daily_stock_analysis (DSA)
- **目标**：提供专业的 AI 投研助手，支持实时行情、技术分析、报告回顾及自动化回测。
- **核心栈**：Python (FastAPI) + React (Vite) + TailwindCSS.
- **结构定义**：详见 [项目结构文档](file:///e:/project/daily_stock_analysis/contexts/structure.md)。

## 2. 关键决策记录 (ADR)
- **2026-02-19**: 引入了 `Agent Skills` 标准，定义了架构、测试、防御性编程、UI 优化和记忆库 5 大技能。
- **2026-02-19**: 重构 `ChatService`，引入 Google 风格 Docstrings 以匹配架构专家技能。

## 3. 待办事项 (Backlog)
- [ ] 实现回测引擎的异步并行计算加速。
- [ ] 增加 A 股实时资金流向分析工具。
