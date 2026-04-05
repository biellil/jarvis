"""Conversational session — streaming chat loop with message history.

Per CONV-01: ChatSession manages the conversation history and streams
tokens to stdout using plain print() (not Rich) per D-02.

The session maintains a full message history starting with a SystemMessage
so the LLM always has context about who JARVIS is.

Extended in Phase 2 (02-03) with:
- Memory injection: SQLite profile facts injected into system prompt each turn (D-03)
- ChromaDB semantic retrieval: query_memories() called each turn and injected (MEM-02, 02-05)
- Rolling summary compression: old messages compressed when approaching context window (D-05)
- Profile extraction: facts extracted post-streaming and saved with explicit/implicit source
- Save-on-exit: conversation persisted to SQLite and ChromaDB via save()
- Backward compatible: ChatSession(llm) with no memory args still works exactly as Phase 1

Extended in Phase 4 (04-03) with:
- Tool-calling loop: bind_tools(), chunk accumulation, tool invocation, ActionExecutor dispatch
- ToolMessage history injection after each tool call (Pitfall 2: required for every tool_call)
- Second LLM call for natural language response after tool results
- Backward compatible: ChatSession(llm) with no tools/executor works exactly as before
"""

import json
from datetime import datetime, timezone
from typing import Optional, TYPE_CHECKING

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, BaseMessage, ToolMessage
from langchain_core.messages.utils import count_tokens_approximately
from loguru import logger

from jarvis.memory.store import MemoryStore
from jarvis.memory.vectors import MemoryVectors
from jarvis.memory.profile import extract_profile_facts, is_explicit_profile_command

if TYPE_CHECKING:
    from jarvis.executor.base import ActionExecutor


SYSTEM_PROMPT = (
    "You are JARVIS, a helpful personal assistant. "
    "You remember everything from our conversations and help the user "
    "with tasks, questions, and anything they need."
)

FALLBACK_CONTEXT_WINDOW = 4096


class ChatSession:
    """Manages a streaming conversation session with message history and memory.

    Maintains the full conversation history as a list of LangChain messages.
    Each call to send() injects SQLite profile facts into the system prompt,
    streams the LLM response token by token, saves messages incrementally,
    and triggers post-turn profile extraction.

    Per D-02: Token output uses plain print(token, end='', flush=True).
    Rich is NOT used for the streamed output — only for the prompt/label.

    Phase 4: When tools and executor are provided, send() transparently handles
    tool calls: accumulates chunks, invokes tool payload functions, dispatches
    to ActionExecutor, adds ToolMessages to history, and makes a second LLM call
    for the final natural language response.

    Backward compatible: ChatSession(llm) with no memory or tool args works as Phase 1.
    """

    def __init__(
        self,
        llm: BaseChatModel,
        db: Optional[MemoryStore] = None,
        vectors: Optional[MemoryVectors] = None,
        context_window: Optional[int] = None,
        tools: Optional[list] = None,
        executor: Optional["ActionExecutor"] = None,
    ) -> None:
        self.llm = llm
        self.history: list[BaseMessage] = [SystemMessage(content=SYSTEM_PROMPT)]
        self._db = db
        self._vectors = vectors
        self._context_window = context_window
        # CRITICAL: _conv_id MUST be initialized here (Research Pitfall 7)
        # Both _maybe_compress() and save() depend on it being present
        self._conv_id = self._db.start_conversation() if self._db else None
        # Phase 4: Tool calling
        self._tools = tools or []
        self._tool_map = {t.name: t for t in self._tools}
        self._llm_with_tools = llm.bind_tools(self._tools) if self._tools else llm
        self._executor = executor

    async def send(self, user_input: str) -> str:
        """Send a message and stream the LLM response.

        6-step pipeline:
        1. Check compression threshold (before adding new message)
        2. Build augmented system prompt with SQLite profile facts (D-03)
        3. Append HumanMessage to history and messages_to_send
        4. Stream LLM, save messages incrementally (D-05)
        5. End streaming line
        6. Post-turn profile extraction (Pitfall 4: AFTER streaming)

        Args:
            user_input: The user's message text.

        Returns:
            The complete response string.
        """
        # Step 1: Check compression before adding new message
        await self._maybe_compress()

        # Step 2: Build augmented system prompt with SQLite profile facts and ChromaDB memories
        augmented_system = SYSTEM_PROMPT
        if self._db:
            facts = self._db.get_profile_facts()
            if facts:
                facts_block = "\n".join(f"- {k}: {v}" for k, v, _, _ in facts)
                augmented_system += f"\n\nFatos sobre o usuario:\n{facts_block}"

        # Inject semantically relevant memories from past sessions (MEM-02)
        if self._vectors:
            try:
                memories = self._vectors.query_memories(user_input)
                if memories:
                    memories_block = "\n".join(f"- {m}" for m in memories)
                    augmented_system += f"\n\nMemorias relevantes de sessoes anteriores:\n{memories_block}"
            except Exception as e:
                logger.warning(f"Memory retrieval failed: {e}")

        # Build messages_to_send as a NEW list — NEVER mutate self.history[0] (Pitfall 1)
        messages_to_send = [SystemMessage(content=augmented_system)] + self.history[1:]

        # Step 3: Append HumanMessage to both history and messages_to_send
        human_msg = HumanMessage(content=user_input)
        self.history.append(human_msg)
        messages_to_send.append(human_msg)

        # Incrementally save user message (D-05)
        if self._db and self._conv_id is not None:
            now = datetime.now(timezone.utc).isoformat()
            self._db.save_messages(self._conv_id, [("user", user_input, now)])

        # Step 4: Stream LLM response — tool-aware
        llm_to_use = self._llm_with_tools if self._tools else self.llm
        full_response = ""
        accumulated = None
        async for chunk in llm_to_use.astream(messages_to_send):
            if accumulated is None:
                accumulated = chunk
            else:
                accumulated = accumulated + chunk
            # Only print text content (not tool call chunks)
            token = chunk.content
            if token:
                print(token, end="", flush=True)  # per D-02: plain print, no Rich
                full_response += token

        # Check for tool calls after stream completes (Pitfall 1: never mid-stream)
        if accumulated and hasattr(accumulated, "tool_calls") and accumulated.tool_calls:
            # Append AIMessage with tool_calls to history
            self.history.append(accumulated)

            for tool_call in accumulated.tool_calls:
                tool = self._tool_map.get(tool_call["name"])
                if tool is None:
                    logger.warning(f"Unknown tool requested: {tool_call['name']}")
                    continue

                # Invoke tool to get payload dict
                payload = tool.invoke(tool_call["args"])

                # Execute via ActionExecutor (handles confirmation + logging)
                if self._executor:
                    result = await self._executor.execute(
                        tool_call["name"], payload, tool_call["args"]
                    )
                else:
                    result = payload  # Fallback: return payload as-is if no executor

                # Add ToolMessage to history (Pitfall 2: required for every tool_call)
                self.history.append(ToolMessage(
                    content=json.dumps(result, ensure_ascii=False),
                    tool_call_id=tool_call["id"],
                    name=tool_call["name"],
                ))

            # Second LLM call: send full history with tool results for final response
            second_messages = [SystemMessage(content=augmented_system)] + self.history[1:]
            full_response = ""
            async for chunk in llm_to_use.astream(second_messages):
                token = chunk.content
                if token:
                    print(token, end="", flush=True)
                    full_response += token

            # Append final AIMessage after tool-call path
            self.history.append(AIMessage(content=full_response))
        else:
            # No tool calls — standard path
            self.history.append(AIMessage(content=full_response))

        # Incrementally save assistant message (D-05)
        if self._db and self._conv_id is not None:
            now = datetime.now(timezone.utc).isoformat()
            self._db.save_messages(self._conv_id, [("assistant", full_response, now)])

        # Step 5: End streaming line
        print()  # newline after stream ends

        # Step 6: Post-turn profile extraction (Pitfall 4 — AFTER streaming)
        if self._db:
            try:
                facts = await extract_profile_facts(self.llm, user_input)
                source = "explicit" if is_explicit_profile_command(user_input) else "implicit"
                for key, value in facts.items():
                    self._db.upsert_profile(key, value, source)
                    if self._vectors:
                        self._vectors.add_memory(f"profile:{key}", f"{key}: {value}")
            except Exception as e:
                logger.warning(f"Profile extraction failed: {e}")

        return full_response

    async def _maybe_compress(self) -> None:
        """Compress old messages if token count exceeds 75% of context window.

        Uses FALLBACK_CONTEXT_WINDOW=4096 when context_window is None.
        After compression, history becomes:
            [SystemMessage, AIMessage("Resumo..."), *last_4_messages]

        Saves the compression summary to SQLite immediately.
        """
        threshold = int((self._context_window or FALLBACK_CONTEXT_WINDOW) * 0.75)
        if count_tokens_approximately(self.history) < threshold:
            return

        # Messages to compress: everything except system + last 4
        to_compress = self.history[1:-4]
        if not to_compress:
            return

        summary_response = await self.llm.ainvoke([
            SystemMessage(content="Summarize this conversation excerpt concisely in Portuguese."),
            *to_compress,
        ])
        summary = summary_response.content

        self.history = [
            self.history[0],
            AIMessage(content=f"Resumo da conversa ate aqui: {summary}"),
            *self.history[-4:],
        ]

        if self._db and self._conv_id is not None:
            self._db.save_summary(self._conv_id, summary)

    async def save(self) -> None:
        """Save session state to SQLite and ChromaDB on exit.

        Called from __main__.py try/finally block to ensure persistence
        on any exit path (normal, Ctrl+C, error).

        Per D-06: end_conversation marks the session as ended in SQLite.
        Messages are embedded into ChromaDB for future semantic retrieval.
        """
        if not self._db or self._conv_id is None:
            return

        self._db.end_conversation(self._conv_id)

        # Embed conversation messages into ChromaDB for future semantic retrieval
        if self._vectors:
            for i, msg in enumerate(self.history[1:], start=1):
                if hasattr(msg, "content") and msg.content:
                    role = "user" if isinstance(msg, HumanMessage) else "assistant"
                    self._vectors.add_memory(
                        f"conv:{self._conv_id}:msg:{i}",
                        msg.content,
                        metadata={"role": role, "conv_id": str(self._conv_id)},
                    )
