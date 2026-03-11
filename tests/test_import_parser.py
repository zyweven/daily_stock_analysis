# -*- coding: utf-8 -*-
"""
测试 import_parser 模块
"""
import io

import pandas as pd
import pytest

from src.services.import_parser import (
    parse_import_from_bytes,
    parse_import_from_text,
)


class TestParseImport:
    """测试导入解析器"""

    def test_parse_text_single_column(self):
        text = "\n".join(["600519", "AAPL", "00700"])
        items = parse_import_from_text(text)
        codes = [c for c, _, _ in items]
        assert codes == ["600519", "AAPL", "00700"]

    def test_parse_text_pairs(self):
        text = "600519 贵州茅台\nAAPL 苹果\n00700 腾讯控股"
        items = parse_import_from_text(text)
        codes = [c for c, _, _ in items]
        assert codes == ["600519", "AAPL", "00700"]

    def test_parse_csv_bytes(self):
        csv_text = "code,name\n600519,贵州茅台\nAAPL,苹果\n00700,腾讯控股\n"
        items = parse_import_from_bytes(csv_text.encode("utf-8"), filename="a.csv")
        codes = [c for c, _, _ in items]
        assert codes == ["600519", "AAPL", "00700"]

    def test_parse_excel_bytes(self):
        df = pd.DataFrame({"code": ["600519", "AAPL", "00700"], "name": ["贵州茅台", "苹果", "腾讯控股"]})
        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            df.to_excel(writer, index=False)
        items = parse_import_from_bytes(buf.getvalue(), filename="a.xlsx")
        codes = [c for c, _, _ in items]
        assert codes == ["600519", "AAPL", "00700"]

    def test_text_too_large(self):
        with pytest.raises(ValueError):
            parse_import_from_text("x" * (101 * 1024))

    def test_file_too_large(self):
        with pytest.raises(ValueError):
            parse_import_from_bytes(b"x" * (2 * 1024 * 1024 + 1), filename="a.csv")
