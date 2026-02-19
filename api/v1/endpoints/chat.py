# -*- coding: utf-8 -*-
"""
===================================
AI 对话接口
===================================

职责：
1. 提供 SSE 流式对话端点
2. 会话 CRUD 管理
"""

import json
import logging
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.services.chat_service import ChatService

logger = logging.getLogger(__name__)

router = APIRouter()


# === 请求/响应模型 ===

class ChatSendRequest(BaseModel):
    """发送消息请求"""
    session_id: Optional[str] = Field(None, description="会话ID，空则创建新会话")
    message: str = Field(..., min_length=1, max_length=5000, description="用户消息")
    stock_code: Optional[str] = Field(None, description="关联股票代码")
    model_name: Optional[str] = Field(None, description="指定模型名称")
    agent_id: Optional[str] = Field(None, description="指定 Agent ID（仅新建会话有效）")
    tools: Optional[List[str]] = Field(None, description="运行时启用的工具列表（覆盖默认配置）")


class SessionUpdateRequest(BaseModel):
    """更新会话请求"""
    title: Optional[str] = Field(None, max_length=200, description="会话标题")
    stock_code: Optional[str] = Field(None, description="关联股票代码")
    current_agent_config: Optional[dict] = Field(None, description="更新会话的 Agent 配置")


# === SSE 流式对话 ===

@router.post("/send")
async def chat_send(request: ChatSendRequest):
    """
    发送消息并获取 AI 流式回复（SSE）
    
    AI 会根据用户输入自主决定是否调用投研工具获取数据。
    
    SSE 事件类型:
    - session: 会话信息
    - tool_call: AI 正在调用工具
    - tool_result: 工具执行结果
    - token: AI 回复文本片段
    - done: 回复完成
    - error: 错误信息
    """
    def event_generator():
        try:
            svc = ChatService()
            for event in svc.stream_chat(
                message=request.message,
                session_id=request.session_id,
                stock_code=request.stock_code,
                model_name=request.model_name,
                agent_id=request.agent_id,
                tools=request.tools
            ):
                event_type = event.get("event", "message")
                data = json.dumps(event.get("data", {}), ensure_ascii=False)
                yield f"event: {event_type}\ndata: {data}\n\n"
        except Exception as e:
            logger.error(f"[Chat SSE] 流式对话错误: {e}", exc_info=True)
            error_data = json.dumps({"message": str(e)[:200]}, ensure_ascii=False)
            yield f"event: error\ndata: {error_data}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Nginx 兼容
        }
    )


# === 会话管理 ===

@router.get("/sessions")
async def list_sessions(
    limit: int = Query(50, ge=1, le=200, description="返回数量"),
    offset: int = Query(0, ge=0, description="偏移量"),
):
    """获取会话列表"""
    svc = ChatService()
    sessions = svc.get_sessions(limit=limit, offset=offset)
    return {"sessions": sessions, "total": len(sessions)}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    """获取会话详情（含消息列表）"""
    svc = ChatService()
    detail = svc.get_session_detail(session_id)
    if not detail:
        raise HTTPException(status_code=404, detail="会话不存在")
    return detail


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """删除指定会话"""
    svc = ChatService()
    success = svc.delete_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"success": True, "message": "会话已删除"}


@router.patch("/sessions/{session_id}")
async def update_session(session_id: str, request: SessionUpdateRequest):
    """更新会话信息"""
    svc = ChatService()
    update_data = request.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="无更新内容")
    
    result = svc.update_session(session_id, **update_data)
    if not result:
        raise HTTPException(status_code=404, detail="会话不存在")
    return result
