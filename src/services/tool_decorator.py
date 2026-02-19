# -*- coding: utf-8 -*-
"""
===================================
@tool Decorator - Automatic Tool Registration
===================================

Provides the @tool decorator to automatically:
1. Extract function signature and docstring
2. Generate OpenAI Function Calling schema
3. Register to ToolRegistry

Usage:
    @tool(description="Optional override description")
    def my_tool(param1: str, param2: int = 10) -> str:
        '''Tool description here.'''
        return result
"""

import inspect
import logging
from functools import wraps
from typing import Any, Callable, Dict, List, Optional, Type, Union, get_type_hints

from src.services.tool_registry import ToolRegistry

logger = logging.getLogger(__name__)

# Type mapping from Python types to JSON Schema types
TYPE_MAPPING = {
    str: "string",
    int: "integer",
    float: "number",
    bool: "boolean",
    list: "array",
    dict: "object",
    List: "array",
    Dict: "object",
    Any: "object",
}


def _get_json_schema_type(py_type: Type) -> str:
    """
    Convert Python type to JSON Schema type.

    Args:
        py_type: Python type annotation

    Returns:
        JSON Schema type string
    """
    # Handle Optional[T] which is Union[T, None]
    origin = getattr(py_type, "__origin__", None)
    if origin is Union:
        # Get the first non-None type from Union
        args = getattr(py_type, "__args__", ())
        for arg in args:
            if arg is not type(None):
                py_type = arg
                break

    # Handle List[T] and Dict[K, V]
    if origin is list or origin is List:
        return "array"
    if origin is dict or origin is Dict:
        return "object"

    return TYPE_MAPPING.get(py_type, "string")


def _extract_param_descriptions(func: Callable) -> Dict[str, str]:
    """
    Extract parameter descriptions from docstring.

    Supports Google-style and simple docstrings:
        Args:
            param1: Description here
            param2: Another description

    Returns:
        Dict mapping param names to descriptions
    """
    doc = inspect.getdoc(func) or ""
    descriptions = {}

    lines = doc.split("\n")
    in_args_section = False
    current_param = None

    for line in lines:
        stripped = line.strip()

        # Check for Args section
        if stripped in ("Args:", "Arguments:", "Parameters:"):
            in_args_section = True
            continue

        # End of Args section (new section starts)
        if in_args_section and stripped.endswith(":") and not stripped.startswith(" "):
            break

        # Parse arg line
        if in_args_section and stripped:
            # Match patterns like "param: description" or "param (type): description"
            if ":" in stripped:
                parts = stripped.split(":", 1)
                param_name = parts[0].strip().split()[0]  # Handle "param (type)" format
                param_desc = parts[1].strip()
                descriptions[param_name] = param_desc
                current_param = param_name
            elif current_param:
                # Continuation of previous param description
                descriptions[current_param] += " " + stripped

    return descriptions


def _build_parameters_schema(
    func: Callable,
    param_descs: Dict[str, str],
    type_hints: Dict[str, Type]
) -> tuple[Dict[str, Any], List[str]]:
    """
    Build JSON Schema parameters from function signature.

    Returns:
        Tuple of (properties dict, required params list)
    """
    sig = inspect.signature(func)
    properties = {}
    required = []

    for param_name, param in sig.parameters.items():
        # Skip return annotation if mistakenly included
        if param_name == "return":
            continue

        param_schema = {}

        # Get type from type hints
        if param_name in type_hints:
            param_schema["type"] = _get_json_schema_type(type_hints[param_name])
        else:
            param_schema["type"] = "string"  # Default type

        # Get description from docstring
        if param_name in param_descs:
            param_schema["description"] = param_descs[param_name]

        # Check if required (no default value)
        if param.default is inspect.Parameter.empty:
            required.append(param_name)

        properties[param_name] = param_schema

    return properties, required


def tool(
    description: Optional[str] = None,
    name: Optional[str] = None,
):
    """
    Decorator to register a function as an AI tool.

    Automatically extracts:
    - Function name (or override via name parameter)
    - Docstring as description (or override via description parameter)
    - Type hints for parameter types
    - Default values to determine required parameters

    Args:
        description: Optional override for tool description
        name: Optional override for tool name (default: function name)

    Returns:
        Decorated function (original function is preserved)

    Example:
        @tool()
        def get_stock_price(stock_code: str) -> str:
            '''Get the current price of a stock.'''
            return f"Price of {stock_code}"

        @tool(description="Search for latest news")
        def search_news(query: str, max_results: int = 10) -> str:
            '''Search news with optional result limit.'''
            return json.dumps(results)
    """
    def decorator(func: Callable) -> Callable:
        # Get function metadata
        func_name = name or func.__name__
        func_doc = inspect.getdoc(func) or ""
        tool_description = description or func_doc.split("\n\n")[0].strip() or f"Execute {func_name}"

        # Get type hints
        try:
            type_hints = get_type_hints(func)
        except Exception:
            type_hints = {}

        # Extract parameter descriptions from docstring
        param_descs = _extract_param_descriptions(func)

        # Build parameter schema
        properties, required = _build_parameters_schema(func, param_descs, type_hints)

        # Register to ToolRegistry
        ToolRegistry.register(
            name=func_name,
            description=tool_description,
            parameters=properties,
            func=func,
            required_params=required,
        )

        logger.debug(f"@tool decorator registered: {func_name}")

        # Return original function unchanged
        @wraps(func)
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)

        # Attach tool metadata for introspection
        wrapper._tool_name = func_name
        wrapper._tool_description = tool_description

        return wrapper

    return decorator


# Convenience function for programmatic registration
def register_tool(
    func: Optional[Callable] = None,
    *,
    description: Optional[str] = None,
    name: Optional[str] = None,
) -> Callable:
    """
    Programmatically register a function as a tool.

    Can be used as a function call or decorator:
        register_tool(my_function)

        @register_tool(description="My tool")
        def my_tool(): ...
    """
    def decorator(f: Callable) -> Callable:
        return tool(description=description, name=name)(f)

    if func is None:
        # Called with arguments: @register_tool(...)
        return decorator
    else:
        # Called without arguments: register_tool(func)
        return decorator(func)
