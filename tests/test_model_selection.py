# -*- coding: utf-8 -*-
"""
===================================
模型选择功能回归测试
===================================

测试目标：
1. 确保 model_name 参数在调用链中正确传递
2. 确保不指定模型时使用默认模型
3. 确保指定模型时使用指定模型

运行方式：
    pytest tests/test_model_selection.py -v
"""

import pytest
from unittest.mock import Mock, patch, MagicMock


class TestAnalysisServiceModelSelection:
    """测试 AnalysisService 的模型选择功能"""

    def test_analyze_stock_passes_model_name_to_pipeline(self):
        """测试：analyze_stock 将 model_name 传递给 StockAnalysisPipeline"""
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
        mock_result.get_sniper_points = Mock(return_value={
            "ideal_buy": 1750.0,
            "secondary_buy": 1700.0,
            "stop_loss": 1650.0,
            "take_profit": 2000.0,
        })

        with patch('src.services.analysis_service.StockAnalysisPipeline') as mock_pipeline_class:
            mock_pipeline = mock_pipeline_class.return_value
            mock_pipeline.process_single_stock.return_value = mock_result
            mock_pipeline.analyzer = Mock()
            mock_pipeline.analyzer._current_model_name = "gemini-2.0-pro"

            service.analyze_stock(
                stock_code="600519",
                model_name="gemini-2.0-pro"
            )

            # 验证 Pipeline 被创建时传入了 model_name
            mock_pipeline_class.assert_called_once()
            call_kwargs = mock_pipeline_class.call_args.kwargs
            assert call_kwargs.get('model_name') == "gemini-2.0-pro", \
                f"model_name 应该传递给 Pipeline，实际得到: {call_kwargs.get('model_name')}"

    def test_analyze_stock_uses_default_model_when_not_specified(self):
        """测试：不指定 model_name 时，传递 None 给 Pipeline"""
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

            service.analyze_stock(stock_code="600519")

            # 验证 Pipeline 被创建时 model_name 为 None
            call_kwargs = mock_pipeline_class.call_args.kwargs
            assert call_kwargs.get('model_name') is None, \
                f"不指定模型时 model_name 应该为 None，实际得到: {call_kwargs.get('model_name')}"

    def test_build_analysis_response_includes_model_name(self):
        """测试：_build_analysis_response 在报告中包含 model_name"""
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
        mock_result.get_sniper_points = Mock(return_value={
            "ideal_buy": "1750",
            "secondary_buy": "1700",
            "stop_loss": "1650",
            "take_profit": "2000",
        })

        result = service._build_analysis_response(
            result=mock_result,
            query_id="test-123",
            model_name="gemini-2.0-pro"
        )

        # 验证报告中包含 model_name
        assert result["report"]["meta"]["model_name"] == "gemini-2.0-pro", \
            f"报告中应该包含 model_name，实际得到: {result['report']['meta'].get('model_name')}"


class TestTaskQueueModelSelection:
    """测试 TaskQueue 的模型选择功能"""

    def test_submit_task_passes_model_name(self):
        """测试：submit_task 将 model_name 传递给 _execute_task"""
        from src.services.task_queue import AnalysisTaskQueue, TaskInfo

        queue = AnalysisTaskQueue(max_workers=1)

        with patch.object(queue, '_executor') as mock_executor:
            mock_future = Mock()
            mock_executor.submit.return_value = mock_future

            queue.submit_task(
                stock_code="600519",
                report_type="detailed",
                force_refresh=False,
                model_name="gemini-2.0-pro"
            )

            # 验证 executor.submit 被调用且传入了 model_name
            mock_executor.submit.assert_called_once()
            call_args = mock_executor.submit.call_args
            # 第5个位置参数是 model_name
            assert call_args.args[4] == "gemini-2.0-pro", \
                f"model_name 应该传递给 _execute_task，实际得到: {call_args.args[4]}"

    def test_task_info_stores_model_name(self):
        """测试：TaskInfo 存储 model_name"""
        from src.services.task_queue import TaskInfo, TaskStatus

        task = TaskInfo(
            task_id="test-123",
            stock_code="600519",
            status=TaskStatus.PENDING,
            report_type="detailed",
            model_name="gemini-2.0-pro"
        )

        assert task.model_name == "gemini-2.0-pro"

        # 验证 to_dict 包含 model_name
        task_dict = task.to_dict()
        assert task_dict.get("model_name") == "gemini-2.0-pro", \
            f"to_dict 应该包含 model_name，实际得到: {task_dict.get('model_name')}"


class TestStockAnalysisPipelineModelSelection:
    """测试 StockAnalysisPipeline 的模型选择功能"""

    def test_pipeline_initializes_analyzer_with_model_name(self):
        """测试：Pipeline 使用指定的 model_name 初始化 analyzer"""
        from src.core.pipeline import StockAnalysisPipeline

        with patch('src.core.pipeline.GeminiAnalyzer') as mock_analyzer_class:
            mock_analyzer = Mock()
            mock_analyzer_class.return_value = mock_analyzer

            with patch('src.core.pipeline.get_config') as mock_get_config:
                mock_config = Mock()
                mock_config.max_workers = 3
                mock_config.save_context_snapshot = False
                mock_get_config.return_value = mock_config

                with patch('src.core.pipeline.get_db'):
                    with patch('src.core.pipeline.DataFetcherManager'):
                        with patch('src.core.pipeline.StockTrendAnalyzer'):
                            with patch('src.core.pipeline.NotificationService'):
                                with patch('src.core.pipeline.SearchService'):
                                    _ = StockAnalysisPipeline(
                                        model_name="gemini-2.0-pro"
                                    )

                                    # 验证 GeminiAnalyzer 被传入 model_params 初始化
                                    mock_analyzer_class.assert_called_once()
                                    call_kwargs = mock_analyzer_class.call_args.kwargs
                                    assert call_kwargs.get('model_params') == {"model": "gemini-2.0-pro"}, \
                                        f"应该使用 model_params 初始化 analyzer，实际得到: {call_kwargs}"

    def test_pipeline_uses_default_analyzer_when_no_model_name(self):
        """测试：不指定 model_name 时，Pipeline 使用默认方式初始化 analyzer"""
        from src.core.pipeline import StockAnalysisPipeline

        with patch('src.core.pipeline.GeminiAnalyzer') as mock_analyzer_class:
            mock_analyzer = Mock()
            mock_analyzer_class.return_value = mock_analyzer

            with patch('src.core.pipeline.get_config') as mock_get_config:
                mock_config = Mock()
                mock_config.max_workers = 3
                mock_config.save_context_snapshot = False
                mock_get_config.return_value = mock_config

                with patch('src.core.pipeline.get_db'):
                    with patch('src.core.pipeline.DataFetcherManager'):
                        with patch('src.core.pipeline.StockTrendAnalyzer'):
                            with patch('src.core.pipeline.NotificationService'):
                                with patch('src.core.pipeline.SearchService'):
                                    _ = StockAnalysisPipeline()

                                    # 验证 GeminiAnalyzer 被无参数初始化（或使用默认参数）
                                    mock_analyzer_class.assert_called_once()
                                    call_args = mock_analyzer_class.call_args
                                    # 不指定 model_name 时，不应该传入 model_params
                                    if call_args.kwargs:
                                        assert 'model_params' not in call_args.kwargs or call_args.kwargs.get('model_params') is None, \
                                            f"不指定模型时不应传入 model_params，实际得到: {call_args.kwargs}"


class TestAPIEndpointModelSelection:
    """测试 API 端点的模型选择功能"""

    def test_analyze_endpoint_passes_model_name_to_service(self):
        """测试：API 端点将 model_name 传递给 AnalysisService"""
        from api.v1.schemas.analysis import AnalyzeRequest

        request = AnalyzeRequest(
            stock_code="600519",
            report_type="detailed",
            model_name="gemini-2.0-pro"
        )

        assert request.model_name == "gemini-2.0-pro"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
