# PLAN-002: 投资组合多用户支持

> 为投资组合和聊天系统增加多用户支持，包括用户认证、权限管理和数据隔离

## 基本信息

| 字段 | 值 |
|------|-----|
| 计划ID | PLAN-002 |
| 计划名称 | 投资组合多用户支持 |
| 创建日期 | 2026-03-07 |
| 优先级 | High |
| 状态 | Planning |
| 负责人 | - |

## 背景与目标

### 问题描述

当前系统是单用户模式：
- 没有用户认证机制
- 所有数据共享
- 无法区分不同用户的持仓和对话

### 预期目标

1. 实现用户注册、登录、JWT认证
2. 支持管理员和普通用户两种角色
3. 用户数据隔离（持仓、对话、分析历史）
4. 管理员可查看所有用户数据

## 任务清单

### 第一阶段：用户系统基础

#### 1.1 用户模型与认证
- [ ] 创建 `src/models/user.py` 用户模型
- [ ] 创建 `src/repositories/user_repo.py` 用户仓储
- [ ] 实现密码哈希和验证
- [ ] 创建 `api/v1/endpoints/auth.py` 认证接口
- [ ] 实现 JWT token 生成和验证
- [ ] 创建登录/注册 API

**涉及文件**：
- `src/models/user.py` (新建)
- `src/repositories/user_repo.py` (新建)
- `api/v1/endpoints/auth.py` (新建)
- `api/v1/router.py` (修改)

#### 1.2 权限装饰器
- [ ] 创建 `api/deps.py` 中的 `get_current_user` 依赖
- [ ] 实现角色检查装饰器 `@require_admin`
- [ ] 实现用户资源拥有者检查

**涉及文件**：
- `api/deps.py` (修改)

### 第二阶段：数据隔离

#### 2.1 持仓数据隔离
- [ ] 修改 `Portfolio` 模型添加 `user_id` 字段
- [ ] 修改 `PortfolioRepository` 支持按用户查询
- [ ] 更新 `portfolio_repo.py` 所有查询方法
- [ ] 创建数据库迁移脚本

**涉及文件**：
- `src/storage.py` (修改 Portfolio 模型)
- `src/repositories/portfolio_repo.py` (修改)

#### 2.2 聊天会话隔离
- [ ] 修改 `ChatSession` 模型添加 `user_id` 字段
- [ ] 修改 `ChatService` 支持用户隔离
- [ ] 更新所有聊天查询方法

**涉及文件**：
- `src/storage.py` (修改 ChatSession 模型)
- `src/services/chat_service.py` (修改)

#### 2.3 分析历史隔离
- [ ] 修改 `AnalysisHistory` 相关查询
- [ ] 确保分析记录与用户关联

**涉及文件**：
- `src/repositories/analysis_repo.py` (修改)

### 第三阶段：前端适配

#### 3.1 登录/注册页面
- [ ] 创建 `LoginPage.tsx` 登录页面
- [ ] 创建 `RegisterPage.tsx` 注册页面
- [ ] 实现 token 存储和管理
- [ ] 添加路由守卫

**涉及文件**：
- `apps/dsa-web/src/pages/LoginPage.tsx` (新建)
- `apps/dsa-web/src/pages/RegisterPage.tsx` (新建)
- `apps/dsa-web/src/App.tsx` (修改路由)

#### 3.2 API层适配
- [ ] 创建 `api/auth.ts` 认证相关API
- [ ] 修改 `api/index.ts` 添加请求拦截器（自动附加token）
- [ ] 处理401/403错误

**涉及文件**：
- `apps/dsa-web/src/api/auth.ts` (新建)
- `apps/dsa-web/src/api/index.ts` (修改)

#### 3.3 用户上下文
- [ ] 创建 `UserContext` 管理登录状态
- [ ] 在顶部栏显示用户信息
- [ ] 添加登出功能

**涉及文件**：
- `apps/dsa-web/src/contexts/UserContext.tsx` (新建)
- `apps/dsa-web/src/components/Header.tsx` (修改)

### 第四阶段：管理员功能

#### 4.1 用户管理
- [ ] 创建用户列表API
- [ ] 创建用户管理页面
- [ ] 支持禁用/启用用户

#### 4.2 数据查看
- [ ] 管理员可查看所有用户持仓
- [ ] 管理员可查看所有聊天记录

## 技术方案

### 数据库变更

```python
# 新增 User 模型
class User(Base):
    id = Column(String, primary_key=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True)
    hashed_password = Column(String)
    role = Column(Enum('admin', 'user'))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime)

# Portfolio 模型添加
user_id = Column(String, ForeignKey('users.id'))

# ChatSession 模型添加
user_id = Column(String, ForeignKey('users.id'))
```

### API路由

```
POST   /api/v1/auth/register     # 注册
POST   /api/v1/auth/login        # 登录
POST   /api/v1/auth/refresh      # 刷新token
GET    /api/v1/auth/me           # 获取当前用户信息

GET    /api/v1/users             # 用户列表（管理员）
PUT    /api/v1/users/{id}        # 更新用户信息
DELETE /api/v1/users/{id}        # 删除用户（管理员）
```

### 权限控制

```python
# 依赖注入获取当前用户
async def get_current_user(token: str = Depends(oauth2_scheme)):
    ...

# 管理员权限检查
async def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != 'admin':
        raise HTTPException(403, "需要管理员权限")
    return current_user
```

## 注意事项

1. **向后兼容**：现有数据需要默认归属到系统用户
2. **安全性**：密码必须加盐哈希，使用 bcrypt
3. **JWT配置**：设置合理的token过期时间
4. **前端状态**：token过期后需要自动跳转登录

## 详细设计文档

完整的设计方案见：
- [多用户持仓管理与AI历史分析功能开发计划](../multi_user_portfolio_chat_plan.md) - 详细设计文档
- [投资组合实现摘要](../portfolio_implementation_summary.md) - 当前实现状态

## 依赖关系

- 依赖 [PLAN-003](./PLAN-003-chat-history.md) 的聊天历史功能

## 进度记录

| 日期 | 更新内容 | 更新者 |
|------|----------|--------|
| 2026-03-07 | 计划创建 | Claude |
| | | |
