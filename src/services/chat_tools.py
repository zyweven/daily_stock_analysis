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


@tool()
def search_news(query: str) -> str:
    """
    Perform a web search to find the latest news, articles, and information on any topic.
    Use this tool when the user asks about current events, recent developments,
    news articles, or any topic requiring up-to-date information from the internet.

    Args:
        query: Search query, e.g., 'latest AI developments', 'renewable energy trends', or 'company product announcements'
    """
    try:
        from src.search_service import get_search_service
        search_svc = get_search_service()

        if not search_svc.is_available:
            return json.dumps(
                {"error": "No search engine API Key configured. Please set SERPAPI_KEY / TAVILY_KEY / BOCHA_KEY in environment variables."},
                ensure_ascii=False
            )

        # Try each available search provider
        for provider in search_svc._providers:
            if not provider.is_available:
                continue

            result = provider.search(query, max_results=5, days=7)

            if result.success and result.results:
                news_list = []
                for item in result.results[:5]:
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
