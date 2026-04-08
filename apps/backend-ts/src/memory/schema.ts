import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Enums for roles and sources
export const roleEnum = ['user', 'assistant', 'system'] as const;
export const sourceEnum = ['implicit', 'explicit'] as const;
export const outcomeEnum = ['success', 'error', 'cancelled'] as const;

export const conversations = sqliteTable('conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
});

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: integer('conversation_id').notNull().references(() => conversations.id),
  role: text('role', { enum: roleEnum }).notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull(),
});

export const summaries = sqliteTable('summaries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: integer('conversation_id').notNull().references(() => conversations.id),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull(),
});

export const userProfile = sqliteTable('user_profile', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  source: text('source', { enum: sourceEnum }).notNull(),
  createdAt: text('created_at').notNull(),
});

export const toolCalls = sqliteTable('tool_calls', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: text('timestamp').notNull(),
  toolName: text('tool_name').notNull(),
  paramsJson: text('params_json', { mode: 'json' }),
  outcome: text('outcome', { enum: outcomeEnum }).notNull(),
  error: text('error'),
});

// Define relations for Drizzle ORM
export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
  summaries: many(summaries),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const summariesRelations = relations(summaries, ({ one }) => ({
  conversation: one(conversations, {
    fields: [summaries.conversationId],
    references: [conversations.id],
  }),
}));