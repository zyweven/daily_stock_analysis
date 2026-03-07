# -*- coding: utf-8 -*-
"""
===================================
分析历史数据访问层（多用户预留版本）
===================================

职责：
1. 封装分析历史数据的数据库操作
2. 提供用户隔离的CRUD接口
3. 支持复杂查询（时间范围、操作建议、情绪分等）

使用方式：
    repo = AnalysisRepository()
    # 查询历史分析（默认 default_user）
    history = repo.get_analysis_history_detail(code='600519', days=30)
    # 未来支持：history = repo.get_analysis_history_detail(code='600519', user_id='user_uuid')
"""

import logging
from datetime import datetime, timedelta, date
from typing import Optional, List, Dict, Any

from sqlalchemy import and_, or_, desc, distinct, func

from src.storage import DatabaseManager, AnalysisHistory

logger = logging.getLogger(__name__)

# 默认用户ID（单用户模式使用，未来多用户模式传入真实用户ID）
DEFAULT_USER_ID = "default_user"


class AnalysisRepository:
    """
    分析历史数据访问层
    
    封装 AnalysisHistory 表的数据库操作
    """
    
    def __init__(self, db_manager: Optional[DatabaseManager] = None):
        """
        初始化数据访问层
        
        Args:
            db_manager: 数据库管理器（可选，默认使用单例）
        """
        self.db = db_manager or DatabaseManager.get_instance()
    
    def get_by_query_id(self, query_id: str) -> Optional[AnalysisHistory]:
        """
        根据 query_id 获取分析记录
        
        Args:
            query_id: 查询 ID
            
        Returns:
            AnalysisHistory 对象，不存在返回 None
        """
        try:
            records = self.db.get_analysis_history(query_id=query_id, limit=1)
            return records[0] if records else None
        except Exception as e:
            logger.error(f"查询分析记录失败: {e}")
            return None
    
    def get_list(
        self,
        code: Optional[str] = None,
        days: int = 30,
        limit: int = 50
    ) -> List[AnalysisHistory]:
        """
        获取分析记录列表
        
        Args:
            code: 股票代码筛选
            days: 时间范围（天）
            limit: 返回数量限制
            
        Returns:
            AnalysisHistory 对象列表
        """
        try:
            return self.db.get_analysis_history(
                code=code,
                days=days,
                limit=limit
            )
        except Exception as e:
            logger.error(f"获取分析列表失败: {e}")
            return []
    
    def save(
        self,
        result: Any,
        query_id: str,
        report_type: str,
        news_content: Optional[str] = None,
        context_snapshot: Optional[Dict[str, Any]] = None
    ) -> int:
        """
        保存分析结果
        
        Args:
            result: 分析结果对象
            query_id: 查询 ID
            report_type: 报告类型
            news_content: 新闻内容
            context_snapshot: 上下文快照
            
        Returns:
            保存的记录数
        """
        try:
            return self.db.save_analysis_history(
                result=result,
                query_id=query_id,
                report_type=report_type,
                news_content=news_content,
                context_snapshot=context_snapshot
            )
        except Exception as e:
            logger.error(f"保存分析结果失败: {e}")
            return 0
    
    def count_by_code(self, code: str, days: int = 30) -> int:
        """
        统计指定股票的分析记录数

        Args:
            code: 股票代码
            days: 时间范围（天）

        Returns:
            记录数量
        """
        try:
            records = self.db.get_analysis_history(code=code, days=days, limit=1000)
            return len(records)
        except Exception as e:
            logger.error(f"统计分析记录失败: {e}")
            return 0

    # ========== 增强查询方法（支持用户隔离） ==========

    def get_analysis_history_detail(
        self,
        code: str,
        user_id: str = DEFAULT_USER_ID,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        operation_advice: Optional[str] = None,
        min_score: Optional[int] = None,
        max_score: Optional[int] = None,
        keyword: Optional[str] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        获取详细的历史分析记录，支持多种筛选条件

        用于AI工具查询历史分析内容

        Args:
            code: 股票代码
            user_id: 用户ID，默认 default_user
            start_date: 开始日期（可选）
            end_date: 结束日期（可选）
            operation_advice: 按操作建议筛选（买入/卖出/观望）
            min_score: 最低情绪分
            max_score: 最高情绪分
            keyword: 关键词搜索（在analysis_summary中搜索）
            limit: 返回数量限制

        Returns:
            分析记录字典列表
        """
        try:
            with self.db.get_session() as session:
                query = session.query(AnalysisHistory).filter(
                    AnalysisHistory.code == code,
                    AnalysisHistory.user_id == user_id
                )

                # 日期范围筛选
                if start_date:
                    query = query.filter(
                        AnalysisHistory.created_at >= datetime.combine(start_date, datetime.min.time())
                    )
                if end_date:
                    query = query.filter(
                        AnalysisHistory.created_at <= datetime.combine(end_date, datetime.max.time())
                    )

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

        except Exception as e:
            logger.error(f"获取详细分析历史失败: {e}")
            return []

    def get_analysis_trend(
        self,
        code: str,
        user_id: str = DEFAULT_USER_ID,
        days: int = 30
    ) -> List[Dict[str, Any]]:
        """
        获取某只股票的情绪分趋势变化

        用于展示AI分析的连贯性和变化

        Args:
            code: 股票代码
            user_id: 用户ID，默认 default_user
            days: 查询天数

        Returns:
            情绪分趋势数据列表
        """
        try:
            start_time = datetime.now() - timedelta(days=days)

            with self.db.get_session() as session:
                records = session.query(AnalysisHistory).filter(
                    and_(
                        AnalysisHistory.code == code,
                        AnalysisHistory.user_id == user_id,
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
        except Exception as e:
            logger.error(f"获取分析趋势失败: {e}")
            return []

    def get_analysis_comparison(
        self,
        codes: List[str],
        user_id: str = DEFAULT_USER_ID,
        days: int = 7
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        获取多只股票的分析对比

        用于持仓组合的整体分析

        Args:
            codes: 股票代码列表
            user_id: 用户ID，默认 default_user
            days: 查询最近多少天的分析

        Returns:
            以股票代码为键的分析记录字典
        """
        try:
            start_time = datetime.now() - timedelta(days=days)
            result = {}

            with self.db.get_session() as session:
                for code in codes:
                    records = session.query(AnalysisHistory).filter(
                        and_(
                            AnalysisHistory.code == code,
                            AnalysisHistory.user_id == user_id,
                            AnalysisHistory.created_at >= start_time
                        )
                    ).order_by(desc(AnalysisHistory.created_at)).limit(1).all()

                    result[code] = [r.to_dict() for r in records]

            return result
        except Exception as e:
            logger.error(f"获取分析对比失败: {e}")
            return {code: [] for code in codes}

    def get_latest_analysis(
        self,
        code: str,
        user_id: str = DEFAULT_USER_ID
    ) -> Optional[Dict[str, Any]]:
        """
        获取某只股票最新的分析记录

        Args:
            code: 股票代码
            user_id: 用户ID，默认 default_user

        Returns:
            最新的分析记录字典，不存在返回 None
        """
        try:
            with self.db.get_session() as session:
                record = session.query(AnalysisHistory).filter(
                    and_(
                        AnalysisHistory.code == code,
                        AnalysisHistory.user_id == user_id
                    )
                ).order_by(desc(AnalysisHistory.created_at)).first()

                return record.to_dict() if record else None
        except Exception as e:
            logger.error(f"获取最新分析失败: {e}")
            return None

    def count_analysis_by_advice(
        self,
        code: str,
        user_id: str = DEFAULT_USER_ID,
        days: int = 30
    ) -> Dict[str, int]:
        """
        统计某只股票不同操作建议的出现次数

        Args:
            code: 股票代码
            user_id: 用户ID，默认 default_user
            days: 时间范围（天）

        Returns:
            操作建议 -> 次数 的字典
        """
        try:
            start_time = datetime.now() - timedelta(days=days)

            with self.db.get_session() as session:
                results = session.query(
                    AnalysisHistory.operation_advice,
                    func.count(AnalysisHistory.id).label('count')
                ).filter(
                    and_(
                        AnalysisHistory.code == code,
                        AnalysisHistory.user_id == user_id,
                        AnalysisHistory.created_at >= start_time
                    )
                ).group_by(AnalysisHistory.operation_advice).all()

                return {r.operation_advice or '未知': r.count for r in results}
        except Exception as e:
            logger.error(f"统计操作建议分布失败: {e}")
            return {}

    def search_analysis_by_keyword(
        self,
        keyword: str,
        user_id: str = DEFAULT_USER_ID,
        codes: Optional[List[str]] = None,
        days: int = 90,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """
        按关键词搜索分析历史

        Args:
            keyword: 搜索关键词
            user_id: 用户ID，默认 default_user
            codes: 限定股票代码列表（可选）
            days: 时间范围（天）
            limit: 返回数量限制

        Returns:
            匹配的分析记录列表
        """
        try:
            start_time = datetime.now() - timedelta(days=days)

            with self.db.get_session() as session:
                query = session.query(AnalysisHistory).filter(
                    and_(
                        AnalysisHistory.user_id == user_id,
                        AnalysisHistory.created_at >= start_time,
                        or_(
                            AnalysisHistory.analysis_summary.contains(keyword),
                            AnalysisHistory.trend_prediction.contains(keyword),
                            AnalysisHistory.risk_warning.contains(keyword) if hasattr(AnalysisHistory, 'risk_warning') else False
                        )
                    )
                )

                if codes:
                    query = query.filter(AnalysisHistory.code.in_(codes))

                records = query.order_by(desc(AnalysisHistory.created_at)).limit(limit).all()
                return [r.to_dict() for r in records]
        except Exception as e:
            logger.error(f"搜索分析历史失败: {e}")
            return []
