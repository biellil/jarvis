-- Phase 94: Per-Speaker Memory Isolation
-- Add speaker_id column to messages and typed_memories tables.
-- Existing rows are backfilled as NULL (treated as unknown_speaker at query time).

ALTER TABLE messages ADD COLUMN speaker_id TEXT;
CREATE INDEX IF NOT EXISTS idx_messages_speaker_id ON messages (speaker_id);
CREATE INDEX IF NOT EXISTS idx_messages_speaker_created ON messages (speaker_id, created_at);

ALTER TABLE typed_memories ADD COLUMN speaker_id TEXT;
CREATE INDEX IF NOT EXISTS idx_typed_memories_speaker_id ON typed_memories (speaker_id);
