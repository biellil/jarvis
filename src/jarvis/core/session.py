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

Extended in Phase 5 (05-02) with:
- image= parameter on send() for multimodal HumanMessage (VISION-01)
- Vision routing: analyze_screen tool results route through ScreenAnalyzer fallback chain
- asyncio.to_thread for tool invocation to avoid blocking async loop (ARCH-02)
- Hot-reload: detects model config changes between send() calls and rebuilds LLM (LLM-04)
- LLM-03: Non-vision tasks always use configured local model; cloud only for vision fallback
"""

import asyncio
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
from jarvis.core.screen import ScreenAnalyzer
from jarvis.llm.capabilities import detect_capabilities
from jarvis.llm.factory import create_llm
from jarvis.config import Settings

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

    Phase 5: send() accepts image= for multimodal messages (VISION-01).
    analyze_screen tool results route through ScreenAnalyzer fallback chain (D-04).
    Tool invocation uses asyncio.to_thread for ARCH-02 compliance.
    Hot-reload detects .env model changes and rebuilds LLM without restart (LLM-04).
    Non-vision tasks always use the configured local model (LLM-03).

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
        # Phase 5: Vision routing and hot-reload (LLM-04)
        self._screen_analyzer = ScreenAnalyzer()
        self._current_model_id = None  # Set on first send(), used for hot-reload detection
        self._caps = None  # ModelCapabilities, set on first send() or hot-reload

    async def send(self, user_input: str, image: str | None = None) -> str:
        """Send a message and stream the LLM response.

        Extended pipeline (Phase 5):
        0. Hot-reload check: detect model change in .env and rebuild LLM if needed (LLM-04)
        1. Check compression threshold (before adding new message)
        2. Build augmented system prompt with SQLite profile facts (D-03)
        3. Append HumanMessage to history — multimodal if image provided (VISION-01)
        4. Stream LLM, save messages incrementally (D-05)
           - Tool calls: asyncio.to_thread for invocation (ARCH-02)
           - analyze_screen: route through ScreenAnalyzer, not ActionExecutor (D-04)
           - Non-vision tasks: always use configured local model (LLM-03)
        5. End streaming line
        6. Post-turn profile extraction (Pitfall 4: AFTER streaming)

        Args:
            user_input: The user's message text.
            image: Optional base64-encoded PNG string for multimodal messages.
                   Passed directly by /screenshot command or test fixtures.

        Returns:
            The complete response string.
        """
        # LLM-04: Hot-reload — check if model changed in .env since last send()
        # Settings() re-reads .env on instantiation (pydantic-settings behavior)
        try:
            fresh = Settings()
            new_model = fresh.lm_studio_model or fresh.llm_model
            if self._current_model_id is None:
                # First send: initialize model tracking
                self._current_model_id = new_model
            elif new_model and new_model != self._current_model_id:
                logger.info(
                    f"Hot-reload: model changed from {self._current_model_id} to {new_model}"
                )
                self.llm = create_llm(settings_override=fresh)
                self._llm_with_tools = self.llm.bind_tools(self._tools) if self._tools else self.llm
                self._current_model_id = new_model
                # Re-detect capabilities for vision routing
                self._caps = detect_capabilities(fresh.lm_studio_url, new_model)
        except Exception as e:
            logger.warning(f"Hot-reload check failed: {e}")

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

        # Step 3: Build HumanMessage — multimodal if image provided (VISION-01, D-03)
        if image:
            human_msg = HumanMessage(content=[
                {"type": "text", "text": user_input},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image}"}},
            ])
        else:
            human_msg = HumanMessage(content=user_input)

        self.history.append(human_msg)
        messages_to_send.append(human_msg)

        # Incrementally save user message (D-05) — always save text, not raw base64 (Pitfall 5)
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

            # Track vision image from analyze_screen tool (scoped outside loop for step 7)
            image_b64_from_tool = None

            for tool_call in accumulated.tool_calls:
                tool = self._tool_map.get(tool_call["name"])
                if tool is None:
                    logger.warning(f"Unknown tool requested: {tool_call['name']}")
                    continue

                # ARCH-02: Invoke tool in thread to avoid blocking async loop
                # (critical for analyze_screen which calls pyautogui.screenshot ~200ms)
                payload = await asyncio.to_thread(tool.invoke, tool_call["args"])

                # Vision routing (D-01): analyze_screen returns image data
                # Do NOT send to executor — image flows to second LLM call
                if isinstance(payload, dict) and payload.get("action") == "analyze_screen":
                    image_b64_from_tool = payload.get("image_base64", "")
                    result = {"status": "captured", "message": "Screenshot capturado para analise."}
                    # Do NOT call executor for vision tool
                elif self._executor:
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

            # Step 7: Handle vision image injection before second LLM call
            # LLM-03: self.llm is always the user's configured local model
            # Cloud is only created temporarily here if needed for vision fallback
            if image_b64_from_tool:
                caps = self._caps
                if caps is None:
                    from jarvis.config import settings as _settings
                    model_id = _settings.lm_studio_model or _settings.llm_model
                    if model_id:
                        caps = detect_capabilities(_settings.lm_studio_url, model_id)

                if caps:
                    strategy, img_data, context = self._screen_analyzer.resolve(
                        image_b64_from_tool, caps
                    )
                else:
                    strategy, img_data, context = "image", image_b64_from_tool, None

                if strategy == "image":
                    # Model has vision — inject image directly
                    self.history.append(HumanMessage(content=[
                        {"type": "text", "text": "Analise esta captura de tela e responda ao usuario."},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_data}"}},
                    ]))
                elif strategy == "ocr":
                    # OCR fallback — inject extracted text (not image)
                    self.history.append(HumanMessage(
                        content=f"Texto extraido da tela via OCR:\n\n{context}\n\nResponda ao usuario sobre o conteudo da tela."
                    ))
                elif strategy == "cloud":
                    # Cloud fallback — create temporary cloud LLM for this call ONLY
                    # LLM-03: self.llm (local) is NEVER replaced; cloud is one-shot for vision
                    try:
                        cloud_settings_dict = Settings().model_dump()
                        cloud_settings_dict["llm_provider"] = context  # "anthropic" or "openai"
                        cloud_s = Settings.model_validate(cloud_settings_dict)
                        cloud_llm = create_llm(settings_override=cloud_s)
                        cloud_msgs = [
                            SystemMessage(content=SYSTEM_PROMPT),
                            HumanMessage(content=[
                                {"type": "text", "text": user_input},
                                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_data}"}},
                            ]),
                        ]
                        cloud_response = await cloud_llm.ainvoke(cloud_msgs)
                        # Inject cloud response — local model (self.llm) summarizes for user
                        self.history.append(HumanMessage(
                            content=f"Analise da tela (via modelo cloud {context}):\n{cloud_response.content}"
                        ))
                    except Exception as e:
                        logger.warning(f"Cloud vision fallback failed: {e}")
                        self.history.append(HumanMessage(
                            content=f"Erro na analise de tela via cloud: {e}"
                        ))
                elif strategy == "error":
                    self.history.append(HumanMessage(content=f"Erro na analise de tela: {context}"))

            # Second LLM call: send full history with tool results for final response
            # LLM-03: always uses self.llm (local) for the second call
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
