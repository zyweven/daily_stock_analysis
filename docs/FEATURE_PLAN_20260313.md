# 功能开发计划 - 2026.03.13

基于上游新功能筛选，优先实现以下 4 项。

---

## 1. REPORT_SUMMARY_ONLY 开关

**价值**: 只推送摘要版报告，减少噪音，群聊场景更友好。

**做法**:
- 新增配置项 `REPORT_SUMMARY_ONLY: bool = False`
- 通知服务根据开关选择摘要模板或完整报告
- 支持 CLI 参数 `--summary-only`

**预估**: 30-45 分钟

**状态**: 待开始

---

## 2. PushPlus 话题推送（PUSHPLUS_TOPIC）

**价值**: PushPlus 群组推送更集中，便于多人协作。

**做法**:
- 新增配置项 `PUSHPLUS_TOPIC: Optional[str]`
- NotificationService 在推送时带上 topic 参数
- 更新 .env.example 和文档

**预估**: 30 分钟

**状态**: 待开始

---

## 3. CN/US 市场策略蓝图（Strategy Blueprint）

**价值**: 大盘复盘增加"风险偏好/仓位建议/触发失效条件"，输出更像投研报告。

**做法**:
- 新增 `src/core/market_strategy.py`
  - `get_market_strategy_blueprint(region)` 返回策略模板
  - 支持 cn（A股）和 us（美股）两套模板
  - `to_prompt_block()` 方法生成注入 prompt 的策略段落
- 修改 `src/market_analyzer.py`
  - 在 prompt 中注入策略蓝图
  - 输出模板增加"策略建议"章节
- 新增测试 `tests/test_market_strategy.py`

**预估**: 2-3 小时

**状态**: 待开始

---

## 4. 导出报告为 Markdown/PDF（API/CLI）

**价值**: 一键导出最近一次分析报告，便于归档和分享。

**做法**:
- 新增 API 端点 `GET /api/v1/history/{query_id}/export?format=md|pdf`
- 新增 CLI 命令 `python main.py --export-latest [--format md|pdf]`
- 复用已有 formatter 和 md2img 能力
- 导出文件保存到 `exports/` 目录

**预估**: 1-2 小时

**状态**: 待开始

---

## 进度记录

| 功能 | 开始时间 | 完成时间 | Commit |
|------|----------|----------|--------|
| REPORT_SUMMARY_ONLY | - | - | - |
| PushPlus Topic | - | - | - |
| Strategy Blueprint | - | - | - |
| Export Report | - | - | - |

---

## 参考上游 Commit

- REPORT_SUMMARY_ONLY: `5414a6d`
- PushPlus Topic: `8090715`
- Strategy Blueprint: `17f7bac`
- Export Chat (参考): `9fcccf9`
