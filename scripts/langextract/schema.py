"""Pydantic models for LangExtract structured extraction targets."""

from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class SentimentType(str, Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"
    MIXED = "mixed"


class ThemeCategory(str, Enum):
    TOOL = "tool"
    PAIN_POINT = "pain_point"
    GOAL = "goal"
    CAPABILITY = "capability"
    PROCESS = "process"
    CULTURE = "culture"
    STRATEGY = "strategy"


class ExtractedTheme(BaseModel):
    """A theme or topic extracted from assessment conversation responses."""
    name: str = Field(description="Short descriptive name for the theme, e.g. 'ChatGPT adoption', 'Manual data entry bottleneck'")
    category: ThemeCategory = Field(description="Category of the theme")
    sentiment: SentimentType = Field(description="Emotional tone when discussing this theme")
    related_dimensions: list[str] = Field(
        default_factory=list,
        description="Scoring dimensions this relates to: ai_awareness, ai_action, process_readiness, strategic_clarity, change_energy, team_capacity, mission_alignment, investment_readiness"
    )
    evidence: str = Field(description="Direct quote or paraphrase from the participant supporting this theme")
    confidence: float = Field(default=0.8, ge=0.0, le=1.0, description="How confident the extraction is")


class ExtractedTool(BaseModel):
    """A specific AI tool or software mentioned by the participant."""
    name: str = Field(description="Name of the tool, e.g. 'ChatGPT', 'Midjourney', 'Salesforce'")
    usage_frequency: Optional[str] = Field(default=None, description="How often they use it: daily, weekly, occasionally, tried_once, never")
    sophistication: Optional[str] = Field(default=None, description="How advanced their usage is: basic, intermediate, advanced")
    use_case: Optional[str] = Field(default=None, description="What they use it for")


class ExtractedPainPoint(BaseModel):
    """A business challenge, bottleneck, or frustration identified."""
    description: str = Field(description="Description of the pain point")
    severity: str = Field(description="How impactful: critical, high, medium, low")
    area: str = Field(description="Business area affected: operations, hiring, sales, marketing, product, leadership, culture")
    potential_ai_solution: Optional[str] = Field(default=None, description="Whether AI could help address this")


class ExtractedGoal(BaseModel):
    """A transformation goal or desired outcome expressed by the participant."""
    description: str = Field(description="What they want to achieve")
    timeframe: Optional[str] = Field(default=None, description="When: immediate, near_term, long_term")
    related_to_ai: bool = Field(default=False, description="Whether this goal relates to AI adoption")


class ExtractedQuote(BaseModel):
    """A standout quote from the participant worth surfacing in reports."""
    text: str = Field(description="The exact or near-exact quote")
    context: str = Field(description="What question or topic prompted this")
    sentiment: SentimentType = Field(description="Emotional tone of the quote")
    usable_as_testimonial: bool = Field(default=False, description="Whether this could work as a testimonial")


class SessionExtraction(BaseModel):
    """Complete structured extraction from one assessment session's AI conversations."""
    session_id: str
    participant_name: str
    company: str
    themes: list[ExtractedTheme] = Field(default_factory=list)
    tools: list[ExtractedTool] = Field(default_factory=list)
    pain_points: list[ExtractedPainPoint] = Field(default_factory=list)
    goals: list[ExtractedGoal] = Field(default_factory=list)
    quotes: list[ExtractedQuote] = Field(default_factory=list)
