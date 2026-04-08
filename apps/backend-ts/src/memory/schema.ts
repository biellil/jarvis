import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
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
