"""Conversational session — streaming chat loop with message history.

Per CONV-01: ChatSession manages the conversation history and streams
tokens to stdout using plain print() (not Rich) per D-02.

The session maintains a full message history starting with a SystemMessage
so the LLM always has context about who JARVIS is.

Extended in Phase 2 (02-03) with:
- Memory injection: SQLite profile facts injected into system prompt each turn (D-03)
- Rolling summary compression: old messages compressed when approaching context window (D-05)
- Profile extraction: facts extracted post-streaming and saved with explicit/implicit source
- Save-on-exit: conversation persisted to SQLite and ChromaDB via save()
- Backward compatible: ChatSession(llm) with no memory args still works exactly as Phase 1
"""

from datetime import datetime, timezone
from typing import Optional

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, BaseMessage
from langchain_core.messages.utils import count_tokens_approximately
from loguru import logger

from jarvis.memory.store import MemoryStore
from jarvis.memory.vectors import MemoryVectors
from jarvis.memory.profile import extract_profile_facts, is_explicit_profile_command


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

    Backward compatible: ChatSession(llm) with no memory args works as Phase 1.
    """

    def __init__(
        self,
        llm: BaseChatModel,
        db: Optional[MemoryStore] = None,
        vectors: Optional[MemoryVectors] = None,
        context_window: Optional[int] = None,
    ) -> None:
        self.llm = llm
        self.history: list[BaseMessage] = [SystemMessage(content=SYSTEM_PROMPT)]
        self._db = db
        self._vectors = vectors
        self._context_window = context_window
        # CRITICAL: _conv_id MUST be initialized here (Research Pitfall 7)
        # Both _maybe_compress() and save() depend on it being present
        self._conv_id = self._db.start_conversation() if self._db else None

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

        # Step 2: Build augmented system prompt with SQLite profile facts
        # Per D-03: ONLY inject SQLite profile facts. ChromaDB retrieval deferred.
        augmented_system = SYSTEM_PROMPT
        if self._db:
            facts = self._db.get_profile_facts()
            if facts:
                facts_block = "\n".join(f"- {k}: {v}" for k, v, _, _ in facts)
                augmented_system += f"\n\nFatos sobre o usuario:\n{facts_block}"

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

        # Step 4: Stream LLM response using messages_to_send (not self.history)
        full_response = ""
        async for chunk in self.llm.astream(messages_to_send):
            token = chunk.content
            if token:
                print(token, end="", flush=True)  # per D-02: plain print, no Rich
                full_response += token

        # Append AIMessage to history
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
