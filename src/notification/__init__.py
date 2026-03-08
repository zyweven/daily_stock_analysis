# -*- coding: utf-8 -*-
"""
===================================
通知模块
===================================

职责：
1. 汇总分析结果生成日报
2. 支持 Markdown 格式输出
3. 多渠道推送（自动识别）

支持的渠道：
- 企业微信 Webhook
- 飞书 Webhook
- Telegram Bot
- 邮件 SMTP
- Pushover（手机/桌面推送）
"""

from src.notification.base import (
    NotificationChannel,
    ChannelDetector,
    SMTP_CONFIGS,
    WECHAT_IMAGE_MAX_BYTES,
)
from src.notification.builder import NotificationBuilder

__all__ = [
    # 基础定义
    'NotificationChannel',
    'ChannelDetector',
    'SMTP_CONFIGS',
    'WECHAT_IMAGE_MAX_BYTES',
    # 构建器
    'NotificationBuilder',
]

# 延迟导入 NotificationService 以避免循环导入
def __getattr__(name):
    if name == 'NotificationService':
        from src.notification.service import NotificationService
        return NotificationService
    if name == 'get_notification_service':
        from src.notification.service import get_notification_service
        return get_notification_service
    if name == 'send_daily_report':
        from src.notification.service import send_daily_report
        return send_daily_report
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
