# -*- coding: utf-8 -*-
"""
===================================
自选股管理服务层
===================================

职责：
1. 管理自选股的增删改查 (CRUD)
2. 处理元数据同步（如从 .env 迁移）
3. 提供股票搜索功能
"""

import json
import logging
from datetime import datetime
from typing import List, Optional, Dict, Any

from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from src.storage import DatabaseManager, StockInfo
from src.config import get_config

logger = logging.getLogger(__name__)


class StockManageService:
    """
    自选股管理服务
    """

    def __init__(self):
        self.db = DatabaseManager.get_instance()

    def sync_from_env(self) -> int:
        """
        从环境变量同步自选股列表到数据库
        
        仅当数据库为空或指定强制同步时执行。
        用于初始化或迁移。
        
        Returns:
            新增股票数量
        """
        config = get_config()
        env_stocks = config.stock_list
        if not env_stocks:
            return 0

        added_count = 0
        with self.db.get_session() as session:
            # 检查哪些股票已存在
            existing_codes = session.execute(
                select(StockInfo.code).where(StockInfo.code.in_(env_stocks))
            ).scalars().all()
            existing_set = set(existing_codes)

            for code in env_stocks:
                if code not in existing_set:
                    # 新增股票
                    new_stock = StockInfo(
                        code=code,
                        name=code,  # 暂时用代码作为名称，后续需同步
                        tags=json.dumps(["来自配置"]),
                        remark="从 .env 自动迁移",
                        is_active=True
                    )
                    session.add(new_stock)
                    added_count += 1
            
            if added_count > 0:
                try:
                    session.commit()
                    logger.info(f"已从环境配置同步 {added_count} 只股票到数据库")
                except Exception as e:
                    session.rollback()
                    logger.error(f"同步股票失败: {e}")
                    return 0
        
        return added_count

    def get_all_stocks(self, active_only: bool = False) -> List[Dict[str, Any]]:
        """
        获取所有自选股
        
        Args:
            active_only: 是否仅返回启用状态的股票
        """
        with self.db.get_session() as session:
            query = select(StockInfo).order_by(StockInfo.created_at)
            
            if active_only:
                query = query.where(StockInfo.is_active == True)
                
            results = session.execute(query).scalars().all()
            return [stock.to_dict() for stock in results]

    def add_stock(self, code: str, name: Optional[str] = None, tags: List[str] = None, remark: str = "", fetch_info: bool = True) -> Dict[str, Any]:
        """
        添加自选股
        
        Args:
            fetch_info: 是否立即获取股票名称等信息
        """
        code = code.strip()
        if not code:
            raise ValueError("股票代码不能为空")

        with self.db.get_session() as session:
            # 检查是否存在
            existing = session.get(StockInfo, code)
            if existing:
                # 如果已存在但未启用，则重新启用
                if not existing.is_active:
                    existing.is_active = True
                    existing.updated_at = datetime.now()
                    session.commit()
                    return existing.to_dict()
                raise ValueError(f"股票 {code} 已存在")

            # 尝试自动获取名称（如果未提供且要求获取）
            if not name:
                if fetch_info:
                    try:
                        from src.services.stock_service import StockService as DataService
                        data_service = DataService()
                        # 尝试从实时行情获取名称
                        quote = data_service.get_realtime_quote(code)
                        if quote and quote.get("stock_name"):
                            name = quote.get("stock_name")
                        else:
                            name = code # Fallback
                    except Exception as e:
                        logger.warning(f"获取股票 {code} 名称失败: {e}")
                        name = code
                else:
                    # 不获取信息，直接使用代码作为临时名称
                    name = code

            new_stock = StockInfo(
                code=code,
                name=name,
                tags=json.dumps(tags or []),
                remark=remark,
                is_active=True,
                created_at=datetime.now(),
                updated_at=datetime.now()
            )
            session.add(new_stock)
            session.commit()
            return new_stock.to_dict()

    def fetch_and_update_info(self, code: str) -> Optional[str]:
        """
        后台获取并更新股票信息
        Returns:
            fetched_name (str): 获取到的名称，如果失败则为 None
        """
        logger.info(f"[Async] 开始后台获取股票信息: {code}")
        try:
            from src.services.stock_service import StockService as DataService
            data_service = DataService()
            
            # 尝试从实时行情获取名称
            quote = data_service.get_realtime_quote(code)
            
            if quote and quote.get("stock_name"):
                name = quote.get("stock_name")
                # 构建更新参数，包含行业和地区信息
                update_kwargs = {"name": name}
                
                # 提取行业信息（如果有）
                industry = quote.get("industry")
                if industry:
                    update_kwargs["industry"] = industry
                
                # 提取地区信息（如果有）
                area = quote.get("area")
                if area:
                    update_kwargs["area"] = area
                
                # 如果实时行情未提供行业/地区，尝试 fallback 获取
                if not industry or not area:
                    fallback_info = self._fetch_stock_info_fallback(code)
                    if fallback_info:
                        if not industry and fallback_info.get("industry"):
                            update_kwargs["industry"] = fallback_info["industry"]
                        if not area and fallback_info.get("area"):
                            update_kwargs["area"] = fallback_info["area"]
                
                # 更新数据库
                self.update_stock(code, **update_kwargs)
                logger.info(f"[Async] 股票 {code} 信息更新成功: {name}, "
                           f"行业={update_kwargs.get('industry')}, 地区={update_kwargs.get('area')}")
                return name
            else:
                logger.warning(f"[Async] 股票 {code} 未能获取到名称")
                return None
                
        except Exception as e:
            logger.error(f"[Async] 后台更新股票 {code} 信息失败: {e}")
            return None

    def _fetch_stock_info_fallback(self, code: str) -> Optional[Dict[str, str]]:
        """
        通过 akshare 个股信息接口获取行业/地区等元数据（A 股专用）
        
        Returns:
            包含 industry/area 的字典，或 None
        """
        import re
        # 仅对 A 股有效（6位纯数字代码）
        if not re.match(r'^\d{6}$', code):
            logger.debug(f"[Fallback] {code} 不是 A 股代码，跳过个股信息获取")
            return None
        
        try:
            import akshare as ak
            logger.info(f"[Fallback] 尝试 ak.stock_individual_info_em({code}) 获取个股信息...")
            df = ak.stock_individual_info_em(symbol=code)
            
            if df is None or df.empty:
                logger.debug(f"[Fallback] ak.stock_individual_info_em 返回空数据")
                return None
            
            # stock_individual_info_em 返回 item/value 两列
            info = {}
            for _, row in df.iterrows():
                item = str(row.get("item", "")).strip()
                value = str(row.get("value", "")).strip()
                if item == "行业":
                    info["industry"] = value
                elif item == "地区":
                    info["area"] = value
            
            if info:
                logger.info(f"[Fallback] {code} 个股信息获取成功: {info}")
            return info if info else None
            
        except Exception as e:
            logger.warning(f"[Fallback] 获取 {code} 个股信息失败: {e}")
            return None

    def update_stock(self, code: str, **kwargs) -> Optional[Dict[str, Any]]:
        """
        更新股票信息
        """
        allowed_fields = {'name', 'industry', 'area', 'remark', 'is_active'}
        
        with self.db.get_session() as session:
            stock = session.get(StockInfo, code)
            if not stock:
                return None
            
            updated = False
            for key, value in kwargs.items():
                if key in allowed_fields:
                    setattr(stock, key, value)
                    updated = True
                elif key == 'tags':
                    # 特殊处理 tags 序列化
                    if isinstance(value, list):
                        stock.tags = json.dumps(value)
                        updated = True
            
            if updated:
                stock.updated_at = datetime.now()
                session.commit()
            
            return stock.to_dict()

    def delete_stock(self, code: str) -> bool:
        """
        删除自选股（物理删除）
        """
        with self.db.get_session() as session:
            stock = session.get(StockInfo, code)
            if stock:
                session.delete(stock)
                session.commit()
                return True
            return False

    def search_stocks(self, query: str) -> List[Dict[str, Any]]:
        """
        搜索股票（支持代码或名称模糊匹配）
        """
        if not query:
            return []
            
        search_term = f"%{query}%"
        with self.db.get_session() as session:
            results = session.execute(
                select(StockInfo).where(
                    or_(
                        StockInfo.code.like(search_term),
                        StockInfo.name.like(search_term)
                    )
                ).limit(20)
            ).scalars().all()
            
            return [stock.to_dict() for stock in results]
