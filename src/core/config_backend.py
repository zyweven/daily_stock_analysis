# -*- coding: utf-8 -*-
"""
可插拔配置后端 (Pluggable Configuration Backends)

支持两种存储模式：
1. EnvBackend: 读写 .env 文件（默认，适合本地开发和 CI/CD）
2. DbBackend: 读写 SQLite system_config 表（适合服务器部署）

通过环境变量 CONFIG_STORAGE_TYPE 选择后端（env 或 db）。
"""

from __future__ import annotations

import hashlib
import logging
import os
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)


class ConfigBackend(ABC):
    """配置后端抽象接口"""

    @abstractmethod
    def read_config_map(self) -> Dict[str, str]:
        """读取所有配置项"""
        ...

    @abstractmethod
    def get_config_version(self) -> str:
        """返回配置版本标识"""
        ...

    @abstractmethod
    def get_updated_at(self) -> Optional[str]:
        """返回最后更新时间 (ISO8601)"""
        ...

    @abstractmethod
    def apply_updates(
        self,
        updates: List[Tuple[str, str]],
        sensitive_keys: Set[str],
        mask_token: str,
    ) -> Tuple[List[str], List[str], str]:
        """
        应用配置更新。

        Returns:
            (updated_keys, skipped_masked_keys, new_version)
        """
        ...


class EnvBackend(ConfigBackend):
    """
    基于 .env 文件的配置后端。

    包装现有的 ConfigManager 逻辑。
    """

    def __init__(self, env_path: Optional[Path] = None):
        from src.core.config_manager import ConfigManager
        self._manager = ConfigManager(env_path=env_path)

    @property
    def manager(self):
        return self._manager

    def read_config_map(self) -> Dict[str, str]:
        return self._manager.read_config_map()

    def get_config_version(self) -> str:
        return self._manager.get_config_version()

    def get_updated_at(self) -> Optional[str]:
        return self._manager.get_updated_at()

    def apply_updates(
        self,
        updates: List[Tuple[str, str]],
        sensitive_keys: Set[str],
        mask_token: str,
    ) -> Tuple[List[str], List[str], str]:
        return self._manager.apply_updates(
            updates=updates,
            sensitive_keys=sensitive_keys,
            mask_token=mask_token,
        )


class DbBackend(ConfigBackend):
    """
    基于数据库 system_config 表的配置后端。

    适合服务器部署，支持运行时热更新。
    """

    def __init__(self):
        self._version_cache: Optional[str] = None

    def _get_db(self):
        from src.storage import get_db
        return get_db()

    def read_config_map(self) -> Dict[str, str]:
        db = self._get_db()
        return db.get_all_system_configs()

    def get_config_version(self) -> str:
        config_map = self.read_config_map()
        content = str(sorted(config_map.items()))
        content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
        return f"db:{content_hash[:16]}"

    def get_updated_at(self) -> Optional[str]:
        return datetime.now(tz=timezone.utc).isoformat()

    def apply_updates(
        self,
        updates: List[Tuple[str, str]],
        sensitive_keys: Set[str],
        mask_token: str,
    ) -> Tuple[List[str], List[str], str]:
        db = self._get_db()
        current_values = db.get_all_system_configs()

        updated_keys: List[str] = []
        skipped_masked: List[str] = []

        for key, value in updates:
            key_upper = key.upper()
            current_value = current_values.get(key_upper)

            if key_upper in sensitive_keys and value == mask_token:
                if current_value not in (None, ""):
                    skipped_masked.append(key_upper)
                continue

            if current_value == value:
                continue

            db.set_system_config(key_upper, value)
            updated_keys.append(key_upper)

        new_version = self.get_config_version()
        return updated_keys, skipped_masked, new_version


def get_config_backend() -> ConfigBackend:
    """
    根据 CONFIG_STORAGE_TYPE 环境变量选择配置后端。

    - 'env' (默认): 使用 .env 文件
    - 'db': 使用数据库 system_config 表
    """
    storage_type = os.getenv("CONFIG_STORAGE_TYPE", "env").lower().strip()

    if storage_type == "db":
        logger.info("配置后端: 数据库模式 (DbBackend)")
        return DbBackend()
    else:
        logger.info("配置后端: 环境变量模式 (EnvBackend)")
        return EnvBackend()
