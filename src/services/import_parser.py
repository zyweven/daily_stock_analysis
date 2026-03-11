# -*- coding: utf-8 -*-
"""
===================================
统一导入解析管道
===================================

职责：
1. 解析 CSV/Excel/文本为股票列表
2. 智能识别代码和名称列
3. 调用名称解析器处理名称
"""
from __future__ import annotations

import io
import logging
import re
from typing import List, Optional, Tuple

import pandas as pd

from src.services.name_to_code_resolver import resolve_name_to_code
from src.services.stock_code_utils import is_code_like, normalize_code

logger = logging.getLogger(__name__)

# 列名别名（不区分大小写）
_CODE_ALIASES = frozenset({"code", "股票代码", "代码", "stock_code", "symbol"})
_NAME_ALIASES = frozenset({"name", "股票名称", "名称", "stock_name"})

MAX_FILE_BYTES = 2 * 1024 * 1024  # 2MB
MAX_TEXT_BYTES = 100 * 1024  # 100KB


def _should_use_single_column_fast_path(lines: List[str]) -> bool:
    """判断是否应使用单列快速路径（纯代码列表）。"""
    if not lines:
        return False

    # 有明显分隔符 → 非单列
    if any(re.search(r"[\t,;]", ln) for ln in lines):
        return False

    # 检查是否有"代码 名称"对
    for ln in lines:
        parts = ln.split()
        if len(parts) >= 2 and is_code_like(parts[0]):
            # 第一个是代码，后面有非代码 → 不是单列
            if any(not is_code_like(p) for p in parts[1:]):
                return False

    return True


def _detect_column_indices(df: pd.DataFrame) -> Tuple[Optional[int], Optional[int]]:
    """检测 DataFrame 中的代码列和名称列索引。"""
    code_idx, name_idx = None, None
    cols = [str(c).strip().lower() for c in df.columns]
    for i, col in enumerate(cols):
        if col in _CODE_ALIASES:
            code_idx = i
        if col in _NAME_ALIASES:
            name_idx = i
    return code_idx, name_idx


def _parse_dataframe(df: pd.DataFrame) -> List[Tuple[Optional[str], Optional[str], str]]:
    """
    解析 DataFrame 为 (code, name, confidence) 列表。

    Returns:
        [(code, name, confidence), ...]
        code 可能为 None（解析失败）
    """
    result: List[Tuple[Optional[str], Optional[str], str]] = []
    code_idx, name_idx = _detect_column_indices(df)
    has_header = code_idx is not None or name_idx is not None

    for _, row in df.iterrows():  # type: ignore[attr-defined]
        code_val = None
        name_val = None

        if has_header:
            if code_idx is not None and code_idx < len(row):
                v = row.iloc[code_idx]
                code_val = str(v).strip() if pd.notna(v) else None
            if name_idx is not None and name_idx < len(row):
                v = row.iloc[name_idx]
                name_val = str(v).strip() if pd.notna(v) else None
        else:
            # 无表头：第 0 列=代码，第 1 列=名称
            if len(row) >= 1:
                v = row.iloc[0]
                code_val = str(v).strip() if pd.notna(v) else None
            if len(row) >= 2:
                v = row.iloc[1]
                name_val = str(v).strip() if pd.notna(v) else None

        # 跳过空行
        if not code_val and not name_val:
            continue

        # 如果"名称"列实际是代码，交换
        if not code_val and name_val and is_code_like(name_val):
            code_val = name_val
            name_val = None

        code = None
        if code_val:
            code = normalize_code(code_val)
            # code_val 无效但不像代码 → 尝试作为名称解析
            if not code and not is_code_like(code_val):
                if name_val:
                    # 优先用 name_val 解析，保留 name_val
                    code = resolve_name_to_code(name_val)
                else:
                    # code_val 当名称用
                    code = resolve_name_to_code(code_val)
                    name_val = code_val

        if not code and name_val:
            code = resolve_name_to_code(name_val)

        result.append((code, name_val if name_val else None, "medium"))

    return result


def parse_import_from_bytes(
    data: bytes,
    filename: Optional[str] = None,
) -> List[Tuple[Optional[str], Optional[str], str]]:
    """
    解析文件字节为股票列表。

    Args:
        data: 文件内容
        filename: 文件名（用于格式检测）

    Returns:
        [(code, name, confidence), ...]

    Raises:
        ValueError: 解析失败或格式不支持
    """
    if len(data) > MAX_FILE_BYTES:
        raise ValueError(f"文件超过 {MAX_FILE_BYTES // (1024 * 1024)}MB 限制")

    ext = ""
    if filename:
        ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    looks_like_zip = len(data) >= 4 and data[:4] == b"PK\x03\x04"

    # Excel 格式
    if ext in (".xlsx", ".xls") or looks_like_zip:
        try:
            df = pd.read_excel(io.BytesIO(data), header=None)
            # 检测表头行
            if not df.empty:
                first_row = [str(c).strip().lower() for c in df.iloc[0]]
                if any(c in _CODE_ALIASES or c in _NAME_ALIASES for c in first_row):
                    df.columns = df.iloc[0]
                    df = df[1:]
            return _parse_dataframe(df)
        except Exception as exc:
            logger.error("[ImportParser] Excel parse failed: %s", exc)
            raise ValueError(f"Excel 解析失败: {exc}") from exc

    # CSV 格式
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = data.decode("gbk")
        except UnicodeDecodeError as exc:
            raise ValueError("文件编码不支持，请使用 UTF-8 或 GBK") from exc

    # 尝试 CSV
    try:
        df = pd.read_csv(io.StringIO(text))
        return _parse_dataframe(df)
    except Exception:
        pass

    # 兜底：纯文本
    return parse_import_from_text(text)


def parse_import_from_text(text: str) -> List[Tuple[Optional[str], Optional[str], str]]:
    """
    解析纯文本为股票列表。

    Args:
        text: 文本内容

    Returns:
        [(code, name, confidence), ...]

    Raises:
        ValueError: 解析失败
    """
    if len(text.encode("utf-8")) > MAX_TEXT_BYTES:
        raise ValueError(f"文本超过 {MAX_TEXT_BYTES // 1024}KB 限制")

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        raise ValueError("未找到有效内容")

    # 单列快速路径
    if _should_use_single_column_fast_path(lines):
        result: List[Tuple[Optional[str], Optional[str], str]] = []
        for ln in lines:
            code = normalize_code(ln)
            result.append((code, None, "medium"))
        return result

    # 尝试 CSV 解析
    try:
        df = pd.read_csv(io.StringIO(text))
        return _parse_dataframe(df)
    except Exception:
        pass

    # 兜底：逐行解析"代码 名称"对
    result = []
    for ln in lines:
        parts = ln.split()
        if not parts:
            continue
        if len(parts) == 1:
            code = normalize_code(parts[0])
            result.append((code, None, "medium"))
        else:
            # 第一个 token 是代码
            code = normalize_code(parts[0])
            name = " ".join(parts[1:])
            if not code:
                # 尝试整行作为名称
                code = resolve_name_to_code(ln)
                name = ln
            result.append((code, name if name else None, "medium"))

    return result
