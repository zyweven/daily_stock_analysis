# -*- coding: utf-8 -*-
"""
测试 name_to_code_resolver 模块
"""
import pytest

from src.services.name_to_code_resolver import resolve_name_to_code


class TestResolveNameToCode:
    """测试 resolve_name_to_code 函数"""

    def test_code_input(self):
        """测试输入为代码时直接返回"""
        assert resolve_name_to_code("600519") == "600519"
        assert resolve_name_to_code("AAPL") == "AAPL"
        assert resolve_name_to_code("00700") == "00700"

    def test_local_mapping(self):
        """测试本地映射"""
        assert resolve_name_to_code("贵州茅台") == "600519"
        assert resolve_name_to_code("苹果") == "AAPL"
        assert resolve_name_to_code("腾讯控股") == "00700"

    def test_invalid_name(self):
        """测试无效名称"""
        assert resolve_name_to_code("不存在的股票") is None
        assert resolve_name_to_code("") is None

    def test_with_prefix_suffix(self):
        """测试带前后缀的代码"""
        assert resolve_name_to_code("SH600519") == "600519"
        assert resolve_name_to_code("600519.SH") == "600519"
