# -*- coding: utf-8 -*-
"""
===================================
AI 对话助手 - 核心服务层
===================================

职责：
1. 会话管理（创建、查询、删除）
2. 消息持久化
3. 基于 OpenAI 兼容 API 的流式对话（支持 Function Calling）
4. 多轮工具调用循环
"""

import json
import logging
import re
import time
import uuid
from datetime import datetime
from typing import Any, AsyncGenerator, Dict, List, Optional, Generator

from src.config import get_config
from src.storage import DatabaseManager, ChatSession, ChatMessage
from src.services.chat_tools import CHAT_TOOLS, execute_tool

logger = logging.getLogger(__name__)

# 最大工具调用轮数（防止无限循环）
MAX_TOOL_ROUNDS = 5

# 最大历史消息数（控制 Token 消耗）
MAX_HISTORY_MESSAGES = 20

# 对话系统提示词
CHAT_SYSTEM_PROMPT = """你是一个专业的 AI 投研助手，帮助用户分析股票、解读行情、回答投资相关问题。

你的核心能力：
1. **实时行情查询**：可以调用工具获取任何股票的最新价格和行情数据
2. **技术面分析**：可以获取K线数据和技术指标，分析走势趋势
3. **报告回顾**：可以查看历史分析报告，帮助用户理解之前的分析结论
4. **新闻搜索**：可以搜索最新新闻和公告，获取市场动态
5. **筹码分析**：可以获取A股筹码分布数据

使用规则：
- 当用户询问具体股票信息时，**主动调用相关工具获取数据**，不要凭空编造数据
- 回复时引用工具返回的真实数据，确保准确性
- 对于纯知识性问题（如"什么是换手率"），直接回答无需调用工具
- 使用简洁的 Markdown 格式回复
- 回答要专业但易懂，避免过度使用术语
- 投资建议需附带风险提示

重要提醒：
- 你不是理财顾问，不能做出投资承诺
- 你提供的是数据分析和信息整合，最终决策权在用户
- 涉及具体操作建议时，务必提醒用户注意风险
"""


def _sanitize_tool_args(raw_args: str) -> str:
    """
    清理工具调用参数（修复某些 LLM 提供商返回的重复 JSON 问题）
    
    例如: '{"stock_code":"RDW"}{"stock_code":"RDW"}' -> '{"stock_code":"RDW"}'
    """
    raw_args = raw_args.strip()
    if not raw_args:
        return '{}'
    
    # 尝试直接解析
    try:
        json.loads(raw_args)
        return raw_args
    except json.JSONDecodeError:
        pass
    
    # 尝试提取第一个完整 JSON 对象
    brace_count = 0
    start = -1
    for i, ch in enumerate(raw_args):
        if ch == '{':
            if brace_count == 0:
                start = i
            brace_count += 1
        elif ch == '}':
            brace_count -= 1
            if brace_count == 0 and start >= 0:
                candidate = raw_args[start:i+1]
                try:
                    json.loads(candidate)
                    return candidate
                except json.JSONDecodeError:
                    pass
    
    logger.warning(f"[工具参数清理] 无法解析参数: {raw_args[:200]}")
    return '{}'


class ChatService:
    """AI 对话服务"""
    
    def __init__(self):
        self._db = DatabaseManager()
    
    # ==========================================
    # 会话管理
    # ==========================================
    
    def get_sessions(self, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """获取会话列表（按更新时间倒序）"""
        with self._db.get_session() as session:
            query = session.query(ChatSession)\
                .order_by(ChatSession.updated_at.desc())\
                .offset(offset)\
                .limit(limit)
            return [s.to_dict() for s in query.all()]
    
    def get_session_detail(self, session_id: str) -> Optional[Dict[str, Any]]:
        """获取会话详情（含消息列表）"""
        with self._db.get_session() as session:
            chat_session = session.query(ChatSession).get(session_id)
            if not chat_session:
                return None
            
            messages = session.query(ChatMessage)\
                .filter(ChatMessage.session_id == session_id)\
                .order_by(ChatMessage.created_at.asc())\
                .all()
            
            result = chat_session.to_dict()
            result['messages'] = [m.to_dict() for m in messages]
            return result
    
    def delete_session(self, session_id: str) -> bool:
        """删除会话（CASCADE 自动清理消息）"""
        with self._db.get_session() as session:
            chat_session = session.query(ChatSession).get(session_id)
            if not chat_session:
                return False
            session.delete(chat_session)
            session.commit()
            return True
    
    def update_session(self, session_id: str, **kwargs) -> Optional[Dict[str, Any]]:
        """更新会话信息"""
        with self._db.get_session() as session:
            chat_session = session.query(ChatSession).get(session_id)
            if not chat_session:
                return None
            for key, value in kwargs.items():
                if hasattr(chat_session, key) and key not in ('id', 'created_at'):
                    setattr(chat_session, key, value)
            session.commit()
            session.refresh(chat_session)
            return chat_session.to_dict()
    
    def _create_session(self, stock_code: Optional[str] = None, 
                        model_name: Optional[str] = None) -> str:
        """创建新会话，返回 session_id"""
        session_id = str(uuid.uuid4())
        with self._db.get_session() as session:
            chat_session = ChatSession(
                id=session_id,
                title='新对话',
                stock_code=stock_code,
                model_name=model_name,
                message_count=0,
            )
            session.add(chat_session)
            session.commit()
        return session_id
    
    def _save_message(self, session_id: str, role: str, content: str,
                      tool_name: Optional[str] = None,
                      tool_args: Optional[str] = None,
                      model_name: Optional[str] = None,
                      token_count: Optional[int] = None,
                      response_time_ms: Optional[int] = None) -> int:
        """保存消息到数据库，返回 message_id"""
        with self._db.get_session() as session:
            msg = ChatMessage(
                session_id=session_id,
                role=role,
                content=content,
                tool_name=tool_name,
                tool_args=tool_args,
                model_name=model_name,
                token_count=token_count,
                response_time_ms=response_time_ms,
            )
            session.add(msg)
            
            # 更新会话消息计数和时间
            chat_session = session.query(ChatSession).get(session_id)
            if chat_session:
                chat_session.message_count = (chat_session.message_count or 0) + 1
                chat_session.updated_at = datetime.now()
            
            session.commit()
            session.refresh(msg)
            return msg.id
    
    def _update_session_title(self, session_id: str, user_message: str):
        """从用户首条消息自动生成会话标题"""
        title = user_message[:50].strip()
        if len(user_message) > 50:
            title += '...'
        with self._db.get_session() as session:
            chat_session = session.query(ChatSession).get(session_id)
            if chat_session and chat_session.title == '新对话':
                chat_session.title = title
                session.commit()
    
    def _get_history_messages(self, session_id: str) -> List[Dict[str, str]]:
        """获取历史消息，转换为 OpenAI messages 格式"""
        with self._db.get_session() as session:
            messages = session.query(ChatMessage)\
                .filter(ChatMessage.session_id == session_id)\
                .order_by(ChatMessage.created_at.asc())\
                .limit(MAX_HISTORY_MESSAGES * 2)\
                .all()
            
            result = []
            for msg in messages:
                if msg.role in ('user', 'assistant'):
                    result.append({"role": msg.role, "content": msg.content})
                # tool_call 和 tool_result 不加入历史（避免格式冲突）
            
            # 保留最近 N 条
            if len(result) > MAX_HISTORY_MESSAGES:
                result = result[-MAX_HISTORY_MESSAGES:]
            
            return result

    # ==========================================
    # 流式对话核心
    # ==========================================
    
    def stream_chat(self, message: str,
                    session_id: Optional[str] = None,
                    stock_code: Optional[str] = None,
                    model_name: Optional[str] = None) -> Generator[Dict[str, Any], None, None]:
        """
        流式对话（同步 Generator）
        
        Yields:
            SSE 事件字典: {"event": "...", "data": {...}}
        """
        start_time = time.time()
        
        # 1. 创建或获取会话
        is_new_session = False
        if not session_id:
            session_id = self._create_session(stock_code, model_name)
            is_new_session = True
        
        yield {"event": "session", "data": {"session_id": session_id, "is_new": is_new_session}}
        
        # 2. 保存用户消息
        user_msg_id = self._save_message(session_id, 'user', message)
        
        # 3. 自动更新标题
        if is_new_session:
            self._update_session_title(session_id, message)
        
        # 4. 更新会话的股票和模型
        update_kwargs = {}
        if stock_code:
            update_kwargs['stock_code'] = stock_code
        if model_name:
            update_kwargs['model_name'] = model_name
        if update_kwargs:
            self.update_session(session_id, **update_kwargs)
        
        # 5. 构建 OpenAI 消息列表
        history = self._get_history_messages(session_id)
        # 用最新消息替换（历史中可能还没有刚保存的）
        if history and history[-1].get('content') == message:
            pass  # 已包含
        else:
            history.append({"role": "user", "content": message})
        
        openai_messages = [
            {"role": "system", "content": CHAT_SYSTEM_PROMPT},
            *history
        ]
        
        # 6. 初始化 OpenAI 客户端
        try:
            client, actual_model = self._get_openai_client(model_name)
        except Exception as e:
            yield {"event": "error", "data": {"message": f"模型初始化失败: {str(e)}"}}
            return
        
        # 7. 多轮工具调用循环
        full_response = ""
        total_tool_calls = 0
        
        for round_idx in range(MAX_TOOL_ROUNDS + 1):
            try:
                use_tools = round_idx < MAX_TOOL_ROUNDS
                
                if use_tools:
                    # 工具调用轮次：使用非流式调用，避免部分提供商参数粘连 bug
                    response = client.chat.completions.create(
                        model=actual_model,
                        messages=openai_messages,
                        tools=CHAT_TOOLS,
                        temperature=0.7,
                        stream=False,
                    )
                    
                    choice = response.choices[0]
                    
                    # 有工具调用
                    if choice.finish_reason == 'tool_calls' and choice.message.tool_calls:
                        # 构建 assistant tool_calls message（原样回传）
                        tool_calls_msg = {
                            "role": "assistant",
                            "content": choice.message.content,
                            "tool_calls": [
                                {
                                    "id": tc.id,
                                    "type": "function",
                                    "function": {
                                        "name": tc.function.name,
                                        "arguments": _sanitize_tool_args(tc.function.arguments)
                                    }
                                }
                                for tc in choice.message.tool_calls
                            ]
                        }
                        openai_messages.append(tool_calls_msg)
                        
                        # 逐个执行工具
                        for tc in choice.message.tool_calls:
                            tool_name = tc.function.name
                            sanitized_args = _sanitize_tool_args(tc.function.arguments)
                            try:
                                tool_args = json.loads(sanitized_args)
                            except json.JSONDecodeError:
                                tool_args = {}
                            
                            total_tool_calls += 1
                            
                            # 通知前端
                            yield {"event": "tool_call", "data": {
                                "name": tool_name,
                                "args": tool_args,
                                "round": round_idx + 1
                            }}
                            
                            # 执行工具
                            tool_result = execute_tool(tool_name, tool_args)
                            
                            # 保存工具调用和结果
                            self._save_message(session_id, 'tool_call', tool_name,
                                              tool_name=tool_name,
                                              tool_args=json.dumps(tool_args, ensure_ascii=False))
                            self._save_message(session_id, 'tool_result', tool_result,
                                              tool_name=tool_name)
                            
                            # 通知前端工具结果
                            yield {"event": "tool_result", "data": {
                                "name": tool_name,
                                "result": tool_result[:500]
                            }}
                            
                            # 将工具结果加入 messages
                            openai_messages.append({
                                "role": "tool",
                                "tool_call_id": tc.id,
                                "content": tool_result
                            })
                        
                        logger.info(f"[对话] 第 {round_idx + 1} 轮工具调用完成，共 {len(choice.message.tool_calls)} 个工具")
                        continue
                    
                    # 无工具调用，直接获取文本回复
                    if choice.message.content:
                        full_response = choice.message.content
                        # 模拟逐段发送给前端（改善体验）
                        chunk_size = 20
                        for i in range(0, len(full_response), chunk_size):
                            yield {"event": "token", "data": {"content": full_response[i:i+chunk_size]}}
                    break
                
                else:
                    # 最后一轮（或无工具）：流式输出最终回复
                    response = client.chat.completions.create(
                        model=actual_model,
                        messages=openai_messages,
                        temperature=0.7,
                        stream=True,
                    )
                    
                    for chunk in response:
                        if not chunk.choices:
                            continue
                        delta = chunk.choices[0].delta
                        if delta.content:
                            full_response += delta.content
                            yield {"event": "token", "data": {"content": delta.content}}
                        if chunk.choices[0].finish_reason == "stop":
                            break
                    break
                
            except Exception as e:
                error_msg = str(e)
                logger.error(f"[对话] LLM 调用失败: {error_msg}", exc_info=True)
                yield {"event": "error", "data": {"message": f"AI 回复失败: {error_msg[:200]}"}}
                return
        
        # 8. 保存 AI 回复
        elapsed_ms = int((time.time() - start_time) * 1000)
        if full_response:
            ai_msg_id = self._save_message(
                session_id, 'assistant', full_response,
                model_name=actual_model,
                response_time_ms=elapsed_ms,
            )
        else:
            ai_msg_id = None
        
        # 9. 发送完成事件
        yield {"event": "done", "data": {
            "session_id": session_id,
            "message_id": ai_msg_id,
            "tool_calls_count": total_tool_calls,
            "response_time_ms": elapsed_ms,
        }}
    
    def _get_openai_client(self, model_name: Optional[str] = None):
        """
        获取 OpenAI 兼容客户端
        
        支持两种模式：
        1. model_name 匹配多模型配置 -> 使用对应配置的 api_key/base_url
        2. 否则使用系统默认 OpenAI 配置
        
        Returns:
            (client, actual_model_name)
        """
        from openai import OpenAI
        import httpx
        
        config = get_config()
        
        # 尝试从多模型配置中查找
        if model_name:
            try:
                from src.expert_panel import parse_model_configs
                for mc in parse_model_configs():
                    if mc.name == model_name or mc.model_name == model_name:
                        client_kwargs = {"api_key": mc.api_key}
                        if mc.base_url and mc.base_url.startswith('http'):
                            client_kwargs["base_url"] = mc.base_url
                        http_client = httpx.Client(verify=getattr(mc, 'verify_ssl', config.openai_verify_ssl))
                        client_kwargs["http_client"] = http_client
                        client = OpenAI(**client_kwargs)
                        logger.info(f"[对话] 使用多模型配置: {mc.name} ({mc.model_name})")
                        return client, mc.model_name
            except Exception as e:
                logger.debug(f"[对话] 多模型配置查找失败，回退默认: {e}")
        
        # 回退到默认配置
        api_key = config.openai_api_key
        base_url = config.openai_base_url
        actual_model = model_name or config.openai_model
        verify_ssl = config.openai_verify_ssl
        
        if not api_key or api_key.startswith('your_') or len(api_key) < 10:
            raise ValueError("OpenAI API Key 未配置，请在设置页面配置")
        
        client_kwargs = {"api_key": api_key}
        if base_url and base_url.startswith('http'):
            client_kwargs["base_url"] = base_url
        
        http_client = httpx.Client(verify=verify_ssl)
        client_kwargs["http_client"] = http_client
        
        client = OpenAI(**client_kwargs)
        return client, actual_model
