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

### 前端改进计划

| 计划ID | 计划名称 | 优先级 | 状态 | 进度 | 负责人 |
|--------|----------|--------|------|------|--------|
| [PLAN-001](./PLAN-001-ui-consistency.md) | UI一致性改进 | 🔴 High | ✅ Completed | 95% | - |

### 后端改进计划

| 计划ID | 计划名称 | 优先级 | 状态 | 依赖 | 负责人 |
|--------|----------|--------|------|------|--------|
| [PLAN-BE-001](./PLAN-BE-001-refactor-large-files.md) | 大文件拆分 | 🔴 High | ✅ Completed | - | - |
| [PLAN-BE-002](./PLAN-BE-002-api-authentication.md) | API认证与授权 | 🔴 High | ⏸️ Pending | BE-001 | - |
| [PLAN-BE-003](./PLAN-BE-003-improve-test-coverage.md) | 提升测试覆盖率 | 🟡 Medium | ⏸️ Pending | BE-001, BE-002 | - |
| [PLAN-BE-004](./PLAN-BE-004-optimize-configuration.md) | 配置管理优化 | 🟢 Low | ⏸️ Pending | BE-001 | - |

### 业务功能计划

| 计划ID | 计划名称 | 优先级 | 状态 | 进度 | 负责人 |
|--------|----------|--------|------|------|--------|
| [PLAN-002](./PLAN-002-portfolio-multi-user.md) | 投资组合多用户支持 | 🔴 High | ⏸️ Planning | 0% | - |
| [PLAN-003](./PLAN-003-chat-history.md) | 聊天历史持久化 | 🟡 Medium | ⏸️ Planning | 0% | - |

## 状态说明

| 图标 | 状态 | 含义 |
|------|------|------|
| ⏸️ | Pending | 等待开始，可能依赖其他计划 |
| 🟡 | In Progress | 正在进行中 |
| 🔄 | Review | 等待审核 |
| ✅ | Completed | 已完成 |
| ❌ | Cancelled | 已取消 |

## 优先级说明

| 优先级 | 含义 | 响应时间 |
|--------|------|----------|
| 🔴 High | 关键问题，影响系统稳定性和安全性 | 立即处理 |
| 🟡 Medium | 重要改进，提升开发效率和代码质量 | 1-2周内 |
| 🟢 Low | 优化项，长期技术债务清理 | 按需安排 |

## 实施路线图

```
时间线
─────────────────────────────────────────────────────────────

Week 1-2:  PLAN-BE-001 大文件拆分
           ├── 创建 notification/ 包
           ├── 创建 storage/ 包
           └── 验证和向后兼容

Week 3-4:  PLAN-BE-002 API认证与授权
           ├── 依赖 PLAN-BE-001 完成
           ├── 实现 JWT 认证
           ├── 添加权限控制
           └── 前端登录集成

Week 5-6:  PLAN-BE-003 提升测试覆盖率
           ├── 依赖 PLAN-BE-001, BE-002
           ├── 测试基础设施
           ├── 核心模块测试
           └── API 集成测试

Week 7+:   PLAN-BE-004 配置管理优化
           ├── 依赖 PLAN-BE-001
           ├── Pydantic 配置模型
           └── 文档更新
```

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
