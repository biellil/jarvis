"""Provider name constants for the LLM abstraction layer.

Use these constants instead of string literals when comparing or switching
providers to avoid typos and enable IDE refactoring.
"""

LMSTUDIO = "lmstudio"
OPENAI = "openai"
ANTHROPIC = "anthropic"

ALL_PROVIDERS = (LMSTUDIO, OPENAI, ANTHROPIC)
