# -*- coding: utf-8 -*-
"""
===================================
AI 对话助手 - 投研工具定义与执行器
===================================

定义 AI 可调用的投研工具（Function Calling 格式），
并提供工具执行路由。
"""

import json
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# === OpenAI Function Calling 格式的工具定义 ===

CHAT_TOOLS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_realtime_quote",
            "description": "获取指定股票的实时行情数据，包括最新价格、涨跌幅、成交量、换手率、市盈率、总市值等。当用户询问某只股票的当前价格、行情或市场表现时调用此工具。",
            "parameters": {
                "type": "object",
                "properties": {
                    "stock_code": {
                        "type": "string",
                        "description": "股票代码，如 A股: 601318, 600519; 港股: 01810, 00700; 美股: AAPL, TSLA"
                    }
                },
                "required": ["stock_code"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_technical_summary",
            "description": "获取指定股票的技术面分析摘要，包括最近60日K线走势、均线系统（MA5/MA10/MA20）、MACD信号、成交量变化趋势等。当用户询问技术分析、走势趋势、均线、MACD、KDJ等指标时调用此工具。",
            "parameters": {
                "type": "object",
                "properties": {
                    "stock_code": {
                        "type": "string",
                        "description": "股票代码"
                    }
                },
                "required": ["stock_code"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_latest_report",
            "description": "获取指定股票最近一次的 AI 分析报告摘要，包括趋势判断、操作建议、风险提示、情绪评分等。当用户询问之前的分析结果、历史报告或想回顾上次分析结论时调用此工具。",
            "parameters": {
                "type": "object",
                "properties": {
                    "stock_code": {
                        "type": "string",
                        "description": "股票代码"
                    }
                },
                "required": ["stock_code"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_news",
            "description": "搜索指定股票或关键词的最新新闻和公告。当用户询问某只股票的最新消息、利好利空、公告、行业动态时调用此工具。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索关键词，例如 '小米集团 最新消息' 或 '新能源汽车 政策'"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_chip_distribution",
            "description": "获取指定股票的筹码分布数据，包括获利比例、平均成本、筹码集中度等。当用户询问筹码、套牢盘、获利盘、成本分布时调用此工具。仅支持 A 股。",
            "parameters": {
                "type": "object",
                "properties": {
                    "stock_code": {
                        "type": "string",
                        "description": "A 股代码，如 601318"
                    }
                },
                "required": ["stock_code"]
            }
        }
    },
]


def execute_tool(tool_name: str, tool_args: Dict[str, Any]) -> str:
    """
    执行工具调用并返回结果（JSON 字符串）
    
    Args:
        tool_name: 工具名称
        tool_args: 工具参数字典
        
    Returns:
        JSON 格式的执行结果
    """
    try:
        if tool_name == "get_realtime_quote":
            return _exec_get_realtime_quote(tool_args.get("stock_code", ""))
        elif tool_name == "get_technical_summary":
            return _exec_get_technical_summary(tool_args.get("stock_code", ""))
        elif tool_name == "get_latest_report":
            return _exec_get_latest_report(tool_args.get("stock_code", ""))
        elif tool_name == "search_news":
            return _exec_search_news(tool_args.get("query", ""))
        elif tool_name == "get_chip_distribution":
            return _exec_get_chip_distribution(tool_args.get("stock_code", ""))
        else:
            return json.dumps({"error": f"未知工具: {tool_name}"}, ensure_ascii=False)
    except Exception as e:
        logger.error(f"[工具执行] {tool_name} 执行失败: {e}", exc_info=True)
        return json.dumps({"error": f"工具执行失败: {str(e)}"}, ensure_ascii=False)


# === 工具执行实现 ===

def _exec_get_realtime_quote(stock_code: str) -> str:
    """获取实时行情"""
    from src.services.stock_service import StockService
    svc = StockService()
    quote = svc.get_realtime_quote(stock_code)
    if quote:
        return json.dumps(quote, ensure_ascii=False)
    return json.dumps({"error": f"未能获取 {stock_code} 的实时行情"}, ensure_ascii=False)


def _exec_get_technical_summary(stock_code: str) -> str:
    """获取技术面摘要"""
    from src.storage import DatabaseManager
    db = DatabaseManager()
    
    try:
        context = db.get_analysis_context(stock_code)
        if not context:
            return json.dumps({"error": f"未找到 {stock_code} 的历史数据"}, ensure_ascii=False)
        
        # 提取关键技术指标
        summary = {
            "stock_code": stock_code,
            "data_days": len(context.get("daily_data", [])),
        }
        
        # 从日线数据提取最近趋势
        daily = context.get("daily_data", [])
        if daily and len(daily) >= 5:
            recent = daily[-5:]
            summary["recent_5d"] = [
                {"date": str(d.get("date", "")), "close": d.get("close"), "pct_chg": d.get("pct_chg")} 
                for d in recent
            ]
            
            # 最新一天的均线
            latest = daily[-1]
            summary["latest"] = {
                "date": str(latest.get("date", "")),
                "close": latest.get("close"),
                "ma5": latest.get("ma5"),
                "ma10": latest.get("ma10"),
                "ma20": latest.get("ma20"),
                "volume_ratio": latest.get("volume_ratio"),
            }
            
            # 简单趋势判断
            if len(daily) >= 20:
                ma5 = latest.get("ma5")
                ma10 = latest.get("ma10")
                ma20 = latest.get("ma20")
                close = latest.get("close")
                if ma5 and ma10 and ma20 and close:
                    if close > ma5 > ma10 > ma20:
                        summary["trend"] = "多头排列（强势上涨）"
                    elif close < ma5 < ma10 < ma20:
                        summary["trend"] = "空头排列（弱势下跌）"
                    else:
                        summary["trend"] = "震荡整理"
        
        # 实时行情补充
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
        logger.error(f"[技术面摘要] {stock_code} 获取失败: {e}")
        return json.dumps({"error": f"获取技术面数据失败: {str(e)}"}, ensure_ascii=False)


def _exec_get_latest_report(stock_code: str) -> str:
    """获取最近分析报告"""
    from src.storage import DatabaseManager
    db = DatabaseManager()
    
    try:
        # 获取最近一次分析历史
        history = db.get_analysis_history(stock_code, limit=1)
        if not history:
            return json.dumps({"error": f"未找到 {stock_code} 的历史分析报告"}, ensure_ascii=False)
        
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
        logger.error(f"[历史报告] {stock_code} 获取失败: {e}")
        return json.dumps({"error": f"获取分析报告失败: {str(e)}"}, ensure_ascii=False)


def _exec_search_news(query: str) -> str:
    """搜索新闻"""
    try:
        from src.search_service import SearchService
        search_svc = SearchService()
        result = search_svc.search(query)
        
        if result and result.results:
            news_list = []
            for item in result.results[:5]:  # 最多返回5条
                news_list.append({
                    "title": item.title,
                    "snippet": item.snippet,
                    "url": item.url,
                    "source": item.source,
                })
            return json.dumps({"query": query, "results": news_list}, ensure_ascii=False)
        
        return json.dumps({"query": query, "results": [], "message": "未找到相关新闻"}, ensure_ascii=False)
    except Exception as e:
        logger.warning(f"[新闻搜索] '{query}' 搜索失败: {e}")
        return json.dumps({"error": f"新闻搜索失败: {str(e)}"}, ensure_ascii=False)


def _exec_get_chip_distribution(stock_code: str) -> str:
    """获取筹码分布"""
    try:
        from data_provider.base import DataFetcherManager
        manager = DataFetcherManager()
        chip = manager.get_chip_distribution(stock_code)
        
        if chip:
            return json.dumps(chip.to_dict(), ensure_ascii=False, default=str)
        
        return json.dumps({"error": f"未能获取 {stock_code} 的筹码分布（仅支持 A 股）"}, ensure_ascii=False)
    except Exception as e:
        logger.warning(f"[筹码分布] {stock_code} 获取失败: {e}")
        return json.dumps({"error": f"获取筹码数据失败: {str(e)}"}, ensure_ascii=False)
