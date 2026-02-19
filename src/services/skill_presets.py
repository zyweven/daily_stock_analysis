# -*- coding: utf-8 -*-
"""
===================================
Skill Presets - Built-in Skill Definitions
===================================

Define BUILTIN_SKILLS list, each Skill contains:
- id, name, description, icon
- prompt_template: Instructions appended to System Prompt
- tool_bindings: Recommended tools for this skill
- category: For frontend grouping

Usage:
    from src.services.skill_presets import BUILTIN_SKILLS, get_builtin_skill
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class SkillPreset(BaseModel):
    """
    Skill preset data model.

    A Skill is a modular "tool usage guide" that can be combined into Agents.
    The same tool can have different usage patterns in different Skills.
    """
    id: str = Field(..., description="Unique identifier, e.g., 'stock_news_research'")
    name: str = Field(..., description="Display name, e.g., 'Stock News Analysis'")
    description: str = Field(..., description="Brief description of what this skill does")
    icon: str = Field(default="🔧", description="Icon emoji or URL for UI display")
    category: str = Field(default="general", description="Category for grouping: stock/travel/code/general")

    # Core capability definition
    prompt_template: str = Field(..., description="Instructions for how to use the tools")
    tool_bindings: List[Dict[str, Any]] = Field(default_factory=list, description="Tools this skill uses")

    # Metadata
    version: str = Field(default="1.0", description="Skill version")
    is_builtin: bool = Field(default=True, description="Whether this is a built-in skill")

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "icon": self.icon,
            "category": self.category,
            "prompt_template": self.prompt_template,
            "tool_bindings": self.tool_bindings,
            "version": self.version,
            "is_builtin": self.is_builtin,
        }


# === Built-in Skills Library ===

BUILTIN_SKILLS: List[SkillPreset] = [
    # === Stock Analysis Category ===
    SkillPreset(
        id="stock_technical_analysis",
        name="技术分析",
        description="基于K线、均线、MACD等技术指标进行走势分析",
        icon="📈",
        category="stock",
        prompt_template="""When performing technical analysis, follow these professional guidelines:

1. **Moving Average Analysis**:
   - Bullish arrangement (uptrend): Close > MA5 > MA10 > MA20
   - Bearish arrangement (downtrend): Close < MA5 < MA10 < MA20
   - Consolidation: Price oscillating around MAs

2. **Volume Confirmation**:
   - Rising price + Rising volume = Strong trend confirmation
   - Rising price + Falling volume = Weak trend, potential reversal

3. **Key Levels**:
   - Identify support (recent lows, MA20)
   - Identify resistance (recent highs, MA5/MA10)

4. **Signal Quality**:
   - Combine at least 2-3 indicators for confirmation
   - Avoid trading against the primary trend
   - Note divergence signals (price vs MACD)

Always provide specific price levels and trend direction assessment.""",
        tool_bindings=[
            {"tool_name": "get_technical_summary", "description": "Get technical indicators and trend data"},
            {"tool_name": "get_realtime_quote", "description": "Get current price and basic stats"},
        ],
    ),

    SkillPreset(
        id="stock_news_research",
        name="新闻舆情",
        description="搜索和解读股票相关新闻、公告、研报",
        icon="📰",
        category="stock",
        prompt_template="""When researching news and sentiment for stocks:

1. **Search Strategy**:
   - Use search_news tool with queries like: "{stock_name} 最新消息 公告"
   - Search for: company announcements, earnings reports, industry news

2. **Information Prioritization**:
   - 🔴 HIGH: Exchange announcements, earnings reports, major contracts
   - 🟡 MEDIUM: Analyst reports, industry trends
   - 🟢 LOW: Media coverage, forum discussions

3. **Analysis Framework**:
   - Distinguish FACTS from OPINIONS
   - Assess timeliness and relevance
   - Evaluate potential impact (short-term vs long-term)
   - Identify positive/negative catalysts

4. **Source Reliability**:
   - Official announcements > Analyst reports > Media coverage
   - Cross-verify significant claims
   - Note any disclaimers or conflicts of interest

Always cite your sources and indicate confidence level.""",
        tool_bindings=[
            {"tool_name": "search_news", "description": "Search for latest news and announcements"},
            {"tool_name": "get_latest_report", "description": "Get previous AI analysis reports"},
        ],
    ),

    SkillPreset(
        id="stock_chip_analysis",
        name="筹码分析",
        description="分析筹码分布、套牢盘、主力成本",
        icon="🎯",
        category="stock",
        prompt_template="""When analyzing chip distribution and cost structure:

1. **Key Metrics**:
   - Profit ratio: % of holders in profit
   - Concentration: Lower = more dispersed, Higher = more concentrated
   - Average cost: Reference point for support/resistance

2. **Interpretation**:
   - High profit ratio (>80%): Risk of profit-taking pressure
   - Low profit ratio (<20%): Potential bottoming, limited downside
   - Concentrated chips (<15%): Easier to move, watch for manipulation

3. **Trading Implications**:
   - Price near average cost: Balanced, watch for breakout
   - Price far above cost: Overbought risk
   - Price far below cost: Potential rebound opportunity

Note: This tool is only available for A-shares.""",
        tool_bindings=[
            {"tool_name": "get_chip_distribution", "description": "Get chip distribution data"},
            {"tool_name": "get_realtime_quote", "description": "Get current price for comparison"},
        ],
    ),

    SkillPreset(
        id="stock_risk_management",
        name="风险管理",
        description="仓位控制、止损设置、风险评估",
        icon="🛡️",
        category="stock",
        prompt_template="""When providing investment advice, you MUST include risk management:

1. **Stop Loss Rules**:
   - Technical stop: Below recent support/MA20
   - Percentage stop: Maximum 5-8% loss per trade
   - Time stop: Exit if thesis doesn't play out in expected timeframe

2. **Position Sizing**:
   - Never risk more than 5% of portfolio on single trade
   - Reduce size in volatile markets
   - Scale in gradually, don't go all-in at once

3. **Risk Assessment**:
   - Market environment (bull/bear/sideways)
   - Sector rotation risk
   - Individual stock volatility (check beta)

4. **Portfolio Context**:
   - Consider existing positions
   - Avoid over-concentration in one sector
   - Maintain cash cushion (10-30%)

Always clearly state: This is not financial advice. Investment involves risk.""",
        tool_bindings=[
            {"tool_name": "get_technical_summary", "description": "Get volatility and trend data"},
            {"tool_name": "get_chip_distribution", "description": "Assess holder structure risk"},
        ],
    ),

    # === General Research Category ===
    SkillPreset(
        id="general_web_search",
        name="网络搜索",
        description="通用信息搜索能力，查找任何主题的最新信息",
        icon="🔍",
        category="general",
        prompt_template="""When searching for general information:

1. **Query Construction**:
   - Be specific: "electric vehicle sales 2024 China" vs just "EV"
   - Include time frame for recent information
   - Add keywords like "latest", "news", "update" for current events

2. **Source Evaluation**:
   - Prefer authoritative sources (official sites, established media)
   - Cross-check controversial claims
   - Note publication date - outdated info can be misleading

3. **Synthesis**:
   - Summarize key findings concisely
   - Highlight conflicting information if present
   - Provide source URLs for verification

4. **Limitations**:
   - Acknowledge if search results are insufficient
   - Don't fabricate information not found in results
   - Indicate when information might be incomplete""",
        tool_bindings=[
            {"tool_name": "search_news", "description": "Search for information on any topic"},
        ],
    ),

    SkillPreset(
        id="data_analysis",
        name="数据分析",
        description="分析数据趋势、识别模式、生成洞察",
        icon="📊",
        category="general",
        prompt_template="""When analyzing data and identifying trends:

1. **Pattern Recognition**:
   - Look for trends (upward, downward, cyclical)
   - Identify outliers and anomalies
   - Note correlations between variables

2. **Statistical Context**:
   - Consider sample size and time period
   - Distinguish between correlation and causation
   - Be cautious with small samples

3. **Visualization Guidance**:
   - Describe what a chart would show
   - Highlight key inflection points
   - Compare current vs historical data

4. **Limitations**:
   - Past performance doesn't guarantee future results
   - External factors may change the pattern
   - Confidence intervals matter""",
        tool_bindings=[
            {"tool_name": "get_technical_summary", "description": "Get historical trend data"},
        ],
    ),
]


# === Helper Functions ===

def get_builtin_skill(skill_id: str) -> Optional[SkillPreset]:
    """Get a built-in skill by ID."""
    for skill in BUILTIN_SKILLS:
        if skill.id == skill_id:
            return skill
    return None


def get_builtin_skills_by_category(category: str) -> List[SkillPreset]:
    """Get all built-in skills in a category."""
    return [skill for skill in BUILTIN_SKILLS if skill.category == category]


def get_all_categories() -> List[Dict[str, str]]:
    """Get all unique categories with metadata."""
    categories = {
        "stock": {"name": "股票分析", "icon": "📈", "description": "股票研究和投资分析技能"},
        "travel": {"name": "旅游出行", "icon": "✈️", "description": "旅游规划、景点推荐技能"},
        "code": {"name": "编程开发", "icon": "💻", "description": "编程辅助、代码分析技能"},
        "general": {"name": "通用能力", "icon": "🔧", "description": "适用于各种场景的基础技能"},
    }

    # Add any categories found in skills but not in the predefined list
    for skill in BUILTIN_SKILLS:
        if skill.category not in categories:
            categories[skill.category] = {
                "name": skill.category.capitalize(),
                "icon": "📦",
                "description": f"{skill.category} related skills"
            }

    return [{"id": k, **v} for k, v in categories.items()]


def validate_skill_tools(skill_id: str, available_tools: List[str]) -> List[str]:
    """
    Validate that all tools referenced by a skill exist.

    Returns:
        List of missing tool names (empty if all valid)
    """
    skill = get_builtin_skill(skill_id)
    if not skill:
        return ["Skill not found"]

    missing = []
    for binding in skill.tool_bindings:
        tool_name = binding.get("tool_name")
        if tool_name and tool_name not in available_tools:
            missing.append(tool_name)

    return missing
