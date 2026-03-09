# -*- coding: utf-8 -*-
"""
===================================
Pytest 配置文件
===================================

职责：
1. 定义测试夹具 (fixtures)
2. 配置测试环境
"""

import pytest
from unittest.mock import MagicMock, Mock
from dataclasses import dataclass
from typing import Optional, Dict, Any


@dataclass
class MockAnalysisResult:
    """模拟的分析结果对象"""
    code: str = "600519"
    name: str = "贵州茅台"
    sentiment_score: int = 75
    trend_prediction: str = "看多"
    operation_advice: str = "持有"
    decision_type: str = "hold"
    confidence_level: str = "高"
    analysis_summary: str = "测试分析摘要"
    technical_analysis: str = "测试技术分析"
    fundamental_analysis: str = "测试基本面分析"
    news_summary: str = "测试新闻摘要"
    risk_warning: str = "测试风险提示"
    current_price: Optional[float] = 1800.0
    change_pct: Optional[float] = 2.5
    model_name: Optional[str] = None

    def get_sniper_points(self) -> Dict[str, Any]:
        return {
            "ideal_buy": 1750.0,
            "secondary_buy": 1700.0,
            "stop_loss": 1650.0,
            "take_profit": 2000.0,
        }


@pytest.fixture
def mock_analysis_result():
    """返回模拟的分析结果"""
    return MockAnalysisResult()


@pytest.fixture
def mock_gemini_analyzer():
    """返回模拟的 GeminiAnalyzer"""
    mock = MagicMock()
    mock._current_model_name = "gemini-2.0-flash"
    mock.analyze.return_value = MockAnalysisResult()
    return mock
