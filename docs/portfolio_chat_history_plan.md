# 持仓管理与AI历史分析查询功能开发计划

## 需求概述

### 功能1：持仓管理
- 记录用户的持仓股票、成本价、数量等信息
- 在AI会话中集成持仓数据，便于智能诊股时参考

### 功能2：AI历史分析查询
- 让AI能够通过工具查询某只股票过去的智能分析内容
- 支持时间范围筛选、关键词搜索

---

## 现状分析

### 已有基础
1. **数据模型**（SQLAlchemy ORM）
   - `StockInfo`: 自选股基本信息
   - `AnalysisHistory`: AI分析历史记录（含 sentiment_score, operation_advice 等）
   - `ChatSession/ChatMessage`: AI对话会话和消息

2. **AI工具系统**
   - `ToolRegistry`: 工具注册中心
   - `@tool` 装饰器：自动提取函数签名和docstring注册工具
   - 已有工具：`get_realtime_quote`, `get_technical_summary`, `get_latest_report`, `search_news`, `get_chip_distribution`

3. **服务层**
   - `ChatService`: AI对话核心服务，支持多轮工具调用
   - `StockService`: 股票数据服务
   - `AnalysisRepository`: 分析历史数据访问层

---

## 详细设计方案

### 第一阶段：数据模型设计

#### 1.1 新建持仓模型 `PortfolioPosition`

```python
# src/storage.py

class PortfolioPosition(Base):
    """
    持仓记录模型

    记录用户的持仓股票、成本价、数量等信息
    支持多个持仓分组（如"核心持仓"、"观察仓"等）
    """
    __tablename__ = 'portfolio_position'

    id = Column(Integer, primary_key=True, autoincrement=True)

    # 股票信息
    code = Column(String(10), nullable=False, index=True)
    name = Column(String(50))

    # 持仓数据
    quantity = Column(Float, nullable=False)  # 持仓数量（股）
    cost_price = Column(Float, nullable=False)  # 成本价（元）

    # 分组标签（如"核心持仓"、"短线仓"）
    group_name = Column(String(50), default='默认分组')

    # 用户备注
    remark = Column(Text)

    # 状态
    is_active = Column(Boolean, default=True)  # 是否仍持有

    # 时间戳
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    __table_args__ = (
        Index('ix_portfolio_code_group', 'code', 'group_name'),
        Index('ix_portfolio_group', 'group_name'),
    )

    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'code': self.code,
            'name': self.name,
            'quantity': self.quantity,
            'cost_price': self.cost_price,
            'group_name': self.group_name,
            'remark': self.remark,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    @property
    def market_value(self, current_price: float = None) -> Optional[float]:
        """计算市值（需要传入当前价）"""
        if current_price:
            return self.quantity * current_price
        return None

    @property
    def profit_loss(self, current_price: float = None) -> Optional[float]:
        """计算盈亏金额"""
        if current_price:
            return self.quantity * (current_price - self.cost_price)
        return None

    @property
    def profit_loss_pct(self, current_price: float = None) -> Optional[float]:
        """计算盈亏比例（%）"""
        if current_price:
            return (current_price - self.cost_price) / self.cost_price * 100
        return None
```

#### 1.2 数据库迁移

SQLite无需显式迁移，SQLAlchemy会自动创建新表。但需要处理：
- 首次启动时自动创建表（`Base.metadata.create_all`）
- 可能需要数据初始化脚本

---

### 第二阶段：数据访问层（Repository）

#### 2.1 新建 `PortfolioRepository`

```python
# src/repositories/portfolio_repo.py

from typing import List, Optional, Dict, Any
from datetime import date
from sqlalchemy import and_, desc

from src.storage import DatabaseManager, PortfolioPosition


class PortfolioRepository:
    """持仓数据访问层"""

    def __init__(self, db_manager: Optional[DatabaseManager] = None):
        self.db = db_manager or DatabaseManager.get_instance()

    def get_all_positions(self, group_name: Optional[str] = None) -> List[PortfolioPosition]:
        """获取所有持仓（可按分组筛选）"""
        with self.db.get_session() as session:
            query = session.query(PortfolioPosition).filter(PortfolioPosition.is_active == True)
            if group_name:
                query = query.filter(PortfolioPosition.group_name == group_name)
            return query.order_by(desc(PortfolioPosition.updated_at)).all()

    def get_position(self, code: str, group_name: str = '默认分组') -> Optional[PortfolioPosition]:
        """获取指定股票的持仓"""
        with self.db.get_session() as session:
            return session.query(PortfolioPosition).filter(
                and_(
                    PortfolioPosition.code == code,
                    PortfolioPosition.group_name == group_name,
                    PortfolioPosition.is_active == True
                )
            ).first()

    def save_position(self, code: str, name: str, quantity: float,
                     cost_price: float, group_name: str = '默认分组',
                     remark: str = None) -> PortfolioPosition:
        """保存或更新持仓"""
        with self.db.get_session() as session:
            # 检查是否已存在
            existing = session.query(PortfolioPosition).filter(
                and_(
                    PortfolioPosition.code == code,
                    PortfolioPosition.group_name == group_name
                )
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
                # 创建新记录
                position = PortfolioPosition(
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

    def close_position(self, code: str, group_name: str = '默认分组') -> bool:
        """平仓（标记为is_active=False）"""
        with self.db.get_session() as session:
            position = session.query(PortfolioPosition).filter(
                and_(
                    PortfolioPosition.code == code,
                    PortfolioPosition.group_name == group_name
                )
            ).first()

            if position:
                position.is_active = False
                session.commit()
                return True
            return False

    def delete_position(self, code: str, group_name: str = '默认分组') -> bool:
        """彻底删除持仓记录"""
        with self.db.get_session() as session:
            result = session.query(PortfolioPosition).filter(
                and_(
                    PortfolioPosition.code == code,
                    PortfolioPosition.group_name == group_name
                )
            ).delete()
            session.commit()
            return result > 0

    def get_groups(self) -> List[str]:
        """获取所有分组名称"""
        with self.db.get_session() as session:
            groups = session.query(PortfolioPosition.group_name).distinct().all()
            return [g[0] for g in groups]

    def get_portfolio_summary(self) -> Dict[str, Any]:
        """获取持仓汇总统计"""
        with self.db.get_session() as session:
            positions = session.query(PortfolioPosition).filter(
                PortfolioPosition.is_active == True
            ).all()

            total_cost = sum(p.quantity * p.cost_price for p in positions)
            total_quantity = sum(p.quantity for p in positions)

            return {
                'total_positions': len(positions),
                'total_cost_value': round(total_cost, 2),
                'groups': self.get_groups(),
                'codes': [p.code for p in positions]
            }
```

#### 2.2 增强 `AnalysisRepository`

在现有 `analysis_repo.py` 中增加以下方法：

```python
# src/repositories/analysis_repo.py 新增方法

def get_analysis_history_detail(
    self,
    code: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    operation_advice: Optional[str] = None,  # 按操作建议筛选：买入/卖出/观望
    min_score: Optional[int] = None,  # 最低情绪分
    max_score: Optional[int] = None,  # 最高情绪分
    keyword: Optional[str] = None,  # 关键词搜索（在analysis_summary中）
    limit: int = 10
) -> List[Dict[str, Any]]:
    """
    获取详细的历史分析记录，支持多种筛选条件

    用于AI工具查询历史分析内容
    """
    from sqlalchemy import and_, or_, desc
    from datetime import datetime, timedelta

    with self.db.get_session() as session:
        from src.storage import AnalysisHistory

        query = session.query(AnalysisHistory).filter(AnalysisHistory.code == code)

        # 日期范围筛选
        if start_date:
            query = query.filter(AnalysisHistory.created_at >= datetime.combine(start_date, datetime.min.time()))
        if end_date:
            query = query.filter(AnalysisHistory.created_at <= datetime.combine(end_date, datetime.max.time()))

        # 操作建议筛选
        if operation_advice:
            query = query.filter(AnalysisHistory.operation_advice == operation_advice)

        # 情绪分范围筛选
        if min_score is not None:
            query = query.filter(AnalysisHistory.sentiment_score >= min_score)
        if max_score is not None:
            query = query.filter(AnalysisHistory.sentiment_score <= max_score)

        # 关键词搜索
        if keyword:
            query = query.filter(
                or_(
                    AnalysisHistory.analysis_summary.contains(keyword),
                    AnalysisHistory.trend_prediction.contains(keyword)
                )
            )

        records = query.order_by(desc(AnalysisHistory.created_at)).limit(limit).all()

        return [r.to_dict() for r in records]

def get_analysis_trend(self, code: str, days: int = 30) -> List[Dict[str, Any]]:
    """
    获取某只股票的情绪分趋势变化

    用于展示AI分析的连贯性和变化
    """
    from datetime import datetime, timedelta

    start_time = datetime.now() - timedelta(days=days)

    with self.db.get_session() as session:
        from src.storage import AnalysisHistory

        records = session.query(AnalysisHistory).filter(
            and_(
                AnalysisHistory.code == code,
                AnalysisHistory.created_at >= start_time,
                AnalysisHistory.sentiment_score.isnot(None)
            )
        ).order_by(AnalysisHistory.created_at).all()

        return [
            {
                'date': r.created_at.isoformat(),
                'sentiment_score': r.sentiment_score,
                'operation_advice': r.operation_advice,
                'trend_prediction': r.trend_prediction,
            }
            for r in records
        ]

def get_analysis_comparison(
    self,
    codes: List[str],
    days: int = 7
) -> Dict[str, List[Dict[str, Any]]]:
    """
    获取多只股票的分析对比

    用于持仓组合的整体分析
    """
    from datetime import datetime, timedelta

    start_time = datetime.now() - timedelta(days=days)
    result = {}

    with self.db.get_session() as session:
        from src.storage import AnalysisHistory

        for code in codes:
            records = session.query(AnalysisHistory).filter(
                and_(
                    AnalysisHistory.code == code,
                    AnalysisHistory.created_at >= start_time
                )
            ).order_by(desc(AnalysisHistory.created_at)).limit(1).all()

            result[code] = [r.to_dict() for r in records]

    return result
```

---

### 第三阶段：AI工具开发

#### 3.1 持仓管理工具

```python
# src/services/chat_tools.py 新增

@tool()
def get_my_portfolio() -> str:
    """
    获取用户的持仓列表，包括股票代码、名称、持仓数量、成本价等信息。
    当用户询问"我持仓什么股票"、"我的持仓"、"我有哪些股票"时调用此工具。
    """
    from src.repositories.portfolio_repo import PortfolioRepository
    from src.services.stock_service import StockService

    try:
        repo = PortfolioRepository()
        stock_svc = StockService()

        positions = repo.get_all_positions()

        if not positions:
            return json.dumps({
                "has_positions": False,
                "message": "当前没有持仓记录"
            }, ensure_ascii=False)

        # 获取实时行情计算盈亏
        portfolio_list = []
        for pos in positions:
            quote = stock_svc.get_realtime_quote(pos.code)
            current_price = quote.get('price') if quote else None

            position_data = {
                "code": pos.code,
                "name": pos.name,
                "quantity": pos.quantity,
                "cost_price": pos.cost_price,
                "group": pos.group_name,
                "current_price": current_price,
                "market_value": round(pos.quantity * current_price, 2) if current_price else None,
                "profit_loss": round(pos.quantity * (current_price - pos.cost_price), 2) if current_price else None,
                "profit_loss_pct": round((current_price - pos.cost_price) / pos.cost_price * 100, 2) if current_price else None,
            }
            portfolio_list.append(position_data)

        # 计算汇总
        total_cost = sum(p.quantity * p.cost_price for p in positions)
        total_market_value = sum(p['market_value'] for p in portfolio_list if p['market_value'])

        return json.dumps({
            "has_positions": True,
            "positions": portfolio_list,
            "summary": {
                "total_positions": len(positions),
                "total_cost": round(total_cost, 2),
                "total_market_value": round(total_market_value, 2),
                "total_profit_loss": round(total_market_value - total_cost, 2),
                "total_profit_loss_pct": round((total_market_value - total_cost) / total_cost * 100, 2) if total_cost else None,
                "groups": list(set(p.group_name for p in positions))
            }
        }, ensure_ascii=False, default=str)

    except Exception as e:
        logger.error(f"[Portfolio] 获取持仓失败: {e}")
        return json.dumps({"error": f"获取持仓失败: {str(e)}"}, ensure_ascii=False)


@tool()
def get_position_detail(stock_code: str) -> str:
    """
    获取指定股票的详细持仓信息，包括成本、数量、盈亏等。
    当用户询问"我的XX股票持仓多少"、"XX股票我成本多少"时调用此工具。

    Args:
        stock_code: 股票代码，如600519、AAPL
    """
    from src.repositories.portfolio_repo import PortfolioRepository
    from src.services.stock_service import StockService

    try:
        repo = PortfolioRepository()
        stock_svc = StockService()

        position = repo.get_position(stock_code)

        if not position:
            return json.dumps({
                "has_position": False,
                "code": stock_code,
                "message": f"未持有股票 {stock_code}"
            }, ensure_ascii=False)

        # 获取实时行情
        quote = stock_svc.get_realtime_quote(stock_code)
        current_price = quote.get('price') if quote else None

        return json.dumps({
            "has_position": True,
            "code": position.code,
            "name": position.name,
            "quantity": position.quantity,
            "cost_price": position.cost_price,
            "total_cost": round(position.quantity * position.cost_price, 2),
            "current_price": current_price,
            "market_value": round(position.quantity * current_price, 2) if current_price else None,
            "profit_loss": round(position.quantity * (current_price - position.cost_price), 2) if current_price else None,
            "profit_loss_pct": round((current_price - position.cost_price) / position.cost_price * 100, 2) if current_price else None,
            "group": position.group_name,
            "remark": position.remark,
        }, ensure_ascii=False, default=str)

    except Exception as e:
        logger.error(f"[Portfolio] 获取持仓详情失败: {e}")
        return json.dumps({"error": f"获取持仓详情失败: {str(e)}"}, ensure_ascii=False)
```

#### 3.2 历史分析查询工具

```python
# src/services/chat_tools.py 新增

@tool()
def get_stock_analysis_history(
    stock_code: str,
    days: int = 30,
    operation_advice: str = None
) -> str:
    """
    获取某只股票过去一段时间的AI智能分析历史记录。
    当用户询问"XX股票过去分析结论"、"XX股票历史分析"、"之前怎么分析XX股票"时调用此工具。

    Args:
        stock_code: 股票代码，如600519、AAPL
        days: 查询多少天内的历史，默认30天
        operation_advice: 按操作建议筛选，可选值：买入、卖出、观望
    """
    from src.repositories.analysis_repo import AnalysisRepository
    from datetime import date, timedelta

    try:
        repo = AnalysisRepository()

        end_date = date.today()
        start_date = end_date - timedelta(days=days)

        records = repo.get_analysis_history_detail(
            code=stock_code,
            start_date=start_date,
            end_date=end_date,
            operation_advice=operation_advice,
            limit=20
        )

        if not records:
            return json.dumps({
                "has_history": False,
                "code": stock_code,
                "message": f"过去{days}天内没有{stock_code}的分析记录"
            }, ensure_ascii=False)

        # 简化返回数据，便于AI处理
        simplified_records = []
        for r in records:
            simplified_records.append({
                "analysis_date": r.get("created_at"),
                "sentiment_score": r.get("sentiment_score"),
                "operation_advice": r.get("operation_advice"),
                "trend_prediction": r.get("trend_prediction"),
                "analysis_summary": r.get("analysis_summary", "")[:200] + "..." if r.get("analysis_summary") else None,
                "risk_warning": r.get("risk_warning", "")[:200] + "..." if r.get("risk_warning") else None,
            })

        return json.dumps({
            "has_history": True,
            "code": stock_code,
            "query_range": f"{start_date} 至 {end_date}",
            "total_records": len(records),
            "records": simplified_records
        }, ensure_ascii=False, default=str)

    except Exception as e:
        logger.error(f"[Analysis History] 查询失败: {e}")
        return json.dumps({"error": f"查询分析历史失败: {str(e)}"}, ensure_ascii=False)


@tool()
def get_analysis_trend(stock_code: str, days: int = 30) -> str:
    """
    获取某只股票AI分析情绪分的历史趋势变化。
    当用户询问"XX股票分析情绪变化"、"XX股票看法有什么变化"时调用此工具。

    Args:
        stock_code: 股票代码
        days: 查询天数，默认30天
    """
    from src.repositories.analysis_repo import AnalysisRepository

    try:
        repo = AnalysisRepository()
        trend = repo.get_analysis_trend(stock_code, days=days)

        if not trend:
            return json.dumps({
                "has_trend": False,
                "code": stock_code,
                "message": f"过去{days}天内没有分析记录"
            }, ensure_ascii=False)

        # 计算趋势变化
        scores = [t["sentiment_score"] for t in trend if t["sentiment_score"] is not None]
        avg_score = sum(scores) / len(scores) if scores else None

        # 判断趋势方向
        if len(scores) >= 3:
            recent_avg = sum(scores[-3:]) / 3
            early_avg = sum(scores[:3]) / 3
            if recent_avg > early_avg + 5:
                trend_direction = "情绪改善"
            elif recent_avg < early_avg - 5:
                trend_direction = "情绪恶化"
            else:
                trend_direction = "情绪稳定"
        else:
            trend_direction = "数据不足"

        return json.dumps({
            "has_trend": True,
            "code": stock_code,
            "days": days,
            "data_points": len(trend),
            "average_score": round(avg_score, 2) if avg_score else None,
            "latest_score": scores[-1] if scores else None,
            "earliest_score": scores[0] if scores else None,
            "trend_direction": trend_direction,
            "trend_data": trend
        }, ensure_ascii=False, default=str)

    except Exception as e:
        logger.error(f"[Analysis Trend] 查询失败: {e}")
        return json.dumps({"error": f"查询趋势失败: {str(e)}"}, ensure_ascii=False)


@tool()
def get_my_portfolio_analysis() -> str:
    """
    获取持仓组合中每只股票最近的AI分析结论。
    当用户询问"我的持仓分析"、"看看我持仓的股票分析"、"我买的股票最近怎么看"时调用此工具。
    """
    from src.repositories.portfolio_repo import PortfolioRepository
    from src.repositories.analysis_repo import AnalysisRepository

    try:
        portfolio_repo = PortfolioRepository()
        analysis_repo = AnalysisRepository()

        positions = portfolio_repo.get_all_positions()

        if not positions:
            return json.dumps({
                "has_positions": False,
                "message": "当前没有持仓记录"
            }, ensure_ascii=False)

        codes = [p.code for p in positions]
        position_map = {p.code: p for p in positions}

        # 获取这些股票的最新分析
        comparison = analysis_repo.get_analysis_comparison(codes, days=7)

        results = []
        for code in codes:
            position = position_map[code]
            analysis_list = comparison.get(code, [])

            if analysis_list:
                latest = analysis_list[0]
                results.append({
                    "code": code,
                    "name": position.name,
                    "quantity": position.quantity,
                    "cost_price": position.cost_price,
                    "latest_analysis": {
                        "date": latest.get("created_at"),
                        "sentiment_score": latest.get("sentiment_score"),
                        "operation_advice": latest.get("operation_advice"),
                        "trend_prediction": latest.get("trend_prediction"),
                        "analysis_summary": latest.get("analysis_summary", "")[:150] + "..." if latest.get("analysis_summary") else None,
                    }
                })
            else:
                results.append({
                    "code": code,
                    "name": position.name,
                    "quantity": position.quantity,
                    "cost_price": position.cost_price,
                    "latest_analysis": None
                })

        return json.dumps({
            "has_positions": True,
            "total_positions": len(positions),
            "analyzed_count": sum(1 for r in results if r["latest_analysis"]),
            "positions": results
        }, ensure_ascii=False, default=str)

    except Exception as e:
        logger.error(f"[Portfolio Analysis] 查询失败: {e}")
        return json.dumps({"error": f"查询持仓分析失败: {str(e)}"}, ensure_ascii=False)
```

---

### 第四阶段：API层开发

#### 4.1 持仓管理API

```python
# api/v1/endpoints/portfolio.py (新建文件)

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from src.repositories.portfolio_repo import PortfolioRepository

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


class PortfolioSummary(BaseModel):
    total_positions: int
    total_cost_value: float
    groups: List[str]
    codes: List[str]


@router.get("/positions", response_model=List[PositionResponse])
async def get_positions(group: Optional[str] = None):
    """获取持仓列表"""
    repo = PortfolioRepository()
    positions = repo.get_all_positions(group_name=group)
    return [p.to_dict() for p in positions]


@router.post("/positions", response_model=PositionResponse)
async def create_position(position: PositionCreate):
    """添加或更新持仓"""
    repo = PortfolioRepository()
    result = repo.save_position(
        code=position.code,
        name=position.name,
        quantity=position.quantity,
        cost_price=position.cost_price,
        group_name=position.group_name,
        remark=position.remark
    )
    return result.to_dict()


@router.get("/positions/{code}", response_model=PositionResponse)
async def get_position(code: str, group: str = "默认分组"):
    """获取单个持仓详情"""
    repo = PortfolioRepository()
    position = repo.get_position(code, group_name=group)
    if not position:
        raise HTTPException(status_code=404, detail=f"持仓 {code} 不存在")
    return position.to_dict()


@router.delete("/positions/{code}")
async def delete_position(code: str, group: str = "默认分组"):
    """删除持仓"""
    repo = PortfolioRepository()
    success = repo.delete_position(code, group_name=group)
    if not success:
        raise HTTPException(status_code=404, detail=f"持仓 {code} 不存在")
    return {"message": f"持仓 {code} 已删除"}


@router.post("/positions/{code}/close")
async def close_position(code: str, group: str = "默认分组"):
    """平仓（标记为已卖出）"""
    repo = PortfolioRepository()
    success = repo.close_position(code, group_name=group)
    if not success:
        raise HTTPException(status_code=404, detail=f"持仓 {code} 不存在")
    return {"message": f"持仓 {code} 已平仓"}


@router.get("/summary", response_model=PortfolioSummary)
async def get_portfolio_summary():
    """获取持仓汇总"""
    repo = PortfolioRepository()
    return repo.get_portfolio_summary()


@router.get("/groups")
async def get_groups():
    """获取所有分组"""
    repo = PortfolioRepository()
    return {"groups": repo.get_groups()}
```

在 `api/v1/__init__.py` 中注册新路由：

```python
from api.v1.endpoints import portfolio

api_v1_router.include_router(portfolio.router)
```

---

### 第五阶段：系统集成

#### 5.1 更新系统提示词

修改 `src/services/chat_service.py` 中的 `CHAT_SYSTEM_PROMPT`，让AI了解新工具：

```python
CHAT_SYSTEM_PROMPT = """你是一个专业的 AI 投研助手，帮助用户分析股票、解读行情、回答投资相关问题。

你的核心能力：
1. **实时行情查询**：可以调用工具获取任何股票的最新价格和行情数据
2. **技术面分析**：可以获取K线数据和技术指标，分析走势趋势
3. **报告回顾**：可以查看历史分析报告，帮助用户理解之前的分析结论
4. **新闻搜索**：可以搜索最新新闻和公告，获取市场动态
5. **筹码分析**：可以获取A股筹码分布数据
6. **持仓管理**：可以查看用户的持仓情况和盈亏状态
7. **历史分析查询**：可以查询某只股票过去一段时间的AI分析记录和情绪趋势变化

使用规则：
- 当用户询问具体股票信息时，**主动调用相关工具获取数据**，不要凭空编造数据
- 当用户询问"我的持仓"、"我持仓的股票"时，调用 get_my_portfolio 工具
- 当用户询问"我持仓的XX股票分析"时，先调用 get_position_detail 获取持仓信息，再调用 get_my_portfolio_analysis 获取最新分析
- 当用户询问"XX股票过去怎么分析"、"XX股票历史分析"时，调用 get_stock_analysis_history 工具
- 当用户询问"XX股票分析有什么变化"时，调用 get_analysis_trend 工具
- 回复时引用工具返回的真实数据，确保准确性
- 对于纯知识性问题（如"什么是换手率"），直接回答无需调用工具
- 使用简洁的 Markdown 格式回复
- 回答要专业但易懂，避免过度使用术语
- 投资建议需附带风险提示

重要提醒：
- 你不是理财顾问，不能做出投资承诺
- 你提供的是数据分析和信息整合，最终决策权在用户
- 涉及具体操作建议时，务必提醒用户注意风险
"""
```

#### 5.2 前端界面（可选）

如果需要为持仓管理提供前端界面，可以在 `apps/dsa-web/src` 中新增：

```
apps/dsa-web/src/
├── components/
│   └── portfolio/
│       ├── PortfolioList.tsx      # 持仓列表
│       ├── PositionForm.tsx       # 添加/编辑持仓表单
│       └── PortfolioSummary.tsx   # 持仓汇总卡片
├── pages/
│   └── PortfolioPage.tsx          # 持仓管理页面
└── api/
    └── portfolio.ts               # 持仓API调用
```

---

## 实施计划

### 阶段一：数据层（预计2-3小时）
1. [ ] 在 `storage.py` 中创建 `PortfolioPosition` 模型
2. [ ] 新建 `src/repositories/portfolio_repo.py`
3. [ ] 在 `analysis_repo.py` 中增加查询方法

### 阶段二：AI工具（预计2-3小时）
1. [ ] 在 `chat_tools.py` 中添加持仓相关工具
2. [ ] 在 `chat_tools.py` 中添加历史分析查询工具
3. [ ] 测试工具是否能正常注册和调用

### 阶段三：API层（预计1-2小时）
1. [ ] 新建 `api/v1/endpoints/portfolio.py`
2. [ ] 注册路由到主应用
3. [ ] 使用 curl/httpie 测试API

### 阶段四：集成与测试（预计2小时）
1. [ ] 更新系统提示词
2. [ ] 端到端测试AI对话流程
3. [ ] 测试边界情况（无持仓、无历史分析等）

### 阶段五：前端界面（可选，预计4-6小时）
1. [ ] 持仓管理页面
2. [ ] 在Chat界面显示持仓快捷操作

---

## 文件变更清单

### 修改文件
1. `src/storage.py` - 添加 `PortfolioPosition` 模型
2. `src/repositories/analysis_repo.py` - 增加历史查询方法
3. `src/services/chat_tools.py` - 添加新工具函数
4. `src/services/chat_service.py` - 更新系统提示词
5. `api/v1/__init__.py` - 注册新路由

### 新建文件
1. `src/repositories/portfolio_repo.py` - 持仓数据访问层
2. `api/v1/endpoints/portfolio.py` - 持仓管理API

---

## 使用示例

### 场景1：用户查询持仓
```
用户：我持仓什么股票？
AI：【调用 get_my_portfolio】
    根据您的持仓记录，您当前持有以下股票：
    1. 贵州茅台(600519) - 持仓100股，成本价1600元，当前市价1700元，盈利10000元(+6.25%)
    2. 宁德时代(300750) - 持仓200股，成本价180元，当前市价175元，亏损1000元(-2.78%)
```

### 场景2：用户查询历史分析
```
用户：贵州茅台过去一个月的分析结论有什么变化？
AI：【调用 get_stock_analysis_history + get_analysis_trend】
    过去30天内，贵州茅台共有5次AI分析记录：
    - 1月15日：情绪分75，建议"买入"，趋势判断"震荡上行"
    - 1月20日：情绪分68，建议"观望"，趋势判断"高位震荡"
    - ...
    整体来看，市场情绪从积极转为谨慎，但仍维持偏多判断。
```

### 场景3：持仓智能诊股
```
用户：帮我看看我持仓的股票最近分析怎么看？
AI：【调用 get_my_portfolio_analysis】
    您持仓的2只股票最新分析如下：
    1. 贵州茅台 - 最新分析(1月20日)：情绪分68，建议观望，摘要"...
    2. 宁德时代 - 最新分析(1月19日)：情绪分55，建议观望，摘要"...
```

---

## 注意事项

1. **数据一致性**：持仓数据存储在本地SQLite，用户需要手动维护（或通过API导入）
2. **性能考虑**：get_my_portfolio 会调用实时行情API，持仓过多时可能较慢
3. **错误处理**：所有工具都应处理异常并返回友好的错误信息
4. **隐私安全**：持仓数据属于敏感信息，确保API有适当的访问控制（如有需要）
