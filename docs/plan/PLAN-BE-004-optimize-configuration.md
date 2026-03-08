# PLAN-BE-004: 配置管理优化

> 重构配置管理模块，提高可维护性和类型安全

## 基本信息

| 字段 | 值 |
|------|-----|
| 计划ID | PLAN-BE-004 |
| 计划名称 | 配置管理优化 |
| 创建日期 | 2026-03-08 |
| 优先级 | 🟢 Low |
| 状态 | 🟡 Pending |
| 负责人 | - |

## 背景与目标

### 问题描述

当前配置管理存在问题：

1. 文件过大：src/config.py 701 行
2. 缺乏类型安全：大量使用 dict 和 Any
3. 配置来源复杂：多源配置加载顺序不清晰
4. 无配置验证：缺少配置项合法性校验

### 预期目标

1. 拆分配置模块，按功能域组织
2. 使用 Pydantic 提供类型安全和验证
3. 明确配置加载优先级
4. 保持向后兼容

## 目录结构

```
backend/
├── src/
│   ├── config/                    # 新：配置模块包
│   │   ├── __init__.py
│   │   ├── base.py               # 基础配置类
│   │   ├── database.py           # 数据库配置
│   │   ├── notification.py       # 通知配置
│   │   ├── trading.py            # 交易配置
│   │   ├── analysis.py           # 分析配置
│   │   ├── security.py           # 安全配置
│   │   └── server.py             # 服务器配置
│   └── config.py                  # 保留：向后兼容
```

## Pydantic 配置示例

```python
class DatabaseConfig(BaseSettings):
    postgres_host: str = Field(default="localhost")
    postgres_port: int = Field(default=5432, ge=1, le=65535)
    pool_size: int = Field(default=5, ge=1, le=100)

    @property
    def database_url(self) -> str:
        return f"postgresql://..."
```

## 任务清单

### 任务1：创建配置模块基础结构
- [ ] 安装依赖 pydantic-settings pyyaml
- [ ] 创建 src/config/base.py
- [ ] 创建配置加载器

### 任务2：拆分各域配置
- [ ] DatabaseConfig
- [ ] NotificationConfig
- [ ] TradingConfig
- [ ] AnalysisConfig
- [ ] SecurityConfig
- [ ] ServerConfig

### 任务3：全项目导入更新
- [ ] 更新所有导入语句
- [ ] 运行类型检查

### 任务4：向后兼容
- [ ] 更新 src/config.py
- [ ] 添加弃用警告

## 配置优先级

1. 环境变量（最高）
2. 本地配置文件
3. 环境特定配置
4. 默认配置
5. 代码默认值（最低）

## 进度记录

| 日期 | 更新内容 | 更新者 |
|------|----------|--------|
| 2026-03-08 | 计划创建 | Claude |

## 依赖关系

- 依赖: PLAN-BE-001
- 阻塞: 无
