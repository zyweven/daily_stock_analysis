# -*- coding: utf-8 -*-
"""
===================================
股票代码工具模块
===================================

职责：
1. 判断字符串是否为股票代码
2. 标准化股票代码格式
"""

import re
from typing import Optional

# 已知交易所前缀及其对应的数字长度
_PREFIX_DIGIT_LENS = {
    "SH": (6,),
    "SZ": (6,),
    "SS": (6,),
    "HK": (5,),
}


def _strip_exchange_prefix(text: str) -> Optional[str]:
    """
    去除交易所前缀并返回纯数字代码

    Args:
        text: 输入文本（如 SH600519）

    Returns:
        纯数字代码或 None
    """
    for prefix, digit_lens in _PREFIX_DIGIT_LENS.items():
        if text.startswith(prefix):
            base = text[len(prefix):]
            if base.isdigit() and len(base) in digit_lens:
                return base
    return None


def is_code_like(value: str) -> bool:
    """
    判断字符串是否像股票代码

    支持格式：
    - 5-6 位数字（A股、港股）：600519, 00700
    - 1-5 个字母（美股）：AAPL, TSLA
    - 带后缀格式：600519.SH, 600519.SZ
    - 带前缀格式：SH600519, HK00700

    Args:
        value: 待判断的字符串

    Returns:
        是否像股票代码
    """
    text = value.strip().upper()
    if not text:
        return False

    # 5-6 位纯数字
    if text.isdigit() and len(text) in (5, 6):
        return True

    # 带后缀格式：600519.SH
    for suffix in (".SH", ".SZ", ".SS"):
        if text.endswith(suffix):
            base = text[: -len(suffix)].strip()
            if base.isdigit() and len(base) in (5, 6):
                return True

    # 美股代码：1-5 个字母，可选 .X 后缀（如 BRK.B）
    if re.match(r"^[A-Z]{1,5}(\.[A-Z])?$", text):
        return True

    # 带前缀格式：SH600519, HK00700
    if _strip_exchange_prefix(text) is not None:
        return True

    return False


def normalize_code(raw: str) -> Optional[str]:
    """
    标准化股票代码

    处理逻辑：
    1. 去除前后空格，转大写
    2. 去除交易所前缀（SH/SZ/HK）
    3. 去除交易所后缀（.SH/.SZ/.SS）
    4. 验证格式有效性

    Args:
        raw: 原始代码字符串

    Returns:
        标准化后的代码，无效则返回 None

    Examples:
        >>> normalize_code("600519")
        "600519"
        >>> normalize_code("SH600519")
        "600519"
        >>> normalize_code("600519.SH")
        "600519"
        >>> normalize_code("AAPL")
        "AAPL"
    """
    text = raw.strip().upper()
    if not text:
        return None

    # 5-6 位纯数字
    if text.isdigit() and len(text) in (5, 6):
        return text

    # 美股代码：1-5 个字母
    if re.match(r"^[A-Z]{1,5}(\.[A-Z])?$", text):
        return text

    # 去除后缀：600519.SH -> 600519
    for suffix in (".SH", ".SZ", ".SS"):
        if text.endswith(suffix):
            base = text[: -len(suffix)].strip()
            if base.isdigit() and len(base) in (5, 6):
                return base

    # 去除前缀：SH600519 -> 600519
    stripped = _strip_exchange_prefix(text)
    if stripped is not None:
        return stripped

    return None
