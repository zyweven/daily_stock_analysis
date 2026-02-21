# -*- coding: utf-8 -*-
"""
===================================
Tool Registry - Tool Registration Center
===================================

Responsibilities:
1. Maintain a global registry of all available tools
2. Provide tool metadata queries
3. Execute tools by name
4. Support @tool decorator auto-registration
"""

import logging
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class ToolDefinition:
    """
    Tool definition wrapper containing both metadata and executable function.
    """

    def __init__(
        self,
        name: str,
        description: str,
        parameters: Dict[str, Any],
        func: Callable,
        required_params: Optional[List[str]] = None,
        config_schema: Optional[Dict[str, Any]] = None,
    ):
        self.name = name
        self.description = description
        self.parameters = parameters
        self.func = func
        self.required_params = required_params or []
        self.config_schema = config_schema or {}

    def to_openai_schema(self) -> Dict[str, Any]:
        """
        Convert to OpenAI Function Calling format.
        """
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": self.parameters,
                    "required": self.required_params,
                },
            },
        }

    def to_api_schema(self) -> Dict[str, Any]:
        """
        Convert to API response format including config schema.
        """
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": self.parameters,
                    "required": self.required_params,
                },
                "config_schema": self.config_schema,
            },
        }

    def execute(self, **kwargs) -> str:
        """
        Execute the tool function with given arguments.
        """
        return self.func(**kwargs)


class ToolRegistry:
    """
    Global tool registry - singleton pattern.

    Maintains a mapping of tool names to ToolDefinition objects.
    Supports auto-registration via @tool decorator.
    """

    _instance: Optional["ToolRegistry"] = None
    _tools: Dict[str, ToolDefinition] = {}
    _initialized: bool = False

    def __new__(cls) -> "ToolRegistry":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        # Avoid re-initialization
        pass

    @classmethod
    def _ensure_initialized(cls):
        """Ensure the registry dict is initialized."""
        if cls._tools is None:
            cls._tools = {}

    @classmethod
    def register(
        cls,
        name: str,
        description: str,
        parameters: Dict[str, Any],
        func: Callable,
        required_params: Optional[List[str]] = None,
        config_schema: Optional[Dict[str, Any]] = None,
    ) -> ToolDefinition:
        """
        Register a tool to the global registry.

        Args:
            name: Tool name (unique identifier)
            description: Tool description for LLM
            parameters: JSON Schema properties for parameters
            func: Callable function to execute
            required_params: List of required parameter names
            config_schema: Optional configuration schema for tool settings

        Returns:
            ToolDefinition: The registered tool definition
        """
        cls._ensure_initialized()

        if name in cls._tools:
            logger.warning(f"Tool '{name}' is already registered, overwriting.")

        tool_def = ToolDefinition(
            name=name,
            description=description,
            parameters=parameters,
            func=func,
            required_params=required_params,
            config_schema=config_schema,
        )
        cls._tools[name] = tool_def
        logger.debug(f"Registered tool: {name}")
        return tool_def

    @classmethod
    def get_tool(cls, name: str) -> Optional[ToolDefinition]:
        """
        Get a tool definition by name.

        Args:
            name: Tool name

        Returns:
            ToolDefinition if found, None otherwise
        """
        cls._ensure_initialized()
        return cls._tools.get(name)

    @classmethod
    def get_all_tools(cls) -> List[Dict[str, Any]]:
        """
        Get all registered tools in OpenAI Function Calling format.

        Returns:
            List of tool schemas
        """
        cls._ensure_initialized()
        return [tool.to_openai_schema() for tool in cls._tools.values()]

    @classmethod
    def get_all_tools_with_config(cls) -> List[Dict[str, Any]]:
        """
        Get all registered tools with their config schemas for API.

        Returns:
            List of tool schemas including config_schema
        """
        cls._ensure_initialized()
        return [tool.to_api_schema() for tool in cls._tools.values()]

    @classmethod
    def get_tool_map(cls) -> Dict[str, Dict[str, Any]]:
        """
        Get a mapping of tool names to their OpenAI schemas.

        Returns:
            Dict[str, Dict]: {tool_name: openai_schema}
        """
        cls._ensure_initialized()
        return {name: tool.to_openai_schema() for name, tool in cls._tools.items()}

    @classmethod
    def validate_tools(cls, tool_names: List[str]) -> List[str]:
        """
        Validate a list of tool names and return only valid ones.

        Args:
            tool_names: List of tool names to validate

        Returns:
            List of valid tool names
        """
        cls._ensure_initialized()
        valid_names = set(cls._tools.keys())
        valid = [name for name in tool_names if name in valid_names]
        invalid = [name for name in tool_names if name not in valid_names]
        if invalid:
            logger.warning(f"Invalid tool names filtered: {invalid}")
        return valid

    @classmethod
    def execute(cls, name: str, arguments: Dict[str, Any], config: Optional[Dict[str, Any]] = None) -> str:
        """
        Execute a tool by name with given arguments.

        Args:
            name: Tool name
            arguments: Tool arguments dict
            config: Optional tool configuration dict

        Returns:
            Tool execution result as string (JSON)

        Raises:
            ValueError: If tool not found
            Exception: Tool execution error (propagated from tool)
        """
        cls._ensure_initialized()
        tool = cls._tools.get(name)
        if not tool:
            raise ValueError(f"Tool not found: {name}")

        logger.debug(f"Executing tool '{name}' with args: {arguments}, config: {config}")

        # If config is provided, pass it as _tool_config parameter
        if config:
            return tool.execute(**arguments, _tool_config=config)

        return tool.execute(**arguments)

    @classmethod
    def list_tools(cls) -> List[str]:
        """
        Get a list of all registered tool names.

        Returns:
            List of tool names
        """
        cls._ensure_initialized()
        return list(cls._tools.keys())

    @classmethod
    def clear(cls):
        """
        Clear all registered tools. Mainly for testing purposes.
        """
        cls._tools.clear()
        logger.debug("Tool registry cleared")


# Global registry instance for convenient access
registry = ToolRegistry()
