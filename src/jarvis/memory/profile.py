"""User profile extraction — implicit and explicit fact learning.

Per D-03: Two modes of learning user preferences:
1. Explicit: User says "lembra que..." — saved with source="explicit"
2. Implicit: Post-turn LLM analysis extracts facts — saved with source="implicit"

Per MEM-03: Profile facts stored via MemoryStore.upsert_profile(key, value, source).
"""
import json
from loguru import logger
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.language_models.chat_models import BaseChatModel


EXPLICIT_TRIGGERS = [
    "lembra que",
    "lembre que",
    "lembre-se que",
    "minha preferencia e",
    "minha preferência é",
    "eu prefiro",
    "eu gosto de",
    "eu odeio",
    "eu trabalho com",
    "eu uso",
    "eu moro",
    "meu nome e",
    "meu nome é",
    "remember that",
    "my preference is",
    "i prefer",
]

EXTRACTION_PROMPT = """Analyze the following user message and extract any personal facts, preferences, or habits.
Return a JSON object with key-value pairs. Keys should be short descriptive labels in Portuguese.
If no personal facts are found, return an empty JSON object {{}}.

Examples:
- "Eu trabalho com Python e Go" -> {{"linguagem_trabalho": "Python e Go"}}
- "Prefiro dark mode em tudo" -> {{"preferencia_tema": "dark mode"}}
- "Bom dia, tudo bem?" -> {{}}

User message: {user_input}

Return ONLY valid JSON, nothing else."""


def is_explicit_profile_command(text: str) -> bool:
    """Check if the user message starts with an explicit profile trigger. Per D-03."""
    text_lower = text.lower().strip()
    return any(text_lower.startswith(t) for t in EXPLICIT_TRIGGERS)


async def extract_profile_facts(llm: BaseChatModel, user_input: str) -> dict[str, str]:
    """Use LLM to extract personal facts from a user message. Per D-03 implicit extraction.

    Returns dict of {key: value} pairs. Returns empty dict on any error.
    Never raises — logs warnings on failure.
    """
    try:
        prompt = EXTRACTION_PROMPT.format(user_input=user_input)
        response = await llm.ainvoke(
            [
                SystemMessage(content="You are a fact extractor. Return only valid JSON."),
                HumanMessage(content=prompt),
            ]
        )
        content = response.content.strip()

        # Strip markdown code fences if present
        if content.startswith("```"):
            # Remove opening fence (```json or ```)
            lines = content.split("\n")
            # Remove first line (fence opener) and last line (fence closer ```)
            inner_lines = []
            for line in lines[1:]:
                if line.strip() == "```":
                    break
                inner_lines.append(line)
            content = "\n".join(inner_lines).strip()

        parsed = json.loads(content)
        # Ensure all values are strings
        return {str(k): str(v) for k, v in parsed.items()}

    except Exception as e:
        logger.warning(f"extract_profile_facts failed: {e}")
        return {}
