# -*- coding: utf-8 -*-
"""
===================================
AI Chat Assistant - Investment Research Tools
===================================

Defines AI-callable research tools using @tool decorator.
Tools are auto-registered to ToolRegistry.

Usage:
    Tools are automatically registered when this module is imported.
    Use ToolRegistry.execute(tool_name, args) to execute any tool.
"""

import json
import logging
from datetime import date, timedelta
from typing import Any, Dict

from src.services.tool_decorator import tool

logger = logging.getLogger(__name__)


@tool()
def get_realtime_quote(stock_code: str) -> str:
    """
    Get real-time market quote data including latest price, change percentage,
    volume, turnover rate, PE ratio, and market cap for a financial instrument.
    Call this tool when user asks about current price, market performance,
    or real-time quotes of a specific stock, ETF, or other tradable asset.

    Args:
        stock_code: Asset symbol, e.g., A-share: 601318, 600519; HK: 01810, 00700; US: AAPL, TSLA
    """
    from src.services.stock_service import StockService
    svc = StockService()
    quote = svc.get_realtime_quote(stock_code)
    if quote:
        return json.dumps(quote, ensure_ascii=False)
    return json.dumps({"error": f"Failed to get real-time quote for {stock_code}"}, ensure_ascii=False)


@tool()
def get_technical_summary(stock_code: str) -> str:
    """
    Get technical analysis summary including K-line trends,
    moving averages (MA5/MA10/MA20), MACD signals, and volume trends
    for a financial instrument.
    Call this tool when user asks about technical analysis, price trends,
    moving averages, MACD, KDJ, or other technical indicators for stocks or ETFs.

    Args:
        stock_code: Asset symbol, e.g., A-share: 601318, 600519; HK: 01810, 00700; US: AAPL, TSLA
    """
    from src.storage import DatabaseManager
    db = DatabaseManager()

    try:
        context = db.get_analysis_context(stock_code)
        if not context:
            return json.dumps({"error": f"No historical data found for {stock_code}"}, ensure_ascii=False)

        # Extract key technical indicators
        summary = {
            "stock_code": stock_code,
            "data_days": len(context.get("daily_data", [])),
        }

        # Extract recent trends from daily data
        daily = context.get("daily_data", [])
        if daily and len(daily) >= 5:
            recent = daily[-5:]
            summary["recent_5d"] = [
                {"date": str(d.get("date", "")), "close": d.get("close"), "pct_chg": d.get("pct_chg")}
                for d in recent
            ]

            # Latest moving averages
            latest = daily[-1]
            summary["latest"] = {
                "date": str(latest.get("date", "")),
                "close": latest.get("close"),
                "ma5": latest.get("ma5"),
                "ma10": latest.get("ma10"),
                "ma20": latest.get("ma20"),
                "volume_ratio": latest.get("volume_ratio"),
            }

            # Simple trend judgment
            if len(daily) >= 20:
                ma5 = latest.get("ma5")
                ma10 = latest.get("ma10")
                ma20 = latest.get("ma20")
                close = latest.get("close")
                if ma5 and ma10 and ma20 and close:
                    if close > ma5 > ma10 > ma20:
                        summary["trend"] = "Bullish arrangement (strong uptrend)"
                    elif close < ma5 < ma10 < ma20:
                        summary["trend"] = "Bearish arrangement (weak downtrend)"
                    else:
                        summary["trend"] = "Consolidation"

        # Real-time quote supplement
        realtime = context.get("realtime", {})
        if realtime:
            summary["realtime"] = {
                "price": realtime.get("price"),
                "change_pct": realtime.get("change_pct"),
                "volume_ratio": realtime.get("volume_ratio"),
                "turnover_rate": realtime.get("turnover_rate"),
            }

        return json.dumps(summary, ensure_ascii=False, default=str)
    except Exception as e:
        logger.error(f"[Technical Summary] Failed to get data for {stock_code}: {e}")
        return json.dumps({"error": f"Failed to get technical data: {str(e)}"}, ensure_ascii=False)


@tool()
def get_latest_report(stock_code: str) -> str:
    """
    Get the most recent AI analysis report summary for a financial instrument,
    including trend judgment, operation advice, risk warnings, and sentiment score.
    Call this tool when user asks about previous analysis results,
    historical reports, or wants to review past analysis conclusions.

    Args:
        stock_code: Asset symbol, e.g., 601318, AAPL
    """
    from src.storage import DatabaseManager
    db = DatabaseManager()

    try:
        # Get most recent analysis history
        history = db.get_analysis_history(stock_code, limit=1)
        if not history:
            return json.dumps({"error": f"No historical analysis report found for {stock_code}"}, ensure_ascii=False)

        latest = history[0]
        report = {
            "stock_code": stock_code,
            "analysis_date": str(latest.get("analysis_date", "")),
            "model_name": latest.get("model_name", ""),
            "sentiment_score": latest.get("sentiment_score"),
            "trend_prediction": latest.get("trend_prediction", ""),
            "operation_advice": latest.get("operation_advice", ""),
            "confidence_level": latest.get("confidence_level", ""),
            "analysis_summary": latest.get("analysis_summary", ""),
            "risk_warning": latest.get("risk_warning", ""),
        }

        return json.dumps(report, ensure_ascii=False, default=str)
    except Exception as e:
        logger.error(f"[Historical Report] Failed to get report for {stock_code}: {e}")
        return json.dumps({"error": f"Failed to get analysis report: {str(e)}"}, ensure_ascii=False)


@tool(
    config_schema={
        "provider": {
            "type": "select",
            "label": "搜索服务提供商",
            "description": "选择用于搜索新闻的 API 提供商",
            "options": [
                {"value": "auto", "label": "自动选择 (推荐)"},
                {"value": "tavily", "label": "Tavily"},
                {"value": "serpapi", "label": "SerpAPI"},
                {"value": "bocha", "label": "博查 (Bocha)"}
            ],
            "default": "auto"
        },
        "max_results": {
            "type": "number",
            "label": "最大结果数",
            "description": "每次搜索返回的最大结果数量",
            "min": 1,
            "max": 20,
            "default": 5
        },
        "days": {
            "type": "number",
            "label": "时间范围 (天)",
            "description": "搜索最近多少天内的新闻",
            "min": 1,
            "max": 90,
            "default": 7
        }
    }
)
def search_news(query: str, _tool_config: dict = None) -> str:
    """
    Perform a web search to find the latest news, articles, and information on any topic.
    Use this tool when the user asks about current events, recent developments,
    news articles, or any topic requiring up-to-date information from the internet.

    Args:
        query: Search query, e.g., 'latest AI developments', 'renewable energy trends', or 'company product announcements'
        _tool_config: Tool configuration (injected by ToolRegistry.execute)
    """
    # Get configuration values with defaults
    config = _tool_config or {}
    provider_preference = config.get("provider", "auto")
    max_results = config.get("max_results", 5)
    days = config.get("days", 7)

    try:
        from src.search_service import get_search_service
        search_svc = get_search_service()

        if not search_svc.is_available:
            return json.dumps(
                {"error": "No search engine API Key configured. Please set SERPAPI_KEY / TAVILY_KEY / BOCHA_KEY in environment variables."},
                ensure_ascii=False
            )

        # Filter providers based on preference
        providers = search_svc._providers
        if provider_preference and provider_preference != "auto":
            providers = [p for p in providers if p.name.lower() == provider_preference.lower()]
            if not providers:
                # Fallback to all providers if preferred is not available
                providers = search_svc._providers

        # Try each available search provider
        for provider in providers:
            if not provider.is_available:
                continue

            result = provider.search(query, max_results=max_results, days=days)

            if result.success and result.results:
                news_list = []
                for item in result.results[:max_results]:
                    news_list.append({
                        "title": item.title,
                        "snippet": item.snippet,
                        "url": item.url,
                        "source": item.source,
                        "published_date": item.published_date,
                    })
                return json.dumps({
                    "query": query,
                    "provider": result.provider,
                    "results": news_list
                }, ensure_ascii=False)
            else:
                logger.warning(f"[News Search] {provider.name} failed: {result.error_message}, trying next")

        return json.dumps({"query": query, "results": [], "message": "No results found from any search engine"}, ensure_ascii=False)
    except Exception as e:
        logger.warning(f"[News Search] Failed to search '{query}': {e}")
        return json.dumps({"error": f"News search failed: {str(e)}"}, ensure_ascii=False)


@tool()
def get_chip_distribution(stock_code: str) -> str:
    """
    Get chip distribution data including profit ratio, average cost,
    and concentration metrics.
    Call this tool when user asks about chip distribution, trapped positions,
    profit positions, or cost distribution. Only supports A-shares.

    Args:
        stock_code: A-share code, e.g., 601318
    """
    try:
        from data_provider.base import DataFetcherManager
        manager = DataFetcherManager()
        chip = manager.get_chip_distribution(stock_code)

        if chip:
            return json.dumps(chip.to_dict(), ensure_ascii=False, default=str)

        return json.dumps({"error": f"Failed to get chip distribution for {stock_code} (A-shares only)"}, ensure_ascii=False)
    except Exception as e:
        logger.warning(f"[Chip Distribution] Failed to get data for {stock_code}: {e}")
        return json.dumps({"error": f"Failed to get chip data: {str(e)}"}, ensure_ascii=False)


# ==========================================
# 持仓管理工具
# ==========================================

@tool()
def get_my_portfolio() -> str:
    """
    获取用户的持仓列表，包括股票代码、名称、持仓数量、成本价、仓位比例等信息。
    当用户询问"我持仓什么股票"、"我的持仓"、"我有哪些股票"时调用此工具。

    注意：当前为单用户模式，返回默认用户的持仓数据。
    """
    from src.repositories.portfolio_repo import PortfolioRepository
    from src.services.stock_service import StockService
    from src.services.user_config_service import UserConfigService

    try:
        repo = PortfolioRepository()
        stock_svc = StockService()
        config_svc = UserConfigService()

        # 获取全局本金
        total_principal = config_svc.get_total_principal()

        # 当前使用默认用户ID
        positions = repo.get_all_positions()

        if not positions:
            return json.dumps({
                "has_positions": False,
                "message": "当前没有持仓记录"
            }, ensure_ascii=False)

        # 获取实时行情计算盈亏
        portfolio_list = []
        for pos in positions:
            try:
                quote = stock_svc.get_realtime_quote(pos.code)
                current_price = quote.get('price') if quote else None
            except Exception:
                current_price = None

            position_data = {
                "code": pos.code,
                "name": pos.name,
                "quantity": pos.quantity,
                "cost_price": pos.cost_price,
                "cost_value": round(pos.quantity * pos.cost_price, 2),  # 投入成本
                "group": pos.group_name,
                "current_price": current_price,
            }

            # 计算盈亏和仓位
            if current_price:
                profit_data = pos.calculate_profit(current_price, total_principal)
                position_data.update(profit_data)

            portfolio_list.append(position_data)

        # 计算汇总
        total_cost = sum(p.quantity * p.cost_price for p in positions)
        total_market_value = sum(p['market_value'] for p in portfolio_list if p.get('market_value'))

        # 计算总仓位比例
        total_position_ratio = (total_cost / total_principal * 100) if total_principal and total_principal > 0 else None

        return json.dumps({
            "has_positions": True,
            "positions": portfolio_list,
            "summary": {
                "total_positions": len(positions),
                "total_cost": round(total_cost, 2),
                "total_market_value": round(total_market_value, 2) if total_market_value else None,
                "total_profit_loss": round(total_market_value - total_cost, 2) if total_market_value else None,
                "total_profit_loss_pct": round((total_market_value - total_cost) / total_cost * 100, 2) if total_cost and total_market_value else None,
                "total_principal": round(total_principal, 2) if total_principal else None,
                "total_position_ratio": round(total_position_ratio, 2) if total_position_ratio else None,
                "available_cash": round(total_principal - total_cost, 2) if total_principal and total_principal > total_cost else None,
                "groups": list(set(p.group_name for p in positions))
            }
        }, ensure_ascii=False, default=str)

    except Exception as e:
        logger.error(f"[Portfolio] 获取持仓失败: {e}")
        return json.dumps({"error": f"获取持仓失败: {str(e)}"}, ensure_ascii=False)


@tool()
def get_position_detail(stock_code: str) -> str:
    """
    获取指定股票的详细持仓信息，包括成本、数量、盈亏、仓位比例等。
    当用户询问"我的XX股票持仓多少"、"XX股票我成本多少"、"XX股票占我总资金多少"时调用此工具。

    Args:
        stock_code: 股票代码，如600519、AAPL
    """
    from src.repositories.portfolio_repo import PortfolioRepository
    from src.services.stock_service import StockService
    from src.services.user_config_service import UserConfigService

    try:
        repo = PortfolioRepository()
        stock_svc = StockService()
        config_svc = UserConfigService()

        # 获取全局本金
        total_principal = config_svc.get_total_principal()

        position = repo.get_position(code=stock_code)

        if not position:
            return json.dumps({
                "has_position": False,
                "code": stock_code,
                "message": f"未持有股票 {stock_code}"
            }, ensure_ascii=False)

        # 获取实时行情
        try:
            quote = stock_svc.get_realtime_quote(stock_code)
            current_price = quote.get('price') if quote else None
        except Exception:
            current_price = None

        result = {
            "has_position": True,
            "code": position.code,
            "name": position.name,
            "quantity": position.quantity,
            "cost_price": position.cost_price,
            "cost_value": round(position.quantity * position.cost_price, 2),  # 投入成本
            "current_price": current_price,
            "total_principal": round(total_principal, 2) if total_principal else None,
            "group": position.group_name,
            "remark": position.remark,
        }

        # 计算盈亏和仓位
        if current_price:
            profit_data = position.calculate_profit(current_price, total_principal)
            result.update(profit_data)

        return json.dumps(result, ensure_ascii=False, default=str)

    except Exception as e:
        logger.error(f"[Portfolio] 获取持仓详情失败: {e}")
        return json.dumps({"error": f"获取持仓详情失败: {str(e)}"}, ensure_ascii=False)


# ==========================================
# 历史分析查询工具
# ==========================================

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
                "analysis_summary": r.get("analysis_summary", "")[:200] + "..." if r.get("analysis_summary") and len(r.get("analysis_summary", "")) > 200 else r.get("analysis_summary"),
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

        # 获取持仓
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
                        "analysis_summary": latest.get("analysis_summary", "")[:150] + "..." if latest.get("analysis_summary") and len(latest.get("analysis_summary", "")) > 150 else latest.get("analysis_summary"),
                    }
                })
            else:
                results.append({
                    "code": code,
                    "name": position.name,
                    "quantity": position.quantity,
                    "cost_price": position.cost_price,
                    "latest_analysis": None,
                    "message": "最近7天暂无分析记录"
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


# Legacy support - for backward compatibility during migration
# These will be removed after all imports are updated

def _deprecated_chat_tools():
    """Deprecated: Use ToolRegistry.get_all_tools() instead."""
    from src.services.tool_registry import ToolRegistry
    return ToolRegistry.get_all_tools()


def _deprecated_execute_tool(tool_name: str, tool_args: Dict[str, Any]) -> str:
    """Deprecated: Use ToolRegistry.execute(tool_name, tool_args) instead."""
    from src.services.tool_registry import ToolRegistry
    return ToolRegistry.execute(tool_name, tool_args)


# Maintain backward compatibility for existing imports
CHAT_TOOLS = _deprecated_chat_tools
execute_tool = _deprecated_execute_tool
