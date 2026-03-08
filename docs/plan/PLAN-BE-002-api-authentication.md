# PLAN-BE-002: API 认证与授权

> 为后端 API 添加统一的认证和授权机制，确保系统安全性

## 基本信息

| 字段 | 值 |
|------|-----|
| 计划ID | PLAN-BE-002 |
| 计划名称 | API 认证与授权 |
| 创建日期 | 2026-03-08 |
| 优先级 | 🔴 High |
| 状态 | 🟡 Pending |
| 负责人 | - |

## 背景与目标

### 问题描述

当前后端 API 存在严重安全隐患：

1. **无认证机制**：所有 API 端点可匿名访问
   - api/v1/endpoints/ 下的 14 个端点模块均无认证
   - 任何人可直接调用修改数据的接口

2. **无权限控制**：没有区分用户角色和权限
   - 没有用户管理概念
   - 无法限制敏感操作

### 预期目标

1. 实现 JWT Token 认证机制
2. 添加用户管理模块（用户/角色/权限）
3. 为敏感 API 添加认证依赖
4. 保持向后兼容
5. 提供登录/登出 API 端点

## 技术方案

### 数据模型

```python
# src/security/models.py
class User(BaseModel):
    __tablename__ = 'users'
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
```

### JWT Token 设计

```python
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
```

### 依赖注入

```python
# api/deps.py
async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    token_data = verify_token(token)
    if token_data is None:
        raise credentials_exception
    return user

def require_permissions(required_permissions: list[str]):
    async def permission_checker(current_user: User = Depends(get_current_user)):
        # 检查权限
        return current_user
    return permission_checker
```

## 任务清单

### 任务1：创建安全模块基础结构

- [ ] 创建 src/security/ 目录
- [ ] 安装依赖：pip install python-jose[cryptography] passlib[bcrypt]
- [ ] 创建 src/security/models.py - User 和 Role 模型
- [ ] 创建 src/security/auth/jwt.py - JWT 处理
- [ ] 创建 src/security/auth/password.py - 密码加密
- [ ] 创建数据库迁移脚本

**预计工作量**: 2 小时

### 任务2：实现认证 API

- [ ] 创建 api/v1/endpoints/auth.py
- [ ] 实现 /login 端点
- [ ] 实现 /refresh 端点
- [ ] 实现用户管理端点（管理员）

**预计工作量**: 2 小时

### 任务3：更新依赖注入模块

- [ ] 更新 api/deps.py
- [ ] 添加 get_current_user
- [ ] 添加 require_permissions

**预计工作量**: 1 小时

### 任务4：为现有端点添加认证

- [ ] 低风险端点（只读）- 保持开放
- [ ] 中风险端点 - 需要登录
- [ ] 高风险端点 - 需要特定权限

**预计工作量**: 2 小时

### 任务5：创建默认管理员账户

- [ ] 创建初始化脚本 scripts/init_admin.py
- [ ] 首次启动时自动创建管理员账户
- [ ] 默认凭据从环境变量读取

**预计工作量**: 1 小时

### 任务6：前端适配

- [ ] 创建登录页面 API 集成
- [ ] Token 存储
- [ ] 请求拦截器添加 Authorization Header

**预计工作量**: 2 小时

### 任务7：测试和文档

- [ ] 单元测试
- [ ] 集成测试
- [ ] API 文档更新

**预计工作量**: 2 小时

## 权限设计

| 权限 | 说明 | 适用角色 |
|------|------|----------|
| read:stocks | 读取股票数据 | user, admin |
| write:stocks | 修改股票数据 | admin |
| write:config | 修改系统配置 | admin |
| admin | 所有权限 | admin |

## 配置更新

```yaml
security:
  jwt_secret_key: ${JWT_SECRET_KEY}
  jwt_algorithm: HS256
  access_token_expire_minutes: 30
  refresh_token_expire_days: 7
```

## 进度记录

| 日期 | 更新内容 | 更新者 |
|------|----------|--------|
| 2026-03-08 | 计划创建，完成技术方案设计 | Claude |

## 依赖关系

- 依赖: PLAN-BE-001 (大文件拆分)
- 阻塞: PLAN-BE-003 (测试覆盖)

---

**下一步**: 等待 PLAN-BE-001 完成后开始实施
