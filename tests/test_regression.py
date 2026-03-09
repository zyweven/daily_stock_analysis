# -*- coding: utf-8 -*-
"""
===================================
回归测试套件
===================================

测试目标：
1. 确保现有功能在新修改后仍然正常工作
2. 快速发现参数传递、接口变更等问题

运行方式：
    pytest tests/test_regression.py -v
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import inspect


class TestAnalysisServiceBackwardCompatibility:
    """测试 AnalysisService 向后兼容性"""

    def test_analyze_stock_signature_unchanged(self):
        """测试：analyze_stock 函数签名保持兼容（新增可选参数）"""
        from src.services.analysis_service import AnalysisService

        sig = inspect.signature(AnalysisService.analyze_stock)
        params = list(sig.parameters.keys())

        # 必需参数
        assert 'stock_code' in params
        assert 'report_type' in params
        assert 'force_refresh' in params
        assert 'query_id' in params
        assert 'send_notification' in params
        # 新增参数（可选）
        assert 'model_name' in params

        # 检查默认值
        model_name_param = sig.parameters['model_name']
        assert model_name_param.default is None, "model_name 应该有默认值 None"

    def test_analyze_stock_returns_expected_structure(self):
        """测试：analyze_stock 返回预期的数据结构"""
        from src.services.analysis_service import AnalysisService

        service = AnalysisService()

        mock_result = Mock()
        mock_result.code = "600519"
        mock_result.name = "贵州茅台"
        mock_result.sentiment_score = 75
        mock_result.analysis_summary = "测试摘要"
        mock_result.operation_advice = "持有"
        mock_result.trend_prediction = "看多"
        mock_result.current_price = 1800.0
        mock_result.change_pct = 2.5
        mock_result.news_summary = "新闻"
        mock_result.technical_analysis = "技术分析"
        mock_result.fundamental_analysis = "基本面"
        mock_result.risk_warning = "风险提示"
        mock_result.get_sniper_points = Mock(return_value={
            "ideal_buy": "1750",
            "stop_loss": "1650",
        })

        with patch.object(service, '_get_model_name_from_result', return_value="gemini-2.0-flash"):
            result = service._build_analysis_response(mock_result, "test-123")

        # 验证返回结构
        assert 'stock_code' in result
        assert 'stock_name' in result
        assert 'report' in result

        # 验证 report 结构
        report = result['report']
        assert 'meta' in report
        assert 'summary' in report
        assert 'strategy' in report
        assert 'details' in report

        # 验证 meta 包含新字段
        meta = report['meta']
        assert 'query_id' in meta
        assert 'stock_code' in meta
        assert 'stock_name' in meta
        assert 'current_price' in meta
        assert 'change_pct' in meta
        assert 'model_name' in meta, "meta 应该包含 model_name 字段"


class TaskQueueBackwardCompatibility:
    """测试 TaskQueue 向后兼容性"""

    def test_submit_task_signature_unchanged(self):
        """测试：submit_task 函数签名保持兼容"""
        from src.services.task_queue import AnalysisTaskQueue

        sig = inspect.signature(AnalysisTaskQueue.submit_task)
        params = list(sig.parameters.keys())

        assert 'stock_code' in params
        assert 'stock_name' in params
        assert 'report_type' in params
        assert 'force_refresh' in params
        assert 'model_name' in params

        # 检查默认值
        model_name_param = sig.parameters['model_name']
        assert model_name_param.default is None


class TestPipelineBackwardCompatibility:
    """测试 Pipeline 向后兼容性"""

    def test_pipeline_init_signature_unchanged(self):
        """测试：Pipeline __init__ 函数签名保持兼容"""
        from src.core.pipeline import StockAnalysisPipeline

        sig = inspect.signature(StockAnalysisPipeline.__init__)
        params = list(sig.parameters.keys())

        assert 'config' in params
        assert 'max_workers' in params
        assert 'source_message' in params
        assert 'query_id' in params
        assert 'query_source' in params
        assert 'save_context_snapshot' in params
        assert 'model_name' in params


class TestAPIResponseStructure:
    """测试 API 响应结构稳定性"""

    def test_report_meta_has_all_fields(self):
        """测试：ReportMeta 包含所有必需字段"""
        from api.v1.schemas.history import ReportMeta

        # 创建实例
        meta = ReportMeta(
            query_id="test-123",
            stock_code="600519",
            stock_name="贵州茅台",
            report_type="detailed",
            created_at="2024-01-01T12:00:00",
            current_price=1800.0,
            change_pct=2.5,
            model_name="gemini-2.0-flash"
        )

        # 验证所有字段
        assert meta.query_id == "test-123"
        assert meta.stock_code == "600519"
        assert meta.stock_name == "贵州茅台"
        assert meta.report_type == "detailed"
        assert meta.current_price == 1800.0
        assert meta.change_pct == 2.5
        assert meta.model_name == "gemini-2.0-flash"


class TestCriticalPathRegression:
    """关键路径回归测试 - 这些测试确保核心流程不会中断"""

    def test_full_analysis_flow_with_model_selection(self):
        """测试：完整的分析流程，包括模型选择"""
        from src.services.analysis_service import AnalysisService

        service = AnalysisService()

        # 模拟 Pipeline 返回结果
        mock_result = Mock()
        mock_result.code = "600519"
        mock_result.name = "贵州茅台"
        mock_result.sentiment_score = 75
        mock_result.analysis_summary = "测试"
        mock_result.operation_advice = "持有"
        mock_result.trend_prediction = "看多"
        mock_result.current_price = 1800.0
        mock_result.change_pct = 2.5
        mock_result.news_summary = ""
        mock_result.technical_analysis = ""
        mock_result.fundamental_analysis = ""
        mock_result.risk_warning = ""
        mock_result.get_sniper_points = Mock(return_value={})

        with patch('src.services.analysis_service.StockAnalysisPipeline') as mock_pipeline_class:
            mock_pipeline = mock_pipeline_class.return_value
            mock_pipeline.process_single_stock.return_value = mock_result
            mock_pipeline.analyzer = Mock()
            mock_pipeline.analyzer._current_model_name = "gemini-2.0-pro"

            # 调用分析
            result = service.analyze_stock(
                stock_code="600519",
                model_name="gemini-2.0-pro"
            )

            # 验证流程完整
            assert result is not None
            assert result['stock_code'] == "600519"
            assert result['report']['meta']['model_name'] == "gemini-2.0-pro"

    def test_full_analysis_flow_without_model_selection(self):
        """测试：完整的分析流程，不选择模型（默认行为）"""
        from src.services.analysis_service import AnalysisService

        service = AnalysisService()

        mock_result = Mock()
        mock_result.code = "600519"
        mock_result.name = "贵州茅台"
        mock_result.sentiment_score = 75
        mock_result.analysis_summary = "测试"
        mock_result.operation_advice = "持有"
        mock_result.trend_prediction = "看多"
        mock_result.current_price = 1800.0
        mock_result.change_pct = 2.5
        mock_result.news_summary = ""
        mock_result.technical_analysis = ""
        mock_result.fundamental_analysis = ""
        mock_result.risk_warning = ""
        mock_result.get_sniper_points = Mock(return_value={})

        with patch('src.services.analysis_service.StockAnalysisPipeline') as mock_pipeline_class:
            mock_pipeline = mock_pipeline_class.return_value
            mock_pipeline.process_single_stock.return_value = mock_result
            mock_pipeline.analyzer = Mock()
            mock_pipeline.analyzer._current_model_name = "gemini-2.0-flash"

            # 调用分析（不指定模型）
            result = service.analyze_stock(stock_code="600519")

            # 验证流程完整
            assert result is not None
            assert result['stock_code'] == "600519"
            # 不指定模型时，使用 Pipeline 中 analyzer 的实际模型名称
            assert result['report']['meta']['model_name'] == "gemini-2.0-flash"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
