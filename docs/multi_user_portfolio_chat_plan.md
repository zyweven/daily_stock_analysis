# 多用户持仓管理与AI历史分析功能开发计划

## 更新要点

本计划是基于 `portfolio_chat_history_plan.md` 的升级版，**增加多用户支持**：
1. **用户系统**：注册、登录、JWT认证
2. **权限等级**：管理员 vs 普通用户
3. **数据隔离**：用户只能看到自己的持仓、对话、分析历史
4. **管理员能力**：可查看所有用户数据、管理用户

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                        API Layer                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ /auth/*     │  │ /users/*    │  │ /portfolio/*        │  │
│  │ 登录/注册   │  │ 用户管理    │  │ 持仓管理(用户隔离)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                     Auth & Permission                        │
│         JWT Token 验证 + 角色权限检查装饰器                   │
├─────────────────────────────────────────────────────────────┤
│                      Data Layer                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ User        │  │ Portfolio   │  │ ChatSession         │  │
│  │ - id        │  │ - user_id   │  │ - user_id           │  │
│  │ - role      │  │ - code      │  │ - messages          │  │
│  │ - password  │  │ - quantity  │  └─────────────────────┘  │
│  └─────────────┘  └─────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 详细设计方案

### 第一阶段：用户系统基础

#### 1.1 新建用户模型与认证

```python
# src/models/user.py (新建文件，建议将模型独立到models目录)

from datetime import datetime
from enum import Enum as PyEnum
from typing import Optional, Dict, Any

from sqlalchemy import Column, String, DateTime, Integer, Boolean, Enum
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class UserRole(str, PyEnum):
    """用户角色枚举"""
    ADMIN = "admin"          # 管理员：可查看所有数据，管理用户
    USER = "user"            # 普通用户：只能查看自己的数据
    PREMIUM = "premium"      # 高级用户（预留）


class User(Base):
    """
    用户模型

    支持多用户隔离，基于角色控制数据访问范围
    """
    __tablename__ = 'users'

    id = Column(String(36), primary_key=True)           # UUID
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=True)

    # 密码使用 bcrypt 加密存储
    hashed_password = Column(String(255), nullable=False)

    # 用户角色
    role = Column(Enum(UserRole), default=UserRole.USER, nullable=False)

    # 用户状态
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)        # 邮箱验证状态

    # 用户配置
    display_name = Column(String(100))                  # 显示名称
    avatar_url = Column(String(500))                    # 头像URL
    preferences = Column(String(2000))                  # JSON: 用户偏好设置

    # 时间戳
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    last_login_at = Column(DateTime, nullable=True)

    def to_dict(self, include_sensitive: bool = False) -> Dict[str, Any]:
        """转换为字典"""
        data = {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role.value,
            'is_active': self.is_active,
            'is_verified': self.is_verified,
            'display_name': self.display_name,
            'avatar_url': self.avatar_url,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_login_at': self.last_login_at.isoformat() if self.last_login_at else None,
        }
        if include_sensitive:
            data['preferences'] = self.preferences
        return data

    @property
    def is_admin(self) -> bool:
        """检查是否为管理员"""
        return self.role == UserRole.ADMIN

    def can_access_user_data(self, target_user_id: str) -> bool:
        """
        检查是否可以访问指定用户的数据

        规则：
        - 管理员可以访问任何用户数据
        - 普通用户只能访问自己的数据
        """
        if self.is_admin:
            return True
        return self.id == target_user_id
```

#### 1.2 JWT认证配置

```python
# src/auth/config.py (新建)

from datetime import timedelta
from pydantic_settings import BaseSettings


class AuthConfig(BaseSettings):
    """认证配置"""

    # JWT配置
    JWT_SECRET_KEY: str = "your-secret-key-change-in-production"  # 生产环境必须修改
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 默认7天

    # 密码加密
    PASSWORD_BCRYPT_ROUNDS: int = 12

    class Config:
        env_prefix = "AUTH_"


auth_config = AuthConfig()
```

#### 1.3 JWT工具函数

```python
# src/auth/jwt_utils.py (新建)

from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
from passlib.context import CryptContext

from src.auth.config import auth_config

# 密码加密上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """生成密码哈希"""
    return pwd_context.hash(password)


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    创建JWT访问令牌

    Args:
        data: 要编码的数据，必须包含 "sub" (user_id)
        expires_delta: 过期时间，默认使用配置值
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=auth_config.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire, "iat": datetime.utcnow(), "type": "access"})

    encoded_jwt = jwt.encode(
        to_encode,
        auth_config.JWT_SECRET_KEY,
        algorithm=auth_config.JWT_ALGORITHM
    )
    return encoded_jwt


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """
    解码JWT令牌

    Returns:
        解码后的payload，如果无效返回None
    """
    try:
        payload = jwt.decode(
            token,
            auth_config.JWT_SECRET_KEY,
            algorithms=[auth_config.JWT_ALGORITHM]
        )
        return payload
    except JWTError:
        return None


def get_user_id_from_token(token: str) -> Optional[str]:
    """从token中提取用户ID"""
    payload = decode_access_token(token)
    if payload:
        return payload.get("sub")
    return None
```

#### 1.4 权限控制依赖

```python
# api/deps.py 新增

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from src.auth.jwt_utils import decode_access_token, get_user_id_from_token
from src.repositories.user_repo import UserRepository
from src.models.user import User, UserRole

# 使用HTTP Bearer认证
security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    """
    获取当前登录用户

    从Authorization头中提取JWT令牌，验证并返回用户对象
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="缺少认证令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_access_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="令牌中缺少用户标识",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 查询用户
    user_repo = UserRepository()
    user = user_repo.get_by_id(user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已被禁用",
        )

    return user


async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    """确保用户是激活状态"""
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="用户未激活")
    return current_user


class RoleChecker:
    """
    角色权限检查依赖

    用法:
        @router.get("/admin-only", dependencies=[Depends(RoleChecker(UserRole.ADMIN))])
    """

    def __init__(self, allowed_roles: list[UserRole]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="权限不足，需要管理员权限"
            )
        return current_user


# 常用权限检查依赖
require_admin = RoleChecker([UserRole.ADMIN])
require_user_or_admin = RoleChecker([UserRole.USER, UserRole.ADMIN, UserRole.PREMIUM])


def can_access_user_resource(current_user: User, target_user_id: str) -> bool:
    """
    检查当前用户是否可以访问目标用户的资源

    用于在API内部进行细粒度权限控制
    """
    return current_user.can_access_user_data(target_user_id)
```

---

### 第二阶段：数据模型升级（用户隔离）

#### 2.1 为现有模型添加 user_id

```python
# src/storage.py - PortfolioPosition 更新

class PortfolioPosition(Base):
    """
    持仓记录模型（多用户版本）
    """
    __tablename__ = 'portfolio_position'

    id = Column(Integer, primary_key=True, autoincrement=True)

    # 用户隔离字段
    user_id = Column(String(36), ForeignKey('users.id'), nullable=False, index=True)

    # 股票信息
    code = Column(String(10), nullable=False, index=True)
    name = Column(String(50))

    # 持仓数据
    quantity = Column(Float, nullable=False)
    cost_price = Column(Float, nullable=False)
    group_name = Column(String(50), default='默认分组')
    remark = Column(Text)

    # 状态
    is_active = Column(Boolean, default=True)

    # 时间戳
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    __table_args__ = (
        # 同一用户同一股票同一分组只能有一条活跃记录
        UniqueConstraint('user_id', 'code', 'group_name', 'is_active',
                        name='uix_portfolio_user_code_group_active'),
        Index('ix_portfolio_user_code', 'user_id', 'code'),
        Index('ix_portfolio_user_group', 'user_id', 'group_name'),
    )
```

```python
# src/storage.py - ChatSession 更新

class ChatSession(Base):
    """
    AI 对话会话（多用户版本）
    """
    __tablename__ = 'chat_session'

    id = Column(String(36), primary_key=True)

    # 用户隔离字段
    user_id = Column(String(36), ForeignKey('users.id'), nullable=False, index=True)

    title = Column(String(200), default='新对话')
    stock_code = Column(String(10), nullable=True)
    model_name = Column(String(100), nullable=True)
    message_count = Column(Integer, default=0)

    agent_id = Column(String(36), ForeignKey('agent_profile.id'), nullable=True)
    current_agent_config = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    __table_args__ = (
        Index('ix_chat_session_user', 'user_id', 'updated_at'),
        Index('ix_chat_session_user_stock', 'user_id', 'stock_code'),
    )
```

```python
# src/storage.py - AnalysisHistory 更新

class AnalysisHistory(Base):
    """
    分析结果历史记录（多用户版本）
    """
    __tablename__ = 'analysis_history'

    id = Column(Integer, primary_key=True, autoincrement=True)

    # 用户隔离字段（分析由谁触发）
    user_id = Column(String(36), ForeignKey('users.id'), nullable=True, index=True)
    # nullable=True 兼容现有数据，后续可设置默认值或迁移

    query_id = Column(String(64), index=True)
    code = Column(String(10), nullable=False, index=True)
    # ... 其他字段保持不变
```

#### 2.2 数据访问层升级

```python
# src/repositories/portfolio_repo.py - 更新

from typing import Optional, List, Dict, Any
from src.storage import DatabaseManager, PortfolioPosition


class PortfolioRepository:
    """
    持仓数据访问层（支持多用户）

    所有查询方法都接受 user_id 参数，并进行用户隔离
    """

    def __init__(self, db_manager: Optional[DatabaseManager] = None):
        self.db = db_manager or DatabaseManager.get_instance()

    # ========== 用户隔离的查询方法 ==========

    def get_all_positions(
        self,
        user_id: str,
        group_name: Optional[str] = None
    ) -> List[PortfolioPosition]:
        """获取指定用户的所有持仓"""
        with self.db.get_session() as session:
            query = session.query(PortfolioPosition).filter(
                PortfolioPosition.user_id == user_id,
                PortfolioPosition.is_active == True
            )
            if group_name:
                query = query.filter(PortfolioPosition.group_name == group_name)
            return query.order_by(desc(PortfolioPosition.updated_at)).all()

    def get_position(
        self,
        user_id: str,
        code: str,
        group_name: str = '默认分组'
    ) -> Optional[PortfolioPosition]:
        """获取指定用户的某只股票持仓"""
        with self.db.get_session() as session:
            return session.query(PortfolioPosition).filter(
                PortfolioPosition.user_id == user_id,
                PortfolioPosition.code == code,
                PortfolioPosition.group_name == group_name,
                PortfolioPosition.is_active == True
            ).first()

    def save_position(
        self,
        user_id: str,
        code: str,
        name: str,
        quantity: float,
        cost_price: float,
        group_name: str = '默认分组',
        remark: str = None
    ) -> PortfolioPosition:
        """保存或更新持仓（带用户隔离）"""
        with self.db.get_session() as session:
            existing = session.query(PortfolioPosition).filter(
                PortfolioPosition.user_id == user_id,
                PortfolioPosition.code == code,
                PortfolioPosition.group_name == group_name
            ).first()

            if existing:
                existing.quantity = quantity
                existing.cost_price = cost_price
                existing.name = name
                existing.remark = remark
                existing.is_active = True
                session.commit()
                session.refresh(existing)
                return existing
            else:
                position = PortfolioPosition(
                    user_id=user_id,
                    code=code,
                    name=name,
                    quantity=quantity,
                    cost_price=cost_price,
                    group_name=group_name,
                    remark=remark
                )
                session.add(position)
                session.commit()
                session.refresh(position)
                return position

    def close_position(
        self,
        user_id: str,
        code: str,
        group_name: str = '默认分组'
    ) -> bool:
        """平仓（用户隔离）"""
        with self.db.get_session() as session:
            position = session.query(PortfolioPosition).filter(
                PortfolioPosition.user_id == user_id,
                PortfolioPosition.code == code,
                PortfolioPosition.group_name == group_name
            ).first()

            if position:
                position.is_active = False
                session.commit()
                return True
            return False

    def delete_position(
        self,
        user_id: str,
        code: str,
        group_name: str = '默认分组'
    ) -> bool:
        """彻底删除持仓（用户隔离）"""
        with self.db.get_session() as session:
            result = session.query(PortfolioPosition).filter(
                PortfolioPosition.user_id == user_id,
                PortfolioPosition.code == code,
                PortfolioPosition.group_name == group_name
            ).delete()
            session.commit()
            return result > 0

    # ========== 管理员方法（可查看所有用户数据） ==========

    def get_all_positions_admin(
        self,
        target_user_id: Optional[str] = None,
        group_name: Optional[str] = None
    ) -> List[PortfolioPosition]:
        """
        管理员方法：获取所有用户或指定用户的持仓

        注意：此方法应在API层进行管理员权限检查后调用
        """
        with self.db.get_session() as session:
            query = session.query(PortfolioPosition)

            if target_user_id:
                query = query.filter(PortfolioPosition.user_id == target_user_id)
            if group_name:
                query = query.filter(PortfolioPosition.group_name == group_name)

            return query.order_by(desc(PortfolioPosition.updated_at)).all()

    def get_portfolio_stats_admin(self) -> Dict[str, Any]:
        """
        管理员方法：获取全局持仓统计
        """
        with self.db.get_session() as session:
            from sqlalchemy import func, distinct

            stats = session.query(
                func.count(PortfolioPosition.id).label('total_positions'),
                func.count(distinct(PortfolioPosition.user_id)).label('total_users'),
                func.sum(PortfolioPosition.quantity * PortfolioPosition.cost_price).label('total_cost')
            ).filter(PortfolioPosition.is_active == True).first()

            return {
                'total_positions': stats.total_positions or 0,
                'total_users_with_positions': stats.total_users or 0,
                'total_cost_value': round(float(stats.total_cost or 0), 2)
            }
```

---

### 第三阶段：API层（用户隔离 + 权限控制）

#### 3.1 认证API

```python
# api/v1/endpoints/auth.py (新建)

from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field

from src.auth.jwt_utils import create_access_token, verify_password, get_password_hash
from src.repositories.user_repo import UserRepository
from src.models.user import User, UserRole
from api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)
    email: Optional[str] = None
    display_name: Optional[str] = None


class UserLogin(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: Dict[str, Any]


class UserResponse(BaseModel):
    id: str
    username: str
    email: Optional[str]
    role: str
    display_name: Optional[str]
    created_at: str


@router.post("/register", response_model=UserResponse)
async def register(user_data: UserRegister):
    """用户注册"""
    user_repo = UserRepository()

    # 检查用户名是否已存在
    if user_repo.get_by_username(user_data.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在"
        )

    # 检查邮箱是否已存在
    if user_data.email and user_repo.get_by_email(user_data.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="邮箱已被注册"
        )

    # 创建用户
    hashed_password = get_password_hash(user_data.password)
    user = user_repo.create(
        username=user_data.username,
        hashed_password=hashed_password,
        email=user_data.email,
        display_name=user_data.display_name or user_data.username,
        role=UserRole.USER  # 默认注册为普通用户
    )

    return user.to_dict()


@router.post("/login", response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """用户登录（OAuth2兼容格式）"""
    user_repo = UserRepository()
    user = user_repo.get_by_username(form_data.username)

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已被禁用"
        )

    # 更新最后登录时间
    user_repo.update_last_login(user.id)

    # 创建访问令牌
    access_token_expires = timedelta(days=7)
    access_token = create_access_token(
        data={"sub": user.id, "username": user.username, "role": user.role.value},
        expires_delta=access_token_expires
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": access_token_expires.total_seconds(),
        "user": user.to_dict()
    }


@router.post("/login/json", response_model=TokenResponse)
async def login_json(credentials: UserLogin):
    """用户登录（JSON格式，便于前端调用）"""
    user_repo = UserRepository()
    user = user_repo.get_by_username(credentials.username)

    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已被禁用"
        )

    user_repo.update_last_login(user.id)

    access_token_expires = timedelta(days=7)
    access_token = create_access_token(
        data={"sub": user.id, "username": user.username, "role": user.role.value},
        expires_delta=access_token_expires
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": access_token_expires.total_seconds(),
        "user": user.to_dict()
    }


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """获取当前登录用户信息"""
    return current_user.to_dict()


@router.post("/change-password")
async def change_password(
    old_password: str,
    new_password: str = Field(..., min_length=6),
    current_user: User = Depends(get_current_user)
):
    """修改密码"""
    if not verify_password(old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="原密码错误"
        )

    user_repo = UserRepository()
    user_repo.update_password(current_user.id, get_password_hash(new_password))

    return {"message": "密码修改成功"}
```

#### 3.2 持仓管理API（用户隔离版）

```python
# api/v1/endpoints/portfolio.py (更新)

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from src.repositories.portfolio_repo import PortfolioRepository
from src.models.user import User
from api.deps import get_current_user, require_admin, can_access_user_resource

router = APIRouter(prefix="/portfolio", tags=["Portfolio"])


class PositionCreate(BaseModel):
    code: str = Field(..., description="股票代码")
    name: str = Field(..., description="股票名称")
    quantity: float = Field(..., gt=0, description="持仓数量")
    cost_price: float = Field(..., gt=0, description="成本价")
    group_name: str = Field(default="默认分组", description="分组名称")
    remark: Optional[str] = Field(None, description="备注")


class PositionResponse(BaseModel):
    id: int
    code: str
    name: str
    quantity: float
    cost_price: float
    group_name: str
    remark: Optional[str]
    is_active: bool
    created_at: str
    updated_at: str


# ========== 普通用户端点 ==========

@router.get("/positions", response_model=List[PositionResponse])
async def get_my_positions(
    group: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """获取当前用户的持仓列表"""
    repo = PortfolioRepository()
    positions = repo.get_all_positions(user_id=current_user.id, group_name=group)
    return [p.to_dict() for p in positions]


@router.post("/positions", response_model=PositionResponse)
async def create_position(
    position: PositionCreate,
    current_user: User = Depends(get_current_user)
):
    """添加或更新当前用户的持仓"""
    repo = PortfolioRepository()
    result = repo.save_position(
        user_id=current_user.id,
        code=position.code,
        name=position.name,
        quantity=position.quantity,
        cost_price=position.cost_price,
        group_name=position.group_name,
        remark=position.remark
    )
    return result.to_dict()


@router.get("/positions/{code}", response_model=PositionResponse)
async def get_my_position(
    code: str,
    group: str = "默认分组",
    current_user: User = Depends(get_current_user)
):
    """获取当前用户的单只股票持仓详情"""
    repo = PortfolioRepository()
    position = repo.get_position(
        user_id=current_user.id,
        code=code,
        group_name=group
    )
    if not position:
        raise HTTPException(status_code=404, detail=f"持仓 {code} 不存在")
    return position.to_dict()


@router.delete("/positions/{code}")
async def delete_my_position(
    code: str,
    group: str = "默认分组",
    current_user: User = Depends(get_current_user)
):
    """删除当前用户的持仓"""
    repo = PortfolioRepository()
    success = repo.delete_position(
        user_id=current_user.id,
        code=code,
        group_name=group
    )
    if not success:
        raise HTTPException(status_code=404, detail=f"持仓 {code} 不存在")
    return {"message": f"持仓 {code} 已删除"}


@router.post("/positions/{code}/close")
async def close_my_position(
    code: str,
    group: str = "默认分组",
    current_user: User = Depends(get_current_user)
):
    """平仓（标记为已卖出）"""
    repo = PortfolioRepository()
    success = repo.close_position(
        user_id=current_user.id,
        code=code,
        group_name=group
    )
    if not success:
        raise HTTPException(status_code=404, detail=f"持仓 {code} 不存在")
    return {"message": f"持仓 {code} 已平仓"}


@router.get("/summary")
async def get_my_portfolio_summary(
    current_user: User = Depends(get_current_user)
):
    """获取当前用户的持仓汇总"""
    repo = PortfolioRepository()
    return repo.get_portfolio_summary(user_id=current_user.id)


# ========== 管理员端点 ==========

@router.get("/admin/positions", response_model=List[PositionResponse])
async def admin_get_all_positions(
    user_id: Optional[str] = None,
    group: Optional[str] = None,
    current_user: User = Depends(require_admin)
):
    """
    管理员获取持仓列表

    - 不传user_id：获取所有用户的持仓
    - 传user_id：获取指定用户的持仓
    """
    repo = PortfolioRepository()
    positions = repo.get_all_positions_admin(
        target_user_id=user_id,
        group_name=group
    )
    return [p.to_dict() for p in positions]


@router.get("/admin/users/{user_id}/positions", response_model=List[PositionResponse])
async def admin_get_user_positions(
    user_id: str,
    current_user: User = Depends(require_admin)
):
    """管理员获取指定用户的持仓"""
    repo = PortfolioRepository()
    positions = repo.get_all_positions(user_id=user_id)
    return [p.to_dict() for p in positions]


@router.get("/admin/stats")
async def admin_get_portfolio_stats(
    current_user: User = Depends(require_admin)
):
    """管理员获取全局持仓统计"""
    repo = PortfolioRepository()
    return repo.get_portfolio_stats_admin()
```

#### 3.3 用户管理API（管理员专用）

```python
# api/v1/endpoints/users.py (新建)

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from src.repositories.user_repo import UserRepository
from src.models.user import User, UserRole
from src.auth.jwt_utils import get_password_hash
from api.deps import require_admin, get_current_user

router = APIRouter(prefix="/users", tags=["Users"])


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)
    email: Optional[str] = None
    display_name: Optional[str] = None
    role: UserRole = UserRole.USER


class UserUpdate(BaseModel):
    email: Optional[str] = None
    display_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    id: str
    username: str
    email: Optional[str]
    role: str
    is_active: bool
    display_name: Optional[str]
    created_at: str
    last_login_at: Optional[str]


# ========== 管理员端点 ==========

@router.get("", response_model=List[UserResponse])
async def list_users(
    role: Optional[UserRole] = None,
    is_active: Optional[bool] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(require_admin)
):
    """获取用户列表（管理员）"""
    user_repo = UserRepository()
    users = user_repo.list_users(
        role=role,
        is_active=is_active,
        skip=skip,
        limit=limit
    )
    return [u.to_dict() for u in users]


@router.post("", response_model=UserResponse)
async def create_user(
    user_data: UserCreate,
    current_user: User = Depends(require_admin)
):
    """创建用户（管理员）"""
    user_repo = UserRepository()

    if user_repo.get_by_username(user_data.username):
        raise HTTPException(status_code=400, detail="用户名已存在")

    if user_data.email and user_repo.get_by_email(user_data.email):
        raise HTTPException(status_code=400, detail="邮箱已被注册")

    user = user_repo.create(
        username=user_data.username,
        hashed_password=get_password_hash(user_data.password),
        email=user_data.email,
        display_name=user_data.display_name,
        role=user_data.role
    )

    return user.to_dict()


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    current_user: User = Depends(require_admin)
):
    """获取用户详情（管理员）"""
    user_repo = UserRepository()
    user = user_repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user.to_dict()


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    user_data: UserUpdate,
    current_user: User = Depends(require_admin)
):
    """更新用户信息（管理员）"""
    user_repo = UserRepository()
    user = user_repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 不能修改自己的role来避免失去管理员权限
    if user_id == current_user.id and user_data.role and user_data.role != UserRole.ADMIN:
        raise HTTPException(status_code=400, detail="不能取消自己的管理员权限")

    update_data = user_data.dict(exclude_unset=True)
    user = user_repo.update(user_id, **update_data)
    return user.to_dict()


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    current_user: User = Depends(require_admin)
):
    """删除用户（管理员）"""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="不能删除自己")

    user_repo = UserRepository()
    success = user_repo.delete(user_id)
    if not success:
        raise HTTPException(status_code=404, detail="用户不存在")

    return {"message": "用户已删除"}


@router.post("/{user_id}/reset-password")
async def admin_reset_password(
    user_id: str,
    new_password: str = Field(..., min_length=6),
    current_user: User = Depends(require_admin)
):
    """管理员重置用户密码"""
    user_repo = UserRepository()
    user = user_repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    user_repo.update_password(user_id, get_password_hash(new_password))
    return {"message": "密码已重置"}
```

---

### 第四阶段：AI会话层升级

#### 4.1 ChatService 用户隔离

```python
# src/services/chat_service.py - 关键更新

class ChatService:
    """
    AI 对话服务（多用户版本）
    """

    def __init__(self, user_id: Optional[str] = None):
        """
        初始化对话服务

        Args:
            user_id: 当前用户ID，用于数据隔离
        """
        self._db = DatabaseManager.get_instance()
        self._agent_service = AgentService(self._db)
        self._user_id = user_id  # 保存用户ID用于数据隔离

    # ========== 用户隔离的会话方法 ==========

    def get_sessions(
        self,
        user_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        获取会话列表

        - 如果提供了user_id且与当前用户不同，需要管理员权限
        - 普通用户只能查看自己的会话
        """
        target_user_id = user_id or self._user_id

        # 权限检查应在调用此方法前完成

        with self._db.get_session() as session:
            query = session.query(ChatSession)\
                .filter(ChatSession.user_id == target_user_id)\
                .order_by(ChatSession.updated_at.desc())\
                .limit(limit)\
                .offset(offset)
            return [s.to_dict() for s in query.all()]

    def _create_session(
        self,
        stock_code: Optional[str] = None,
        model_name: Optional[str] = None,
        agent_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> str:
        """创建新会话（带用户ID）"""

        target_user_id = user_id or self._user_id
        if not target_user_id:
            raise ValueError("创建会话需要提供user_id")

        session_id = str(uuid.uuid4())

        # ... Agent配置获取代码 ...

        with self._db.get_session() as session:
            chat_session = ChatSession(
                id=session_id,
                user_id=target_user_id,  # 关联用户
                title='新对话',
                stock_code=stock_code,
                model_name=model_name,
                message_count=0,
                agent_id=actual_agent_id,
                current_agent_config=json.dumps(session_config)
            )
            session.add(chat_session)
            session.commit()
        return session_id
```

#### 4.2 用户隔离的AI工具

```python
# src/services/chat_tools.py - 更新工具函数

# 修改所有工具函数，接收当前用户上下文

def get_current_user_id_from_context() -> Optional[str]:
    """
    从线程本地存储或上下文获取当前用户ID

    需要在ChatService中设置上下文变量
    """
    from contextvars import ContextVar

    # 使用ContextVar存储当前用户ID
    user_id_var: ContextVar[Optional[str]] = ContextVar('current_user_id', default=None)
    return user_id_var.get()


@tool()
def get_my_portfolio() -> str:
    """
    获取当前登录用户的持仓列表
    当用户询问"我持仓什么股票"、"我的持仓"、"我有哪些股票"时调用此工具
    """
    from src.repositories.portfolio_repo import PortfolioRepository
    from src.services.stock_service import StockService
    from src.services.chat_service import get_current_user_id

    try:
        # 获取当前用户ID（从线程上下文）
        user_id = get_current_user_id()
        if not user_id:
            return json.dumps({
                "error": "未登录用户无法查看持仓",
                "message": "请先登录"
            }, ensure_ascii=False)

        repo = PortfolioRepository()
        stock_svc = StockService()

        positions = repo.get_all_positions(user_id=user_id)

        # ... 后续逻辑与之前相同 ...

    except Exception as e:
        logger.error(f"[Portfolio] 获取持仓失败: {e}")
        return json.dumps({"error": f"获取持仓失败: {str(e)}"}, ensure_ascii=False)


@tool()
def get_my_portfolio_analysis() -> str:
    """
    获取持仓组合中每只股票最近的AI分析结论（仅当前用户）
    """
    from src.repositories.portfolio_repo import PortfolioRepository
    from src.repositories.analysis_repo import AnalysisRepository
    from src.services.chat_service import get_current_user_id

    try:
        user_id = get_current_user_id()
        if not user_id:
            return json.dumps({"error": "未登录用户无法查看持仓分析"}, ensure_ascii=False)

        portfolio_repo = PortfolioRepository()
        analysis_repo = AnalysisRepository()

        # 只查询当前用户的持仓
        positions = portfolio_repo.get_all_positions(user_id=user_id)

        # ... 后续逻辑 ...

    except Exception as e:
        return json.dumps({"error": f"查询失败: {str(e)}"}, ensure_ascii=False)
```

---

### 第五阶段：路由注册与中间件

```python
# api/v1/router.py (更新)

from fastapi import APIRouter

from api.v1.endpoints import auth, users, portfolio, analysis, chat

router = APIRouter(prefix="/v1")

# 认证相关（无需认证）
router.include_router(auth.router)

# 用户管理（需要管理员权限）
router.include_router(users.router)

# 持仓管理（需要认证，自带用户隔离）
router.include_router(portfolio.router)

# 分析历史（需要认证）
router.include_router(analysis.router)

# 对话相关（需要认证）
router.include_router(chat.router)
```

---

## 数据库迁移策略

由于SQLite不支持完整的ALTER TABLE，需要特殊处理：

```python
# scripts/migrate_add_user_support.py (新建迁移脚本)

"""
数据库迁移脚本：添加多用户支持

执行方式: python scripts/migrate_add_user_support.py
"""

import sqlite3
import uuid
from pathlib import Path


def migrate():
    db_path = Path("data/stock_analysis.db")
    if not db_path.exists():
        print("数据库文件不存在")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 1. 创建用户表
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE,
            hashed_password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            is_active BOOLEAN DEFAULT 1,
            is_verified BOOLEAN DEFAULT 0,
            display_name TEXT,
            avatar_url TEXT,
            preferences TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login_at TIMESTAMP
        )
    """)

    # 2. 创建默认管理员用户（密码需要在创建后手动修改）
    admin_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT OR IGNORE INTO users (id, username, hashed_password, role, display_name)
        VALUES (?, 'admin', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G', 'admin', '管理员')
    """, (admin_id,))

    # 3. 为现有表添加 user_id 列
    tables_to_migrate = [
        ('portfolio_position', 'user_id TEXT'),
        ('chat_session', 'user_id TEXT NOT NULL'),
        ('analysis_history', 'user_id TEXT'),
    ]

    for table, column_def in tables_to_migrate:
        try:
            # 检查列是否已存在
            cursor.execute(f"PRAGMA table_info({table})")
            columns = [row[1] for row in cursor.fetchall()]

            if 'user_id' not in columns:
                # SQLite 添加列
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column_def}")
                print(f"已为 {table} 添加 user_id 列")

                # 可选：为现有数据设置默认用户
                cursor.execute(f"UPDATE {table} SET user_id = ? WHERE user_id IS NULL", (admin_id,))
                print(f"已为 {table} 的现有数据设置默认用户")
            else:
                print(f"{table} 已有 user_id 列，跳过")
        except Exception as e:
            print(f"迁移 {table} 失败: {e}")

    # 4. 创建新索引
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS ix_portfolio_user_code
        ON portfolio_position(user_id, code)
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS ix_chat_session_user
        ON chat_session(user_id, updated_at)
    """)

    conn.commit()
    conn.close()

    print("\n迁移完成！")
    print(f"默认管理员用户名: admin")
    print(f"默认管理员密码: admin123")
    print("请尽快登录并修改密码！")


if __name__ == "__main__":
    migrate()
```

---

## 实施计划（更新版）

### 阶段一：用户系统基础（4-6小时）

1. [ ] 创建用户模型 `User`
2. [ ] JWT工具函数 `jwt_utils.py`
3. [ ] 密码加密工具
4. [ ] 用户数据访问层 `UserRepository`
5. [ ] 认证API `/auth/*`

### 阶段二：数据模型升级（3-4小时）

1. [ ] 为 `PortfolioPosition` 添加 `user_id`
2. [ ] 为 `ChatSession` 添加 `user_id`
3. [ ] 为 `AnalysisHistory` 添加 `user_id`
4. [ ] 更新Repository层，所有查询带用户过滤
5. [ ] 创建数据库迁移脚本

### 阶段三：API权限控制（3-4小时）

1. [ ] 权限依赖 `deps.py` 更新
2. [ ] 持仓API用户隔离改造
3. [ ] 用户管理API（管理员）
4. [ ] 路由注册与测试

### 阶段四：AI会话层升级（2-3小时）

1. [ ] ChatService 用户隔离
2. [ ] AI工具获取当前用户上下文
3. [ ] 更新系统提示词

### 阶段五：前端适配（可选，6-8小时）

1. [ ] 登录/注册页面
2. [ ] Token存储与自动刷新
3. [ ] 用户管理界面（管理员）
4. [ ] 个人中心

---

## 安全注意事项

1. **JWT密钥**：生产环境必须修改 `JWT_SECRET_KEY`，使用随机生成的强密钥
2. **密码策略**：建议增加密码复杂度要求（大小写+数字+特殊字符）
3. **Token过期**：考虑实现Refresh Token机制，避免频繁重新登录
4. **HTTPS**：生产环境必须使用HTTPS传输Token
5. **Rate Limiting**：对登录API进行频率限制，防止暴力破解
6. **审计日志**：记录管理员操作（删除用户、重置密码等）

---

## 与单用户版本的对比

| 方面 | 单用户版 | 多用户版 |
|-----|---------|---------|
| 数据模型 | 无user_id | 所有核心表都有user_id |
| API认证 | 可选/无 | JWT Token强制认证 |
| 权限控制 | 无 | 角色-based权限 |
| 持仓查询 | `get_all_positions()` | `get_all_positions(user_id=xxx)` |
| AI工具 | 直接调用 | 需验证用户身份 |
| 部署复杂度 | 低 | 中等 |
| 适用场景 | 个人使用 | SaaS/团队使用 |

---

## 下一步

你希望：

1. **完整实现多用户版本** - 按上述5个阶段逐步开发
2. **先实现单用户，预留多用户接口** - 数据模型加user_id但默认填固定值，后续平滑升级
3. **仅实现用户隔离，暂不实现角色权限** - 所有用户平等，只能看自己的数据
4. **调整方案** - 根据你的具体需求修改
