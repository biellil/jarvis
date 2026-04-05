"""SQLite persistence layer for conversations, messages, summaries, user profile, and tool audit log.

Per MEM-01: Every conversation is saved automatically with timestamp.
Per MEM-05: Write errors are caught and logged (loguru), never crash the session.
Per D-02: Session history saved on exit via start_conversation + save_messages.
Per TOOL-05: Every tool call is recorded in tool_calls table.
"""

import json
import sqlite3
from datetime import datetime, timezone
from typing import Optional

from loguru import logger


TOOL_CALLS_SQL = """
CREATE TABLE IF NOT EXISTS tool_calls (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp    TEXT NOT NULL,
    tool_name    TEXT NOT NULL,
    params_json  TEXT,
    outcome      TEXT CHECK(outcome IN ('success', 'error', 'cancelled')),
    error        TEXT
);
"""

CREATE_SQL = """
CREATE TABLE IF NOT EXISTS conversations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at  TEXT NOT NULL,
    ended_at    TEXT
);

CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    role            TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content         TEXT NOT NULL,
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS summaries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    content         TEXT NOT NULL,
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_profile (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    key         TEXT NOT NULL,
    value       TEXT NOT NULL,
    source      TEXT NOT NULL CHECK(source IN ('implicit', 'explicit')),
    created_at  TEXT NOT NULL,
    UNIQUE(key)
);
"""


def _now() -> str:
    """Return current UTC time as ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


class MemoryStore:
    """SQLite-backed store for JARVIS persistent memory.

    All mutating methods wrap operations in try/except, log errors with
    logger.warning(), and do NOT re-raise. This ensures write failures never
    crash an active conversation session (MEM-05).
    """

    def __init__(self, db_path: str) -> None:
        self._conn = sqlite3.connect(db_path)
        self._conn.executescript(CREATE_SQL)

    # ------------------------------------------------------------------
    # Conversation lifecycle
    # ------------------------------------------------------------------

    def start_conversation(self) -> Optional[int]:
        """Insert a new conversation row and return its ID.

        Returns None on SQLite error (error is logged, not raised).
        """
        try:
            cursor = self._conn.execute(
                "INSERT INTO conversations (started_at) VALUES (?)",
                (_now(),),
            )
            self._conn.commit()
            return cursor.lastrowid
        except sqlite3.Error as exc:
            logger.warning(f"MemoryStore.start_conversation failed: {exc}")
            return None

    def end_conversation(self, conv_id: int) -> None:
        """Mark a conversation as ended by setting ended_at timestamp."""
        try:
            self._conn.execute(
                "UPDATE conversations SET ended_at = ? WHERE id = ?",
                (_now(), conv_id),
            )
            self._conn.commit()
        except sqlite3.Error as exc:
            logger.warning(f"MemoryStore.end_conversation failed (conv_id={conv_id}): {exc}")

    # ------------------------------------------------------------------
    # Message persistence
    # ------------------------------------------------------------------

    def save_messages(self, conv_id: int, messages: list[tuple[str, str, str]]) -> None:
        """Persist a list of (role, content, created_at) tuples for a conversation.

        Per D-05: called after each turn to ensure crash-safety.
        """
        try:
            self._conn.executemany(
                "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)",
                [(conv_id, role, content, ts) for role, content, ts in messages],
            )
            self._conn.commit()
        except sqlite3.Error as exc:
            logger.warning(f"MemoryStore.save_messages failed (conv_id={conv_id}): {exc}")

    # ------------------------------------------------------------------
    # Summaries
    # ------------------------------------------------------------------

    def save_summary(self, conv_id: int, content: str) -> None:
        """Persist a conversation summary (optional, for future compression).

        Logs and returns silently on error.
        """
        try:
            self._conn.execute(
                "INSERT INTO summaries (conversation_id, content, created_at) VALUES (?, ?, ?)",
                (conv_id, content, _now()),
            )
            self._conn.commit()
        except sqlite3.Error as exc:
            logger.warning(f"MemoryStore.save_summary failed (conv_id={conv_id}): {exc}")

    # ------------------------------------------------------------------
    # User profile
    # ------------------------------------------------------------------

    def upsert_profile(self, key: str, value: str, source: str) -> None:
        """Insert or update a user profile fact.

        On key conflict, updates value, source, and created_at. Per D-03.
        Silently logs and returns on SQLite error.
        """
        try:
            self._conn.execute(
                """
                INSERT INTO user_profile (key, value, source, created_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    source = excluded.source,
                    created_at = excluded.created_at
                """,
                (key, value, source, _now()),
            )
            self._conn.commit()
        except sqlite3.Error as exc:
            logger.warning(f"MemoryStore.upsert_profile failed (key={key!r}): {exc}")

    def get_profile_facts(self) -> list[tuple[str, str, str, str]]:
        """Return all profile entries as (key, value, source, created_at) tuples.

        Returns an empty list on SQLite error.
        """
        try:
            cursor = self._conn.execute(
                "SELECT key, value, source, created_at FROM user_profile ORDER BY id"
            )
            return cursor.fetchall()
        except sqlite3.Error as exc:
            logger.warning(f"MemoryStore.get_profile_facts failed: {exc}")
            return []

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def close(self) -> None:
        """Close the SQLite connection."""
        try:
            self._conn.close()
        except sqlite3.Error as exc:
            logger.warning(f"MemoryStore.close failed: {exc}")


class ToolLogger:
    """Audit log for tool calls using a dedicated tool_calls SQLite table.

    Per TOOL-05: Every tool call (success, error, cancelled) is recorded.
    Per MEM-05 pattern: SQLite errors are caught and logged, never re-raised.
    """

    def __init__(self, db_path: str) -> None:
        self._conn = sqlite3.connect(db_path)
        self._conn.executescript(TOOL_CALLS_SQL)

    def log(
        self,
        tool_name: str,
        params: dict,
        outcome: str,
        error: str = None,
    ) -> None:
        """Record a tool call with its outcome.

        Args:
            tool_name: Name of the @tool function called.
            params: Dict of parameters passed to the tool.
            outcome: One of 'success', 'error', or 'cancelled'.
            error: Optional error message for outcome='error'.
        """
        try:
            self._conn.execute(
                "INSERT INTO tool_calls (timestamp, tool_name, params_json, outcome, error)"
                " VALUES (?, ?, ?, ?, ?)",
                (_now(), tool_name, json.dumps(params, ensure_ascii=False), outcome, error),
            )
            self._conn.commit()
        except sqlite3.Error as exc:
            logger.warning(f"ToolLogger.log failed ({tool_name}): {exc}")

    def close(self) -> None:
        """Close the SQLite connection."""
        try:
            self._conn.close()
        except sqlite3.Error as exc:
            logger.warning(f"ToolLogger.close failed: {exc}")
