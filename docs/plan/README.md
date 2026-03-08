# 计划中心 (Plan Center)

> 项目所有开发计划的集中管理中心，支持多AI协同工作。

## 使用指南

### 对于人类用户
- 查看所有进行中的计划
- 了解每个计划的进度和待办事项
- 指派AI执行特定任务

### 对于AI助手
1. **开始工作前**：阅读本文件，了解计划结构
2. **认领任务时**：更新对应计划文件中的任务状态
3. **完成任务后**：标记为已完成，并更新进度

## 计划列表

| 计划ID | 计划名称 | 优先级 | 状态 | 进度 | 负责人 |
|--------|----------|--------|------|------|--------|
| [PLAN-001](./PLAN-001-ui-consistency.md) | UI一致性改进 | High | In Progress | 0% | - |
| [PLAN-002](./PLAN-002-portfolio-multi-user.md) | 投资组合多用户支持 | High | Planning | 0% | - |
| [PLAN-003](./PLAN-003-chat-history.md) | 聊天历史持久化 | Medium | Planning | 0% | - |

## 计划状态说明

- **Planning**: 计划中，尚未开始
- **In Progress**: 进行中
- **Review**: 待审核
- **Completed**: 已完成
- **Paused**: 暂停

## 快速创建新计划

复制模板文件创建新计划：

```bash
cp docs/plan/plan-template.md docs/plan/PLAN-XXX-plan-name.md
```

## 快速链接

### 给AI助手的指南
- [AI助手工作指南](./GUIDE-for-AI.md) - **AI在开始工作前请先阅读**
- [计划模板](./plan-template.md) - 创建新计划时复制使用

### 设计文档
以下文档已存在，与计划相关：

- [投资组合聊天历史计划](../portfolio_chat_history_plan.md) - 待整合到 PLAN-003
- [多用户投资组合计划](../multi_user_portfolio_chat_plan.md) - 待整合到 PLAN-002
- [投资组合实现摘要](../portfolio_implementation_summary.md) - 已实现功能

## 如何指派AI工作

### 方式1：让AI继续现有计划
```
请查看 docs/plan/PLAN-001-ui-consistency.md 计划，
完成"任务1：统一 Select 组件使用"中的剩余工作。
```

### 方式2：让AI创建新计划
```
请创建一个新计划来添加XX功能，使用 docs/plan/plan-template.md 作为模板。
```

### 方式3：让AI评估进度
```
请查看 docs/plan/ 目录下的所有计划，
告诉我当前项目的整体进度和下一步建议。
```
