# -*- coding: utf-8 -*-
"""
===================================
股票数据相关模型
===================================

职责：
1. 定义股票实时行情模型
2. 定义历史 K 线数据模型
"""

from typing import Optional, List

from pydantic import BaseModel, Field


class StockQuote(BaseModel):
    """股票实时行情"""
    
    stock_code: str = Field(..., description="股票代码")
    stock_name: Optional[str] = Field(None, description="股票名称")
    current_price: float = Field(..., description="当前价格")
    change: Optional[float] = Field(None, description="涨跌额")
    change_percent: Optional[float] = Field(None, description="涨跌幅 (%)")
    open: Optional[float] = Field(None, description="开盘价")
    high: Optional[float] = Field(None, description="最高价")
    low: Optional[float] = Field(None, description="最低价")
    prev_close: Optional[float] = Field(None, description="昨收价")
    volume: Optional[float] = Field(None, description="成交量（股）")
    amount: Optional[float] = Field(None, description="成交额（元）")
    update_time: Optional[str] = Field(None, description="更新时间")
    
    class Config:
        json_schema_extra = {
            "example": {
                "stock_code": "600519",
                "stock_name": "贵州茅台",
                "current_price": 1800.00,
                "change": 15.00,
                "change_percent": 0.84,
                "open": 1785.00,
                "high": 1810.00,
                "low": 1780.00,
                "prev_close": 1785.00,
                "volume": 10000000,
                "amount": 18000000000,
                "update_time": "2024-01-01T15:00:00"
            }
        }


class KLineData(BaseModel):
    """K 线数据点"""
    
    date: str = Field(..., description="日期")
    open: float = Field(..., description="开盘价")
    high: float = Field(..., description="最高价")
    low: float = Field(..., description="最低价")
    close: float = Field(..., description="收盘价")
    volume: Optional[float] = Field(None, description="成交量")
    amount: Optional[float] = Field(None, description="成交额")
    change_percent: Optional[float] = Field(None, description="涨跌幅 (%)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "date": "2024-01-01",
                "open": 1785.00,
                "high": 1810.00,
                "low": 1780.00,
                "close": 1800.00,
                "volume": 10000000,
                "amount": 18000000000,
                "change_percent": 0.84
            }
        }


class StockHistoryResponse(BaseModel):
    """股票历史行情响应"""

    stock_code: str = Field(..., description="股票代码")
    stock_name: Optional[str] = Field(None, description="股票名称")
    period: str = Field(..., description="K 线周期")
    data: List[KLineData] = Field(default_factory=list, description="K 线数据列表")

    class Config:
        json_schema_extra = {
            "example": {
                "stock_code": "600519",
                "stock_name": "贵州茅台",
                "period": "daily",
                "data": []
            }
        }


# ==========================================
# 智能导入相关模型
# ==========================================

class StockImportItem(BaseModel):
    """导入的股票项"""

    code: Optional[str] = Field(None, description="股票代码")
    name: Optional[str] = Field(None, description="股票名称")
    confidence: str = Field("medium", description="识别置信度 (high/medium/low)")

    class Config:
        json_schema_extra = {
            "example": {
                "code": "600519",
                "name": "贵州茅台",
                "confidence": "high"
            }
        }


class ImageExtractRequest(BaseModel):
    """图片识别请求"""

    image_data: str = Field(..., description="Base64 编码的图片数据")
    mime_type: str = Field("image/jpeg", description="图片 MIME 类型")

    class Config:
        json_schema_extra = {
            "example": {
                "image_data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                "mime_type": "image/png"
            }
        }


class ImageExtractResponse(BaseModel):
    """图片识别响应"""

    items: List[StockImportItem] = Field(default_factory=list, description="识别到的股票列表")
    raw_text: str = Field("", description="LLM 原始响应")

    class Config:
        json_schema_extra = {
            "example": {
                "items": [
                    {"code": "600519", "name": "贵州茅台", "confidence": "high"},
                    {"code": "000858", "name": "五粮液", "confidence": "high"}
                ],
                "raw_text": "[{\"code\":\"600519\",\"name\":\"贵州茅台\",\"confidence\":\"high\"}]"
            }
        }


class ParseImportRequest(BaseModel):
    """文件/文本解析请求"""

    content: str = Field(..., description="文本内容或 Base64 编码的文件数据")
    content_type: str = Field("text", description="内容类型 (text/csv/excel)")
    filename: Optional[str] = Field(None, description="文件名（用于格式检测）")

    class Config:
        json_schema_extra = {
            "example": {
                "content": "600519 贵州茅台\n000858 五粮液",
                "content_type": "text",
                "filename": None
            }
        }


class ParseImportResponse(BaseModel):
    """文件/文本解析响应"""

    items: List[StockImportItem] = Field(default_factory=list, description="解析到的股票列表")

    class Config:
        json_schema_extra = {
            "example": {
                "items": [
                    {"code": "600519", "name": "贵州茅台", "confidence": "medium"},
                    {"code": "000858", "name": "五粮液", "confidence": "medium"}
                ]
            }
        }
