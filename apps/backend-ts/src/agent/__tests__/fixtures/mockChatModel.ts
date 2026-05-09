import { z } from 'zod';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Runnable } from '@langchain/core/runnables';

interface MockOptions<TPlan> {
  planResponse?: TPlan;
  failNext?: boolean;
  capturedPrompts?: string[]; // Tests can read this to assert prompt content
}

/**
 * Lightweight mock for BaseChatModel that only implements withStructuredOutput.
 * Used by planner.test.ts, executor.test.ts, and graph.test.ts.
 * Returns Plan from `options.planResponse`.
 *
 * NOT a full BaseChatModel — only the methods Phase 66 actually calls.
 */
export function createMockChatModel<TPlan = unknown>(
  options: MockOptions<TPlan> = {},
): BaseChatModel {
  const captured = options.capturedPrompts ?? [];
  const stub = {
    withStructuredOutput<T>(_schema: z.ZodType<T>): Runnable<unknown, T> {
      return {
        invoke: async (input: unknown): Promise<T> => {
          if (options.failNext) {
            throw new Error('Mock LLM forced failure (OutputParserException analog)');
          }
          // Capture for assertion (input is BaseMessage[] or string)
          if (Array.isArray(input)) {
            for (const msg of input as Array<{ content?: unknown }>) {
              if (msg && typeof msg.content === 'string') captured.push(msg.content);
            }
          } else if (typeof input === 'string') {
            captured.push(input);
          }
          return (options.planResponse ?? { steps: [] }) as T;
        },
      } as unknown as Runnable<unknown, T>;
    },
    invoke: async () => {
      throw new Error('mockChatModel.invoke not implemented — use withStructuredOutput path');
    },
  };
  return stub as unknown as BaseChatModel;
}
