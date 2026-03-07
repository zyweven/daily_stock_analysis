# -*- coding: utf-8 -*-
"""
===================================
用户配置 API 端点
===================================

职责：
1. 提供用户配置的读写接口
2. 包括总本金设置
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from typing import Optional

from src.services.user_config_service import UserConfigService

router = APIRouter(tags=["UserConfig"])


class UserConfigResponse(BaseModel):
    """用户配置响应"""
    total_principal: Optional[float] = Field(None, description="总本金（用于炒股的总资金）")


class UpdateUserConfigRequest(BaseModel):
    """更新用户配置请求"""
    total_principal: Optional[float] = Field(None, description="总本金", ge=0)


@router.get("", response_model=UserConfigResponse)
async def get_user_config():
    """
    获取用户配置

    包括总本金等信息
    """
    service = UserConfigService()
    config = service.get_user_config()
    return config


@router.put("", response_model=UserConfigResponse)
async def update_user_config(config: UpdateUserConfigRequest):
    """
    更新用户配置

    更新总本金等配置
    """
    service = UserConfigService()

    success = service.update_user_config(
        total_principal=config.total_principal
    )

    if not success:
        # 如果更新失败，仍然返回当前配置
        pass

    return service.get_user_config()


@router.get("/principal")
async def get_total_principal():
    """
    获取总本金

    便捷接口，只返回总本金
    """
    service = UserConfigService()
    principal = service.get_total_principal()

    return {
        "total_principal": principal,
        "message": "未设置总本金，请在设置中配置" if principal is None else None
    }


@router.put("/principal")
async def set_total_principal(
    amount: float = Query(..., description="总本金金额", ge=0)
):
    """
    设置总本金

    Args:
        amount: 总本金金额（查询参数）
    """
    service = UserConfigService()
    success = service.set_total_principal(amount)

    if not success:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="设置总本金失败")

    return {
        "total_principal": amount,
        "message": f"总本金已设置为 ¥{amount:,.2f}"
    }
