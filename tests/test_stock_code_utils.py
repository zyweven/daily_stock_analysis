# -*- coding: utf-8 -*-
"""
测试 stock_code_utils 模块
"""
import pytest

from src.services.stock_code_utils import is_code_like, normalize_code


class TestIsCodeLike:
    """测试 is_code_like 函数"""

    def test_a_share_codes(self):
        """测试 A 股代码"""
        assert is_code_like("600519")
        assert is_code_like("000001")
        assert is_code_like("300750")

    def test_hk_codes(self):
        """测试港股代码"""
        assert is_code_like("00700")
        assert is_code_like("09988")

    def test_us_codes(self):
        """测试美股代码"""
        assert is_code_like("AAPL")
        assert is_code_like("TSLA")
        assert is_code_like("BRK.B")

    def test_with_suffix(self):
        """测试带后缀的代码"""
        assert is_code_like("600519.SH")
        assert is_code_like("000001.SZ")

    def test_with_prefix(self):
        """测试带前缀的代码"""
        assert is_code_like("SH600519")
        assert is_code_like("SZ000001")
        assert is_code_like("HK00700")

    def test_invalid_codes(self):
        """测试无效代码"""
        assert not is_code_like("贵州茅台")
        assert not is_code_like("123")
        assert not is_code_like("1234567")
        assert not is_code_like("")


class TestNormalizeCode:
    """测试 normalize_code 函数"""

    def test_plain_codes(self):
        """测试纯代码"""
        assert normalize_code("600519") == "600519"
        assert normalize_code("00700") == "00700"
        assert normalize_code("AAPL") == "AAPL"

    def test_remove_suffix(self):
        """测试去除后缀"""
        assert normalize_code("600519.SH") == "600519"
        assert normalize_code("000001.SZ") == "000001"

    def test_remove_prefix(self):
        """测试去除前缀"""
        assert normalize_code("SH600519") == "600519"
        assert normalize_code("HK00700") == "00700"

    def test_case_insensitive(self):
        """测试大小写不敏感"""
        assert normalize_code("aapl") == "AAPL"
        assert normalize_code("sh600519") == "600519"

    def test_invalid_codes(self):
        """测试无效代码"""
        assert normalize_code("贵州茅台") is None
        assert normalize_code("123") is None
        assert normalize_code("") is None
