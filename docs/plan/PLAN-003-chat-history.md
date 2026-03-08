# PLAN-003: 持仓管理与AI历史分析查询

> 实现持仓记录管理和AI历史分析查询功能

## 基本信息

| 字段 | 值 |
|------|-----|
| 计划ID | PLAN-003 |
| 计划名称 | 持仓管理与AI历史分析查询 |
| 创建日期 | 2026-03-07 |
| 优先级 | Medium |
| 状态 | In Progress |
| 负责人 | - |

## 背景与目标

### 功能需求

1. **持仓管理**：记录用户的持仓股票、成本价、数量等信息
2. **AI历史分析查询**：让AI能够通过工具查询某只股票过去的智能分析内容

### 预期目标

- 用户可以在AI对话中查询自己的持仓情况
- AI可以获取持仓盈亏计算
- 用户可以查询某只股票的历史AI分析记录
- 支持情绪分趋势分析

## 任务清单

### 第一阶段：数据模型设计

#### 1.1 创建持仓模型
- [x] 创建 `PortfolioPosition` 数据模型
- [ ] 添加数据库索引优化查询
- [ ] 创建数据库迁移脚本（如需要）

**涉及文件**：
- `src/storage.py` (修改 - 添加模型)

**模型设计**：
```python
class PortfolioPosition(Base):
    id = Column(Integer, primary_key=True)
    code = Column(String(10), nullable=False, index=True)
    name = Column(String(50))
    quantity = Column(Float, nullable=False)
    cost_price = Column(Float, nullable=False)
    group_name = Column(String(50), default='默认分组')
    remark = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
```

#### 1.2 增强分析历史查询
- [ ] 添加 `get_analysis_history_detail` 方法
- [ ] 添加 `get_analysis_trend` 方法
- [ ] 添加 `get_analysis_comparison` 方法

**涉及文件**：
- `src/repositories/analysis_repo.py` (修改)

### 第二阶段：数据访问层

#### 2.1 创建 PortfolioRepository
- [x] 创建 `PortfolioRepository` 类
- [x] 实现 `get_all_positions` 方法
- [x] 实现 `get_position` 方法
- [x] 实现 `save_position` 方法
- [x] 实现 `close_position` 方法
- [x] 实现 `delete_position` 方法
- [x] 实现 `get_portfolio_summary` 方法

**涉及文件**：
- `src/repositories/portfolio_repo.py` (新建)

### 第三阶段：AI工具开发

#### 3.1 持仓管理工具
- [x] 创建 `get_my_portfolio` 工具
- [x] 创建 `get_position_detail` 工具

**涉及文件**：
- `src/services/chat_tools.py` (修改)

#### 3.2 历史分析查询工具
- [x] 创建 `get_stock_analysis_history` 工具
- [x] 创建 `get_analysis_trend` 工具
- [x] 创建 `get_my_portfolio_analysis` 工具

**涉及文件**：
- `src/services/chat_tools.py` (修改)

### 第四阶段：API层开发

#### 4.1 创建持仓管理API
- [ ] 创建 `GET /api/v1/portfolio/positions` 获取持仓列表
- [ ] 创建 `POST /api/v1/portfolio/positions` 添加/更新持仓
- [ ] 创建 `GET /api/v1/portfolio/positions/{code}` 获取单个持仓
- [ ] 创建 `DELETE /api/v1/portfolio/positions/{code}` 删除持仓
- [ ] 创建 `POST /api/v1/portfolio/positions/{code}/close` 平仓
- [ ] 创建 `GET /api/v1/portfolio/summary` 获取持仓汇总
- [ ] 创建 `GET /api/v1/portfolio/groups` 获取所有分组

**涉及文件**：
- `api/v1/endpoints/portfolio.py` (新建)
- `api/v1/router.py` (修改 - 注册路由)

### 第五阶段：前端开发

#### 5.1 创建持仓管理页面
- [ ] 创建 `PortfolioPage.tsx` 持仓管理页面
- [ ] 实现持仓列表展示
- [ ] 实现添加/编辑持仓表单
- [ ] 实现持仓删除功能
- [ ] 实现分组筛选功能

**涉及文件**：
- `apps/dsa-web/src/pages/PortfolioPage.tsx` (新建)
- `apps/dsa-web/src/api/portfolio.ts` (新建)

#### 5.2 在聊天界面集成持仓快捷操作
- [ ] 在 ChatPage 添加持仓快捷入口
- [ ] 实现持仓卡片展示

### 第六阶段：系统集成

#### 6.1 更新系统提示词
- [ ] 在 `CHAT_SYSTEM_PROMPT` 中添加持仓相关说明
- [ ] 在 `CHAT_SYSTEM_PROMPT` 中添加历史分析查询说明

**涉及文件**：
- `src/services/chat_service.py` (修改)

#### 6.2 测试验证
- [ ] 测试持仓工具调用
- [ ] 测试历史分析查询
- [ ] 测试边界情况（无持仓、无历史记录等）
- [ ] API 接口测试

## 技术方案

### 持仓盈亏计算

```python
def calculate_profit(self, current_price: float) -> Dict[str, float]:
    market_value = self.quantity * current_price
    cost_value = self.quantity * self.cost_price
    profit_loss = market_value - cost_value
    profit_loss_pct = (current_price - self.cost_price) / self.cost_price * 100

    return {
        "market_value": round(market_value, 2),
        "cost_value": round(cost_value, 2),
        "profit_loss": round(profit_loss, 2),
        "profit_loss_pct": round(profit_loss_pct, 2),
        "position_ratio": round(cost_value / total_principal * 100, 2) if total_principal else None
    }
```

### API路由

```
GET    /api/v1/portfolio/positions          # 获取持仓列表
POST   /api/v1/portfolio/positions          # 添加/更新持仓
GET    /api/v1/portfolio/positions/{code}   # 获取单个持仓
DELETE /api/v1/portfolio/positions/{code}   # 删除持仓
POST   /api/v1/portfolio/positions/{code}/close  # 平仓
GET    /api/v1/portfolio/summary            # 获取持仓汇总
GET    /api/v1/portfolio/groups             # 获取所有分组
```

## 注意事项

1. **数据一致性**：持仓数据存储在本地SQLite，用户需要手动维护
2. **性能考虑**：`get_my_portfolio` 会调用实时行情API，持仓过多时可能较慢
3. **错误处理**：所有工具都应处理异常并返回友好的错误信息

## 详细设计文档

完整的设计方案见：
- [持仓管理与AI历史分析查询功能开发计划](../portfolio_chat_history_plan.md)

## 依赖关系

- 被 [PLAN-002](./PLAN-002-portfolio-multi-user.md) 依赖（多用户功能需要在此基础上添加user_id）

## 进度记录

| 日期 | 更新内容 | 更新者 |
|------|----------|--------|
| 2026-03-07 | 计划创建，整理已有实现 | Claude |
| | | |
