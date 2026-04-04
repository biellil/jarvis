"""Tests for ChatSession memory pipeline (02-03).

Verifies memory injection, compression, incremental save, and profile extraction.
All external dependencies (MemoryStore, MemoryVectors, LLM) are mocked.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from jarvis.core.session import FALLBACK_CONTEXT_WINDOW, SYSTEM_PROMPT, ChatSession


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_mock_llm(response: str = "Hello!"):
    """Mock LLM with astream yielding a single chunk and ainvoke for compression/profile."""
    mock = MagicMock()

    async def fake_astream(messages):
        yield AIMessage(content=response)

    async def fake_ainvoke(messages):
        return AIMessage(content="Summary of conversation")

    mock.astream = fake_astream
    mock.ainvoke = fake_ainvoke
    return mock


def make_mock_db(conv_id: int = 1, profile_facts=None):
    """Mock MemoryStore."""
    db = MagicMock()
    db.start_conversation.return_value = conv_id
    db.get_profile_facts.return_value = profile_facts or []
    db.save_messages = MagicMock()
    db.save_summary = MagicMock()
    db.end_conversation = MagicMock()
    db.upsert_profile = MagicMock()
    return db


def make_mock_vectors():
    """Mock MemoryVectors."""
    vectors = MagicMock()
    vectors.add_memory = MagicMock()
    return vectors


# ---------------------------------------------------------------------------
# Backward compatibility — no db/vectors
# ---------------------------------------------------------------------------


class TestBackwardCompat:
    def test_no_db_no_vectors_works(self):
        """ChatSession(llm) with no db/vectors still works — Phase 1 backward compat."""
        llm = make_mock_llm()
        session = ChatSession(llm=llm)
        assert session._db is None
        assert session._vectors is None
        assert session._conv_id is None

    def test_no_db_send_does_not_crash(self):
        """send() without db works without errors."""
        llm = make_mock_llm("OK")
        session = ChatSession(llm=llm)
        result = asyncio.run(session.send("Hello"))
        assert result == "OK"

    def test_history_unchanged_system_prompt(self):
        """history[0] is still the system message after send()."""
        llm = make_mock_llm("Hi")
        session = ChatSession(llm=llm)
        asyncio.run(session.send("Hello"))
        assert isinstance(session.history[0], SystemMessage)
        assert session.history[0].content == SYSTEM_PROMPT


# ---------------------------------------------------------------------------
# Initialization with db
# ---------------------------------------------------------------------------


class TestInitWithDb:
    def test_start_conversation_called(self):
        """ChatSession(llm, db=mock_db) calls db.start_conversation() during __init__."""
        db = make_mock_db(conv_id=42)
        llm = make_mock_llm()
        session = ChatSession(llm=llm, db=db)
        db.start_conversation.assert_called_once()
        assert session._conv_id == 42

    def test_no_db_conv_id_is_none(self):
        """ChatSession(llm, db=None) sets self._conv_id = None."""
        llm = make_mock_llm()
        session = ChatSession(llm=llm, db=None)
        assert session._conv_id is None


# ---------------------------------------------------------------------------
# Memory injection in send()
# ---------------------------------------------------------------------------


class TestMemoryInjection:
    def test_profile_facts_injected_into_system_prompt(self):
        """send() augments system prompt with profile facts from db."""
        facts = [("name", "Alice", "explicit", "2026-01-01")]
        db = make_mock_db(profile_facts=facts)
        llm = make_mock_llm("Hi Alice!")
        session = ChatSession(llm=llm, db=db)

        # Capture the messages passed to astream
        captured_messages = []

        async def capturing_astream(messages):
            captured_messages.extend(messages)
            yield AIMessage(content="Hi Alice!")

        llm.astream = capturing_astream

        asyncio.run(session.send("Hello"))

        # The first message in the sent list should have augmented system prompt
        assert len(captured_messages) > 0
        assert isinstance(captured_messages[0], SystemMessage)
        assert "name" in captured_messages[0].content
        assert "Alice" in captured_messages[0].content

    def test_no_db_no_injection(self):
        """send() without db does not crash and uses SYSTEM_PROMPT as-is."""
        llm = make_mock_llm("Hello!")
        session = ChatSession(llm=llm)
        result = asyncio.run(session.send("Hi"))
        assert result == "Hello!"

    def test_history_system_prompt_unchanged_after_injection(self):
        """history[0].content must equal SYSTEM_PROMPT after send() — Pitfall 1."""
        facts = [("name", "Bob", "implicit", "2026-01-01")]
        db = make_mock_db(profile_facts=facts)
        llm = make_mock_llm("Hi Bob!")
        session = ChatSession(llm=llm, db=db)
        asyncio.run(session.send("Hello"))
        # Original system message must be untouched
        assert session.history[0].content == SYSTEM_PROMPT

    def test_messages_to_send_is_separate_list(self):
        """send() builds messages_to_send as a new list, not a reference to self.history."""
        db = make_mock_db()
        llm = make_mock_llm("OK")
        session = ChatSession(llm=llm, db=db)

        original_history_id = id(session.history)
        history_len_before = len(session.history)

        asyncio.run(session.send("test"))

        # history grew by 2 (human + ai), and history[0] content unchanged
        assert session.history[0].content == SYSTEM_PROMPT
        assert len(session.history) == history_len_before + 2

    def test_no_query_memories_called(self):
        """vectors.query_memories() must NOT be called in send() per D-03."""
        db = make_mock_db()
        vectors = make_mock_vectors()
        llm = make_mock_llm("OK")
        session = ChatSession(llm=llm, db=db, vectors=vectors)
        asyncio.run(session.send("Hello"))
        vectors.query_memories.assert_not_called()


# ---------------------------------------------------------------------------
# Incremental save (D-05)
# ---------------------------------------------------------------------------


class TestIncrementalSave:
    def test_save_messages_called_for_user_and_assistant(self):
        """send() calls db.save_messages() for both user and assistant messages."""
        db = make_mock_db()
        llm = make_mock_llm("JARVIS reply")
        session = ChatSession(llm=llm, db=db)
        asyncio.run(session.send("User message"))
        # save_messages called at least twice (user + assistant)
        assert db.save_messages.call_count >= 2

    def test_save_messages_not_called_without_db(self):
        """send() without db does not attempt to save messages."""
        llm = make_mock_llm("OK")
        session = ChatSession(llm=llm)
        asyncio.run(session.send("Hello"))
        # No error, no save attempt — db is None


# ---------------------------------------------------------------------------
# Compression
# ---------------------------------------------------------------------------


class TestCompression:
    def test_no_compression_below_threshold(self):
        """_maybe_compress() does nothing when token count is below 75% of context_window."""
        db = make_mock_db()
        llm = make_mock_llm("Hi")
        session = ChatSession(llm=llm, db=db, context_window=10000)
        initial_len = len(session.history)
        asyncio.run(session._maybe_compress())
        assert len(session.history) == initial_len
        db.save_summary.assert_not_called()

    def test_fallback_context_window_used_when_none(self):
        """_maybe_compress() uses FALLBACK_CONTEXT_WINDOW=4096 when context_window is None."""
        assert FALLBACK_CONTEXT_WINDOW == 4096
        llm = make_mock_llm()
        session = ChatSession(llm=llm, context_window=None)
        # Should not crash with context_window=None
        asyncio.run(session._maybe_compress())

    def test_compression_triggers_at_75_percent(self):
        """_maybe_compress() compresses when token count exceeds 75% of context_window."""
        db = make_mock_db()
        llm = make_mock_llm("Response")
        # Use tiny context_window so tokens exceed threshold quickly
        session = ChatSession(llm=llm, db=db, context_window=10)

        # Fill history with enough messages to exceed threshold
        for i in range(10):
            session.history.append(HumanMessage(content=f"This is message {i} with some content to fill tokens"))
            session.history.append(AIMessage(content=f"This is response {i} with some content to fill tokens"))

        history_len_before = len(session.history)
        asyncio.run(session._maybe_compress())

        # After compression, history should be shorter
        assert len(session.history) < history_len_before

    def test_compression_structure_after_compress(self):
        """After compression: history is [SystemMessage, AIMessage('Resumo...'), ...last 4]."""
        db = make_mock_db()

        async def fake_ainvoke(messages):
            return AIMessage(content="Compressed summary")

        llm = make_mock_llm()
        llm.ainvoke = fake_ainvoke
        session = ChatSession(llm=llm, db=db, context_window=10)

        # Add enough messages to trigger compression
        for i in range(12):
            session.history.append(HumanMessage(content=f"Message {i} " + "x" * 30))
            session.history.append(AIMessage(content=f"Reply {i} " + "x" * 30))

        asyncio.run(session._maybe_compress())

        # First message is SystemMessage
        assert isinstance(session.history[0], SystemMessage)
        # Second message is the compression summary
        assert isinstance(session.history[1], AIMessage)
        assert "Resumo" in session.history[1].content

    def test_compression_saves_summary_to_db(self):
        """_maybe_compress() saves summary to db.save_summary(conv_id, summary)."""
        db = make_mock_db(conv_id=5)

        async def fake_ainvoke(messages):
            return AIMessage(content="The summary")

        llm = make_mock_llm()
        llm.ainvoke = fake_ainvoke
        session = ChatSession(llm=llm, db=db, context_window=10)

        for i in range(12):
            session.history.append(HumanMessage(content="message " + "x" * 30))
            session.history.append(AIMessage(content="reply " + "x" * 30))

        asyncio.run(session._maybe_compress())
        db.save_summary.assert_called_once_with(5, "The summary")


# ---------------------------------------------------------------------------
# Profile extraction
# ---------------------------------------------------------------------------


class TestProfileExtraction:
    def test_profile_extracted_after_streaming(self):
        """extract_profile_facts is called after the AIMessage is appended."""
        db = make_mock_db()
        llm = make_mock_llm("OK")
        session = ChatSession(llm=llm, db=db)

        with patch("jarvis.core.session.extract_profile_facts", new_callable=AsyncMock) as mock_extract:
            mock_extract.return_value = {}
            asyncio.run(session.send("Hello"))
            mock_extract.assert_called_once()

    def test_explicit_trigger_saves_with_explicit_source(self):
        """is_explicit_profile_command=True -> source='explicit' in upsert_profile."""
        db = make_mock_db()
        llm = make_mock_llm("Got it!")
        session = ChatSession(llm=llm, db=db)

        with patch("jarvis.core.session.extract_profile_facts", new_callable=AsyncMock) as mock_extract, \
             patch("jarvis.core.session.is_explicit_profile_command", return_value=True):
            mock_extract.return_value = {"name": "Alice"}
            asyncio.run(session.send("meu nome e Alice"))

        db.upsert_profile.assert_called_once_with("name", "Alice", "explicit")

    def test_no_trigger_saves_with_implicit_source(self):
        """is_explicit_profile_command=False -> source='implicit' in upsert_profile."""
        db = make_mock_db()
        llm = make_mock_llm("Got it!")
        session = ChatSession(llm=llm, db=db)

        with patch("jarvis.core.session.extract_profile_facts", new_callable=AsyncMock) as mock_extract, \
             patch("jarvis.core.session.is_explicit_profile_command", return_value=False):
            mock_extract.return_value = {"city": "Sao Paulo"}
            asyncio.run(session.send("I am from Sao Paulo"))

        db.upsert_profile.assert_called_once_with("city", "Sao Paulo", "implicit")

    def test_profile_extraction_no_db_skipped(self):
        """No profile extraction attempted when db is None."""
        llm = make_mock_llm("OK")
        session = ChatSession(llm=llm)

        with patch("jarvis.core.session.extract_profile_facts", new_callable=AsyncMock) as mock_extract:
            asyncio.run(session.send("Hello"))
            mock_extract.assert_not_called()

    def test_profile_extracted_with_vectors_adds_memory(self):
        """When vectors is set, extracted facts are also added to vectors."""
        db = make_mock_db()
        vectors = make_mock_vectors()
        llm = make_mock_llm("OK")
        session = ChatSession(llm=llm, db=db, vectors=vectors)

        with patch("jarvis.core.session.extract_profile_facts", new_callable=AsyncMock) as mock_extract, \
             patch("jarvis.core.session.is_explicit_profile_command", return_value=True):
            mock_extract.return_value = {"name": "Charlie"}
            asyncio.run(session.send("my name is Charlie"))

        vectors.add_memory.assert_called()


# ---------------------------------------------------------------------------
# save()
# ---------------------------------------------------------------------------


class TestSave:
    def test_save_calls_end_conversation(self):
        """save() calls db.end_conversation(conv_id)."""
        db = make_mock_db(conv_id=7)
        llm = make_mock_llm()
        session = ChatSession(llm=llm, db=db)
        asyncio.run(session.save())
        db.end_conversation.assert_called_once_with(7)

    def test_save_adds_messages_to_vectors(self):
        """save() embeds conversation messages into ChromaDB via add_memory()."""
        db = make_mock_db(conv_id=3)
        vectors = make_mock_vectors()
        llm = make_mock_llm("Hi!")
        session = ChatSession(llm=llm, db=db, vectors=vectors)
        asyncio.run(session.send("Hello"))
        asyncio.run(session.save())
        vectors.add_memory.assert_called()

    def test_save_no_db_does_not_crash(self):
        """save() without db returns without error."""
        llm = make_mock_llm()
        session = ChatSession(llm=llm)
        asyncio.run(session.save())  # Should not raise

    def test_save_no_vectors_calls_end_conversation_only(self):
        """save() without vectors still calls end_conversation."""
        db = make_mock_db(conv_id=9)
        llm = make_mock_llm()
        session = ChatSession(llm=llm, db=db, vectors=None)
        asyncio.run(session.save())
        db.end_conversation.assert_called_once_with(9)
