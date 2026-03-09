# -*- coding: utf-8 -*-
"""
===================================
冒烟测试
===================================

快速验证核心功能是否正常工作的轻量级测试。

运行方式：
    python tests/test_smoke.py
    pytest tests/test_smoke.py -v
"""

import sys
import os
from unittest.mock import Mock, patch

# 添加项目根目录到 Python 路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_imports():
    """测试：关键模块可以正常导入"""
    print("\n[TEST] 测试模块导入...")

    try:
        from src.services.analysis_service import AnalysisService
        print("  [OK] AnalysisService")
    except ImportError as e:
        print(f"  [FAIL] AnalysisService: {e}")
        return False

    try:
        from src.services.task_queue import AnalysisTaskQueue
        print("  [OK] AnalysisTaskQueue")
    except ImportError as e:
        print(f"  [FAIL] AnalysisTaskQueue: {e}")
        return False

    try:
        from src.core.pipeline import StockAnalysisPipeline
        print("  [OK] StockAnalysisPipeline")
    except ImportError as e:
        print(f"  [FAIL] StockAnalysisPipeline: {e}")
        return False

    try:
        from src.analyzer import GeminiAnalyzer
        print("  [OK] GeminiAnalyzer")
    except ImportError as e:
        print(f"  [FAIL] GeminiAnalyzer: {e}")
        return False

    return True


def test_analysis_service_signature():
    """测试：AnalysisService.analyze_stock 函数签名正确"""
    print("\n[TEST] 测试 AnalysisService 函数签名...")

    import inspect
    from src.services.analysis_service import AnalysisService

    sig = inspect.signature(AnalysisService.analyze_stock)
    params = list(sig.parameters.keys())

    required_params = ['stock_code', 'report_type', 'force_refresh',
                       'query_id', 'send_notification', 'model_name']

    for param in required_params:
        if param in params:
            print(f"  [OK] 参数 '{param}' 存在")
        else:
            print(f"  [FAIL] 参数 '{param}' 缺失")
            return False

    # 检查 model_name 默认值
    model_name_param = sig.parameters['model_name']
    if model_name_param.default is None:
        print("  [OK] model_name 默认值为 None")
    else:
        print(f"  [FAIL] model_name 默认值应为 None，实际为 {model_name_param.default}")
        return False

    return True


def test_task_queue_signature():
    """测试：TaskQueue.submit_task 函数签名正确"""
    print("\n[TEST] 测试 TaskQueue 函数签名...")

    import inspect
    from src.services.task_queue import AnalysisTaskQueue

    sig = inspect.signature(AnalysisTaskQueue.submit_task)
    params = list(sig.parameters.keys())

    if 'model_name' in params:
        print("  [OK] submit_task 支持 model_name 参数")
    else:
        print("  [FAIL] submit_task 缺少 model_name 参数")
        return False

    return True


def test_pipeline_signature():
    """测试：Pipeline __init__ 函数签名正确"""
    print("\n[TEST] 测试 Pipeline 函数签名...")

    import inspect
    from src.core.pipeline import StockAnalysisPipeline

    sig = inspect.signature(StockAnalysisPipeline.__init__)
    params = list(sig.parameters.keys())

    if 'model_name' in params:
        print("  [OK] Pipeline 支持 model_name 参数")
    else:
        print("  [FAIL] Pipeline 缺少 model_name 参数")
        return False

    return True


def test_api_schema():
    """测试：API Schema 包含 model_name 字段"""
    print("\n[TEST] 测试 API Schema...")

    try:
        from api.v1.schemas.history import ReportMeta

        # 检查字段存在
        if hasattr(ReportMeta, 'model_fields') and 'model_name' in ReportMeta.model_fields:
            print("  [OK] ReportMeta 包含 model_name 字段")
        else:
            print("  [FAIL] ReportMeta 缺少 model_name 字段")
            return False

        # 尝试创建实例
        meta = ReportMeta(
            query_id="test",
            stock_code="600519",
            stock_name="测试",
            model_name="gemini-2.0-flash"
        )
        print(f"  [OK] 可以创建包含 model_name 的 ReportMeta 实例: {meta.model_name}")

        return True
    except Exception as e:
        print(f"  [FAIL] 测试失败: {e}")
        return False


def test_model_name_in_response():
    """测试：分析响应中包含 model_name"""
    print("\n[TEST] 测试分析响应结构...")

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

    result = service._build_analysis_response(
        result=mock_result,
        query_id="test-123",
        model_name="gemini-2.0-pro"
    )

    if 'report' in result and 'meta' in result['report']:
        meta = result['report']['meta']
        if 'model_name' in meta:
            print(f"  [OK] 响应中包含 model_name: {meta['model_name']}")
            return True
        else:
            print("  [FAIL] 响应中缺少 model_name 字段")
            return False
    else:
        print("  [FAIL] 响应结构不正确")
        return False


def main():
    """运行所有冒烟测试"""
    print("=" * 50)
    print("SMOKE TEST")
    print("=" * 50)

    tests = [
        ("模块导入", test_imports),
        ("AnalysisService 签名", test_analysis_service_signature),
        ("TaskQueue 签名", test_task_queue_signature),
        ("Pipeline 签名", test_pipeline_signature),
        ("API Schema", test_api_schema),
        ("响应结构", test_model_name_in_response),
    ]

    passed = 0
    failed = 0

    for name, test_func in tests:
        try:
            if test_func():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"\n  [ERROR] 测试异常: {e}")
            failed += 1

    print("\n" + "=" * 50)
    print(f"RESULT: {passed} passed, {failed} failed")
    print("=" * 50)

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
