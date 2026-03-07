# -*- coding: utf-8 -*-
"""
===================================
持仓数据访问层（多用户预留版本）
===================================

职责：
1. 封装持仓数据的数据库操作
2. 提供用户隔离的CRUD接口
3. 当前默认使用 default_user，未来支持真实用户ID

使用方式：
    repo = PortfolioRepository()
    # 查询当前用户持仓（默认 default_user）
    positions = repo.get_all_positions()
    # 未来支持：positions = repo.get_all_positions(user_id="user_uuid")
"""

import logging
from datetime import date
from typing import Optional, List, Dict, Any

from sqlalchemy import and_, desc, distinct, func

from src.storage import DatabaseManager, PortfolioPosition

logger = logging.getLogger(__name__)

# 默认用户ID（单用户模式使用，未来多用户模式传入真实用户ID）
DEFAULT_USER_ID = "default_user"


class PortfolioRepository:
    """
    持仓数据访问层

    所有查询方法都支持 user_id 参数，当前默认使用 "default_user"
    未来启用多用户时，只需传入真实用户ID即可
    """

    def __init__(self, db_manager: Optional[DatabaseManager] = None):
        """
        初始化数据访问层

        Args:
            db_manager: 数据库管理器（可选，默认使用单例）
        """
        self.db = db_manager or DatabaseManager.get_instance()

    # ========== 查询方法 ==========

    def get_all_positions(
        self,
        user_id: str = DEFAULT_USER_ID,
        group_name: Optional[str] = None
    ) -> List[PortfolioPosition]:
        """
        获取指定用户的所有持仓

        Args:
            user_id: 用户ID，默认 default_user
            group_name: 分组名称筛选（可选）

        Returns:
            PortfolioPosition 对象列表
        """
        try:
            with self.db.get_session() as session:
                query = session.query(PortfolioPosition).filter(
                    PortfolioPosition.user_id == user_id,
                    PortfolioPosition.is_active == True
                )
                if group_name:
                    query = query.filter(PortfolioPosition.group_name == group_name)
                return query.order_by(desc(PortfolioPosition.updated_at)).all()
        except Exception as e:
            logger.error(f"获取持仓列表失败: {e}")
            return []

    def get_position(
        self,
        code: str,
        user_id: str = DEFAULT_USER_ID,
        group_name: str = '默认分组'
    ) -> Optional[PortfolioPosition]:
        """
        获取指定用户的某只股票持仓

        Args:
            code: 股票代码
            user_id: 用户ID，默认 default_user
            group_name: 分组名称

        Returns:
            PortfolioPosition 对象，不存在返回 None
        """
        try:
            with self.db.get_session() as session:
                return session.query(PortfolioPosition).filter(
                    and_(
                        PortfolioPosition.user_id == user_id,
                        PortfolioPosition.code == code,
                        PortfolioPosition.group_name == group_name,
                        PortfolioPosition.is_active == True
                    )
                ).first()
        except Exception as e:
            logger.error(f"获取持仓详情失败: {e}")
            return None

    def get_position_by_id(
        self,
        position_id: int,
        user_id: str = DEFAULT_USER_ID
    ) -> Optional[PortfolioPosition]:
        """
        根据ID获取持仓

        Args:
            position_id: 持仓记录ID
            user_id: 用户ID，默认 default_user

        Returns:
            PortfolioPosition 对象，不存在返回 None
        """
        try:
            with self.db.get_session() as session:
                return session.query(PortfolioPosition).filter(
                    and_(
                        PortfolioPosition.id == position_id,
                        PortfolioPosition.user_id == user_id
                    )
                ).first()
        except Exception as e:
            logger.error(f"根据ID获取持仓失败: {e}")
            return None

    # ========== 增删改方法 ==========

    def save_position(
        self,
        code: str,
        name: str,
        quantity: float,
        cost_price: float,
        user_id: str = DEFAULT_USER_ID,
        group_name: str = '默认分组',
        remark: Optional[str] = None
    ) -> Optional[PortfolioPosition]:
        """
        保存或更新持仓

        如果同一用户同一股票同一分组已存在记录，则更新；否则创建新记录

        Args:
            code: 股票代码
            name: 股票名称
            quantity: 持仓数量
            cost_price: 成本价
            user_id: 用户ID，默认 default_user
            group_name: 分组名称
            remark: 备注

        Returns:
            保存后的 PortfolioPosition 对象，失败返回 None
        """
        try:
            with self.db.get_session() as session:
                # 检查是否已存在
                existing = session.query(PortfolioPosition).filter(
                    and_(
                        PortfolioPosition.user_id == user_id,
                        PortfolioPosition.code == code,
                        PortfolioPosition.group_name == group_name
                    )
                ).first()

                if existing:
                    # 更新现有记录
                    existing.quantity = quantity
                    existing.cost_price = cost_price
                    existing.name = name
                    existing.remark = remark
                    existing.is_active = True
                    session.commit()
                    session.refresh(existing)
                    logger.info(f"更新持仓: {user_id}/{code}/{group_name}")
                    return existing
                else:
                    # 创建新记录
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
                    logger.info(f"创建持仓: {user_id}/{code}/{group_name}")
                    return position
        except Exception as e:
            logger.error(f"保存持仓失败: {e}")
            return None

    def update_position(
        self,
        code: str,
        user_id: str = DEFAULT_USER_ID,
        group_name: str = '默认分组',
        **kwargs
    ) -> Optional[PortfolioPosition]:
        """
        更新持仓字段

        Args:
            code: 股票代码
            user_id: 用户ID，默认 default_user
            group_name: 分组名称
            **kwargs: 要更新的字段（quantity, cost_price, name, remark, is_active, principal_amount等）

        Returns:
            更新后的 PortfolioPosition 对象，失败返回 None
        """
        try:
            with self.db.get_session() as session:
                position = session.query(PortfolioPosition).filter(
                    and_(
                        PortfolioPosition.user_id == user_id,
                        PortfolioPosition.code == code,
                        PortfolioPosition.group_name == group_name
                    )
                ).first()

                if not position:
                    logger.warning(f"持仓不存在: {user_id}/{code}/{group_name}")
                    return None

                # 更新允许的字段
                allowed_fields = ['quantity', 'cost_price', 'name', 'remark', 'is_active', 'group_name', 'principal_amount']
                for key, value in kwargs.items():
                    if key in allowed_fields and hasattr(position, key):
                        setattr(position, key, value)

                session.commit()
                session.refresh(position)
                logger.info(f"更新持仓: {user_id}/{code}/{group_name}")
                return position
        except Exception as e:
            logger.error(f"更新持仓失败: {e}")
            return None

    def close_position(
        self,
        code: str,
        user_id: str = DEFAULT_USER_ID,
        group_name: str = '默认分组'
    ) -> bool:
        """
        平仓（标记为is_active=False）

        Args:
            code: 股票代码
            user_id: 用户ID，默认 default_user
            group_name: 分组名称

        Returns:
            操作是否成功
        """
        try:
            with self.db.get_session() as session:
                position = session.query(PortfolioPosition).filter(
                    and_(
                        PortfolioPosition.user_id == user_id,
                        PortfolioPosition.code == code,
                        PortfolioPosition.group_name == group_name
                    )
                ).first()

                if not position:
                    return False

                position.is_active = False
                session.commit()
                logger.info(f"平仓: {user_id}/{code}/{group_name}")
                return True
        except Exception as e:
            logger.error(f"平仓失败: {e}")
            return False

    def delete_position(
        self,
        code: str,
        user_id: str = DEFAULT_USER_ID,
        group_name: str = '默认分组'
    ) -> bool:
        """
        彻底删除持仓记录

        Args:
            code: 股票代码
            user_id: 用户ID，默认 default_user
            group_name: 分组名称

        Returns:
            操作是否成功
        """
        try:
            with self.db.get_session() as session:
                result = session.query(PortfolioPosition).filter(
                    and_(
                        PortfolioPosition.user_id == user_id,
                        PortfolioPosition.code == code,
                        PortfolioPosition.group_name == group_name
                    )
                ).delete()
                session.commit()

                if result > 0:
                    logger.info(f"删除持仓: {user_id}/{code}/{group_name}")
                    return True
                return False
        except Exception as e:
            logger.error(f"删除持仓失败: {e}")
            return False

    # ========== 统计与汇总方法 ==========

    def get_groups(self, user_id: str = DEFAULT_USER_ID) -> List[str]:
        """
        获取用户的所有分组名称

        Args:
            user_id: 用户ID，默认 default_user

        Returns:
            分组名称列表
        """
        try:
            with self.db.get_session() as session:
                groups = session.query(distinct(PortfolioPosition.group_name)).filter(
                    PortfolioPosition.user_id == user_id
                ).all()
                return [g[0] for g in groups if g[0]]
        except Exception as e:
            logger.error(f"获取分组列表失败: {e}")
            return []

    def get_portfolio_summary(self, user_id: str = DEFAULT_USER_ID) -> Dict[str, Any]:
        """
        获取持仓汇总统计

        Args:
            user_id: 用户ID，默认 default_user

        Returns:
            汇总统计字典
        """
        try:
            with self.db.get_session() as session:
                positions = session.query(PortfolioPosition).filter(
                    and_(
                        PortfolioPosition.user_id == user_id,
                        PortfolioPosition.is_active == True
                    )
                ).all()

                total_cost = sum(p.quantity * p.cost_price for p in positions)
                total_quantity = sum(p.quantity for p in positions)

                return {
                    'total_positions': len(positions),
                    'total_cost_value': round(total_cost, 2),
                    'total_quantity': round(total_quantity, 2),
                    'groups': self.get_groups(user_id),
                    'codes': [p.code for p in positions]
                }
        except Exception as e:
            logger.error(f"获取持仓汇总失败: {e}")
            return {
                'total_positions': 0,
                'total_cost_value': 0,
                'total_quantity': 0,
                'groups': [],
                'codes': []
            }

    def get_codes_in_portfolio(self, user_id: str = DEFAULT_USER_ID) -> List[str]:
        """
        获取用户持仓中的所有股票代码

        Args:
            user_id: 用户ID，默认 default_user

        Returns:
            股票代码列表
        """
        try:
            with self.db.get_session() as session:
                codes = session.query(distinct(PortfolioPosition.code)).filter(
                    and_(
                        PortfolioPosition.user_id == user_id,
                        PortfolioPosition.is_active == True
                    )
                ).all()
                return [c[0] for c in codes if c[0]]
        except Exception as e:
            logger.error(f"获取持仓代码列表失败: {e}")
            return []

    # ========== 未来多用户模式预留方法（当前不使用） ==========

    def get_all_positions_admin(
        self,
        target_user_id: Optional[str] = None,
        group_name: Optional[str] = None
    ) -> List[PortfolioPosition]:
        """
        【管理员方法】获取所有用户或指定用户的持仓

        注意：此方法应在API层进行管理员权限检查后调用
        当前单用户模式不使用此方法

        Args:
            target_user_id: 目标用户ID（None表示所有用户）
            group_name: 分组名称筛选

        Returns:
            PortfolioPosition 对象列表
        """
        try:
            with self.db.get_session() as session:
                query = session.query(PortfolioPosition)

                if target_user_id:
                    query = query.filter(PortfolioPosition.user_id == target_user_id)
                if group_name:
                    query = query.filter(PortfolioPosition.group_name == group_name)

                return query.order_by(desc(PortfolioPosition.updated_at)).all()
        except Exception as e:
            logger.error(f"管理员获取持仓列表失败: {e}")
            return []

    def get_portfolio_stats_admin(self) -> Dict[str, Any]:
        """
        【管理员方法】获取全局持仓统计

        注意：当前单用户模式不使用此方法
        """
        try:
            with self.db.get_session() as session:
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
        except Exception as e:
            logger.error(f"获取全局统计失败: {e}")
            return {
                'total_positions': 0,
                'total_users_with_positions': 0,
                'total_cost_value': 0
            }
