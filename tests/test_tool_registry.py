# -*- coding: utf-8 -*-
"""
===================================
Tests for ToolRegistry and @tool Decorator
===================================

Run tests:
    cd e:\project\daily_stock_analysis
    python -m pytest tests/test_tool_registry.py -v
"""

import json
import pytest
from typing import List, Optional

from src.services.tool_registry import ToolRegistry, ToolDefinition
from src.services.tool_decorator import tool


class TestToolRegistry:
    """Test suite for ToolRegistry class."""

    def setup_method(self):
        """Clear registry before each test."""
        ToolRegistry.clear()

    def test_register_and_get_tool(self):
        """Test registering a tool and retrieving it."""
        def sample_func(param1: str, param2: int = 10) -> str:
            return f"{param1}: {param2}"

        ToolRegistry.register(
            name="test_tool",
            description="A test tool",
            parameters={"param1": {"type": "string"}, "param2": {"type": "integer"}},
            func=sample_func,
            required_params=["param1"]
        )

        tool_def = ToolRegistry.get_tool("test_tool")
        assert tool_def is not None
        assert tool_def.name == "test_tool"
        assert tool_def.description == "A test tool"
        assert tool_def.required_params == ["param1"]

    def test_get_all_tools(self):
        """Test getting all registered tools."""
        def func1() -> str:
            return "result1"

        def func2() -> str:
            return "result2"

        ToolRegistry.register("tool1", "Tool 1", {}, func1)
        ToolRegistry.register("tool2", "Tool 2", {}, func2)

        tools = ToolRegistry.get_all_tools()
        assert len(tools) == 2

        tool_names = [t["function"]["name"] for t in tools]
        assert "tool1" in tool_names
        assert "tool2" in tool_names

    def test_get_tool_map(self):
        """Test getting tool map."""
        def sample_func() -> str:
            return "test"

        ToolRegistry.register("map_test", "Map Test", {}, sample_func)

        tool_map = ToolRegistry.get_tool_map()
        assert "map_test" in tool_map
        assert tool_map["map_test"]["function"]["name"] == "map_test"

    def test_validate_tools(self):
        """Test tool name validation."""
        def sample_func() -> str:
            return "test"

        ToolRegistry.register("valid_tool", "Valid Tool", {}, sample_func)

        valid = ToolRegistry.validate_tools(["valid_tool", "invalid_tool"])
        assert "valid_tool" in valid
        assert "invalid_tool" not in valid

    def test_execute_tool(self):
        """Test tool execution."""
        def greet(name: str, greeting: str = "Hello") -> str:
            return json.dumps({"message": f"{greeting}, {name}!"})

        ToolRegistry.register(
            name="greet",
            description="Greet someone",
            parameters={"name": {"type": "string"}, "greeting": {"type": "string"}},
            func=greet,
            required_params=["name"]
        )

        result = ToolRegistry.execute("greet", {"name": "World", "greeting": "Hi"})
        parsed = json.loads(result)
        assert parsed["message"] == "Hi, World!"

    def test_execute_nonexistent_tool(self):
        """Test executing a non-existent tool raises error."""
        with pytest.raises(ValueError) as exc_info:
            ToolRegistry.execute("nonexistent", {})
        assert "not found" in str(exc_info.value)

    def test_list_tools(self):
        """Test listing all tool names."""
        def func1() -> str:
            return "1"

        def func2() -> str:
            return "2"

        ToolRegistry.register("list1", "List 1", {}, func1)
        ToolRegistry.register("list2", "List 2", {}, func2)

        names = ToolRegistry.list_tools()
        assert "list1" in names
        assert "list2" in names
        assert len(names) == 2

    def test_clear_registry(self):
        """Test clearing the registry."""
        def sample_func() -> str:
            return "test"

        ToolRegistry.register("to_clear", "To Clear", {}, sample_func)
        assert ToolRegistry.get_tool("to_clear") is not None

        ToolRegistry.clear()
        assert ToolRegistry.get_tool("to_clear") is None
        assert len(ToolRegistry.list_tools()) == 0


class TestToolDecorator:
    """Test suite for @tool decorator."""

    def setup_method(self):
        """Clear registry before each test."""
        ToolRegistry.clear()

    def test_basic_decorator(self):
        """Test basic @tool decorator functionality."""
        @tool()
        def basic_tool(param: str) -> str:
            """A basic tool."""
            return f"Result: {param}"

        # Check registration
        registered = ToolRegistry.get_tool("basic_tool")
        assert registered is not None
        assert registered.name == "basic_tool"
        assert "basic" in registered.description.lower()

    def test_decorator_with_description(self):
        """Test @tool with explicit description."""
        @tool(description="Custom description override")
        def described_tool() -> str:
            """This description should be overridden."""
            return "done"

        registered = ToolRegistry.get_tool("described_tool")
        assert registered.description == "Custom description override"

    def test_decorator_with_name_override(self):
        """Test @tool with name override."""
        @tool(name="custom_name")
        def original_name() -> str:
            """Original name tool."""
            return "done"

        # Should be registered under custom name
        assert ToolRegistry.get_tool("custom_name") is not None
        assert ToolRegistry.get_tool("original_name") is None

    def test_type_extraction(self):
        """Test parameter type extraction from type hints."""
        @tool()
        def typed_tool(
            text: str,
            count: int,
            price: float,
            flag: bool,
            items: List[str],
            extra: Optional[str] = None
        ) -> str:
            """Tool with typed parameters."""
            return "done"

        registered = ToolRegistry.get_tool("typed_tool")
        schema = registered.to_openai_schema()
        params = schema["function"]["parameters"]["properties"]

        assert params["text"]["type"] == "string"
        assert params["count"]["type"] == "integer"
        assert params["price"]["type"] == "number"
        assert params["flag"]["type"] == "boolean"
        assert params["items"]["type"] == "array"
        # Optional[str] should resolve to string
        assert params["extra"]["type"] == "string"

    def test_required_params_detection(self):
        """Test detection of required vs optional parameters."""
        @tool()
        def required_test(
            mandatory: str,
            optional: int = 10
        ) -> str:
            """Tool with required and optional params."""
            return "done"

        registered = ToolRegistry.get_tool("required_test")
        assert "mandatory" in registered.required_params
        assert "optional" not in registered.required_params

    def test_decorator_preserves_function(self):
        """Test that decorator preserves original function behavior."""
        @tool()
        def calculator(a: int, b: int) -> str:
            """Calculate sum."""
            return json.dumps({"result": a + b})

        # Test that the decorated function still works
        result = calculator(2, 3)
        parsed = json.loads(result)
        assert parsed["result"] == 5

    def test_parameter_description_extraction(self):
        """Test extracting parameter descriptions from docstring."""
        @tool()
        def documented_tool(
            stock_code: str,
            days: int = 30
        ) -> str:
            """
            Get stock data.

            Args:
                stock_code: The stock code like 600519
                days: Number of days to fetch
            """
            return json.dumps({"code": stock_code, "days": days})

        registered = ToolRegistry.get_tool("documented_tool")
        schema = registered.to_openai_schema()
        params = schema["function"]["parameters"]["properties"]

        assert "stock code" in params["stock_code"].get("description", "").lower()
        assert "number of days" in params["days"].get("description", "").lower()

    def test_openai_schema_format(self):
        """Test that generated schema matches OpenAI Function Calling format."""
        @tool()
        def openai_format_test(query: str, max_results: int = 10) -> str:
            """Test OpenAI format compatibility."""
            return "done"

        registered = ToolRegistry.get_tool("openai_format_test")
        schema = registered.to_openai_schema()

        # Verify OpenAI format structure
        assert schema["type"] == "function"
        assert "function" in schema
        assert "name" in schema["function"]
        assert "description" in schema["function"]
        assert "parameters" in schema["function"]
        assert schema["function"]["parameters"]["type"] == "object"
        assert "properties" in schema["function"]["parameters"]
        assert "required" in schema["function"]["parameters"]


class TestToolIntegration:
    """Integration tests for the complete tool system."""

    def setup_method(self):
        """Clear registry before each test."""
        ToolRegistry.clear()

    def test_full_workflow(self):
        """Test complete tool registration and execution workflow."""
        @tool(description="Search for information")
        def search(query: str, limit: int = 10) -> str:
            """
            Search tool.

            Args:
                query: Search query string
                limit: Maximum results to return
            """
            results = [{"title": f"Result {i}"} for i in range(limit)]
            return json.dumps({"query": query, "results": results})

        # Verify registration
        assert "search" in ToolRegistry.list_tools()

        # Verify schema
        schema = ToolRegistry.get_tool_map()["search"]
        assert schema["function"]["name"] == "search"

        # Execute tool
        result = ToolRegistry.execute("search", {"query": "test", "limit": 3})
        parsed = json.loads(result)
        assert parsed["query"] == "test"
        assert len(parsed["results"]) == 3


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
