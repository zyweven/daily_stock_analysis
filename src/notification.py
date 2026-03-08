# -*- coding: utf-8 -*-
"""
===================================
A股自选股智能分析系统 - 通知层
===================================

.. deprecated::
    此模块已拆分为 src.notification 包，请直接使用：
        from src.notification import NotificationChannel, NotificationService

职责：
1. 汇总分析结果生成日报
2. 支持 Markdown 格式输出
3. 多渠道推送（自动识别）
"""

import warnings

# 发出弃用警告
warnings.warn(
    "src.notification 模块已重构为包结构，请使用新的导入方式：\n"
    "  from src.notification import NotificationChannel, NotificationService, NotificationBuilder\n"
    "此兼容层将在未来版本中移除。",
    DeprecationWarning,
    stacklevel=2
)

# 从新的包结构重新导出
from src.notification.base import (
    NotificationChannel,
    ChannelDetector,
    SMTP_CONFIGS,
    WECHAT_IMAGE_MAX_BYTES,
)
from src.notification.builder import NotificationBuilder
from src.notification.service import (
    NotificationService,
    get_notification_service,
    send_daily_report,
)

__all__ = [
    # 基础定义
    'NotificationChannel',
    'ChannelDetector',
    'SMTP_CONFIGS',
    'WECHAT_IMAGE_MAX_BYTES',
    # 服务类
    'NotificationService',
    'get_notification_service',
    'send_daily_report',
    # 构建器
    'NotificationBuilder',
]
