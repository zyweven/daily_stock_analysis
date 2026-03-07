# -*- coding: utf-8 -*-
"""
===================================
用户配置服务（本金管理）
===================================

职责：
1. 管理用户全局配置（如总本金）
2. 当前为单用户模式，使用默认用户ID
"""

import logging
from typing import Optional
from src.config import get_config

logger = logging.getLogger(__name__)

# 默认用户ID
DEFAULT_USER_ID = "default_user"

# 配置键名
CONFIG_KEY_TOTAL_PRINCIPAL = "total_principal"


class UserConfigService:
    """
    用户配置服务

    使用系统配置表存储用户配置
    当前为单用户模式，所有配置使用默认用户ID
    """

    def __init__(self):
        from src.storage import DatabaseManager
        self.db = DatabaseManager.get_instance()

    def get_total_principal(self) -> Optional[float]:
        """
        获取总本金

        Returns:
            总本金金额，未设置返回 None
        """
        try:
            from src.storage import SystemConfig

            with self.db.get_session() as session:
                config = session.query(SystemConfig).filter(
                    SystemConfig.key == CONFIG_KEY_TOTAL_PRINCIPAL
                ).first()

                if config and config.value:
                    try:
                        return float(config.value)
                    except (ValueError, TypeError):
                        return None
                return None
        except Exception as e:
            logger.error(f"获取总本金失败: {e}")
            return None

    def set_total_principal(self, amount: float) -> bool:
        """
        设置总本金

        Args:
            amount: 总本金金额

        Returns:
            是否设置成功
        """
        try:
            from src.storage import SystemConfig

            with self.db.get_session() as session:
                config = session.query(SystemConfig).filter(
                    SystemConfig.key == CONFIG_KEY_TOTAL_PRINCIPAL
                ).first()

                if config:
                    config.value = str(amount)
                else:
                    config = SystemConfig(
                        key=CONFIG_KEY_TOTAL_PRINCIPAL,
                        value=str(amount),
                        description='总本金（用于炒股的总资金）'
                    )
                    session.add(config)

                session.commit()
                logger.info(f"设置总本金: {amount}")
                return True
        except Exception as e:
            logger.error(f"设置总本金失败: {e}")
            return False

    def get_user_config(self) -> dict:
        """
        获取所有用户配置

        Returns:
            用户配置字典
        """
        total_principal = self.get_total_principal()

        return {
            'total_principal': total_principal,
        }

    def update_user_config(self, total_principal: Optional[float] = None) -> bool:
        """
        更新用户配置

        Args:
            total_principal: 总本金（可选）

        Returns:
            是否更新成功
        """
        if total_principal is not None:
            if not self.set_total_principal(total_principal):
                return False

        return True
