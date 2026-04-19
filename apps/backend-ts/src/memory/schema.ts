import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Enums
export const messageRoleEnum = ['user', 'assistant', 'system'] as const;
export const userProfileSourceEnum = ['implicit', 'explicit'] as const;
export const toolCallOutcomeEnum = ['dispatched', 'success', 'error', 'cancelled'] as const;

// Conversations Table
export const conversations = sqliteTable('conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
});

export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
  summaries: many(summaries),
  typedMemories: many(typedMemories),
}));

// Messages Table
export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: integer('conversation_id').notNull().references(() => conversations.id),
  role: text('role', { enum: messageRoleEnum }).notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull(),
});

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

// Summaries Table
export const summaries = sqliteTable('summaries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: integer('conversation_id').notNull().references(() => conversations.id),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull(),
});

export const summariesRelations = relations(summaries, ({ one }) => ({
  conversation: one(conversations, {
    fields: [summaries.conversationId],
    references: [conversations.id],
  }),
}));

// User Profile Table
export const userProfile = sqliteTable('user_profile', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  source: text('source', { enum: userProfileSourceEnum }).notNull(),
  createdAt: text('created_at').notNull(),
});

// Voice Calls Table (Phase 19-05)
export const voiceCalls = sqliteTable('voice_calls', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: integer('conversation_id').references(() => conversations.id),
  timestamp: text('timestamp').notNull(),
  audioBytes: integer('audio_bytes').notNull(),
  transcription: text('transcription'),
  sttProvider: text('stt_provider').notNull(),
  sttLatencyMs: integer('stt_latency_ms'),
  ttsProvider: text('tts_provider'),
  ttsLatencyMs: integer('tts_latency_ms'),
  ttsBytes: integer('tts_bytes'),
  success: integer('success').notNull(),
  error: text('error'),
});

// Tool Calls Table
export const toolCalls = sqliteTable('tool_calls', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: text('timestamp').notNull(),
  toolName: text('tool_name').notNull(),
  paramsJson: text('params_json', { mode: 'json' }).$type<Record<string, any> | null>(),
  outcome: text('outcome', { enum: toolCallOutcomeEnum }),
  output: text('output'),
  error: text('error'),
});

// Typed Memories Table (Phase 35 — v1.8 Memory Intelligence)
export const typedMemoriesEnum = ['semantic', 'episodic', 'procedural'] as const;

export const typedMemories = sqliteTable('typed_memories', {
  id: text('id').primaryKey(),
  conversationId: integer('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  type: text('type', { enum: typedMemoriesEnum }).notNull(),
  content: text('content').notNull(),
  confidence: real('confidence'),
  extractedAt: text('extracted_at').notNull(),
  sourceId: integer('source_id').references(() => messages.id, { onDelete: 'set null' }),
  source: text('source'),
  createdAt: text('created_at').notNull(),
});

export const typedMemoriesRelations = relations(typedMemories, ({ one }) => ({
  conversation: one(conversations, {
    fields: [typedMemories.conversationId],
    references: [conversations.id],
  }),
  sourceMessage: one(messages, {
    fields: [typedMemories.sourceId],
    references: [messages.id],
  }),
}));
