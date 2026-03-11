# -*- coding: utf-8 -*-
"""
===================================
名称→代码解析引擎
===================================

多级策略：
1) 代码样式判定与标准化
2) 本地映射反查（去除重名歧义）
3) 拼音精确匹配（可选）
4) AkShare 在线回退（带 TTL 缓存）
5) 模糊匹配（difflib，cutoff=0.8）
"""
from __future__ import annotations

import difflib
import logging
import time
from typing import Dict, Optional, Set

from src.data import STOCK_NAME_MAP
from src.services.stock_code_utils import is_code_like, normalize_code

logger = logging.getLogger(__name__)

# AkShare name->code 缓存
_akshare_cache: Optional[tuple[float, Dict[str, str]]] = None
_AKSHARE_CACHE_TTL = 3600  # 1 hour


def _build_reverse_map_no_duplicates(code_to_name: Dict[str, str]) -> Dict[str, str]:
    """将 code->name 转换为 name->code，若同名多码则丢弃该名称避免歧义。"""
    name_to_codes: Dict[str, Set[str]] = {}
    for code, name in code_to_name.items():
        if not code or not name:
            continue
        name = name.strip()
        codes = name_to_codes.setdefault(name, set())
        codes.add(code)
    return {n: next(iter(codes)) for n, codes in name_to_codes.items() if len(codes) == 1}


def _get_akshare_name_to_code() -> Optional[Dict[str, str]]:
    """从 AkShare 获取 A 股名称映射，带内存缓存。"""
    global _akshare_cache
    now = time.time()
    if _akshare_cache and (now - _akshare_cache[0]) < _AKSHARE_CACHE_TTL:
        return _akshare_cache[1]
    try:
        import akshare as ak  # noqa: WPS433 - 第三方导入

        df = ak.stock_info_a_code_name()
        if df is None or df.empty:
            return None
        code_to_name: Dict[str, str] = {}
        for _, row in df.iterrows():  # type: ignore[attr-defined]
            code = row.get("code")
            name = row.get("name")
            if code is None or name is None:
                continue
            code_str = str(code).strip()
            # 去除 .SH/.SZ 后缀
            if "." in code_str:
                base, suffix = code_str.rsplit(".", 1)
                if suffix.upper() in ("SH", "SZ", "SS") and base.isdigit():
                    code_str = base
            code_to_name[code_str] = str(name).strip()
        result = _build_reverse_map_no_duplicates(code_to_name)
        _akshare_cache = (now, result)
        logger.info("[NameResolver] AkShare cache loaded: %d", len(result))
        return result
    except Exception as exc:  # noqa: BLE001 - 日志级别较低
        logger.debug("[NameResolver] AkShare fallback failed: %s", exc)
        return None


def resolve_name_to_code(name: str) -> Optional[str]:
    """解析股票名称或代码为标准化代码。失败返回 None。"""
    if not name or not isinstance(name, str):
        return None
    s = name.strip()
    if not s:
        return None

    # 1. 像代码 → 直接标准化
    if is_code_like(s):
        return normalize_code(s)

    # 2. 本地映射反查（去重）
    local_reverse = _build_reverse_map_no_duplicates(STOCK_NAME_MAP)
    if s in local_reverse:
        return local_reverse[s]

    # 3. 拼音精确匹配
    try:
        from pypinyin import lazy_pinyin  # noqa: WPS433

        input_pinyin = "".join(lazy_pinyin(s)).lower()
        for local_name, code in local_reverse.items():
            if input_pinyin == "".join(lazy_pinyin(local_name)).lower():
                return code
    except ImportError:
        pass
    except Exception as exc:  # noqa: BLE001
        logger.debug("[NameResolver] Pinyin match failed: %s", exc)

    # 4. AkShare 在线回退
    ak_map = _get_akshare_name_to_code()
    if ak_map and s in ak_map:
        return ak_map[s]

    # 5. 模糊匹配（保护短输入）
    all_map = dict(local_reverse)
    if ak_map:
        all_map.update(ak_map)
    if len(s) > 2:
        matches = difflib.get_close_matches(s, list(all_map.keys()), n=1, cutoff=0.8)
        if matches:
            return all_map[matches[0]]

    return None
