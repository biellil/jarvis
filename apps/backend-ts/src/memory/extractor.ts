/**
 * MemoryExtractor — Phase 36-P01 (MEMW-01, MEMW-02, MEMW-03, MTYPE-01..04)
 *
 * Wraps any LangChain BaseChatModel with withStructuredOutput() + Zod discriminated union
 * to guarantee type-safe extraction. LLM output is validated server-side before any
 * database write.
 *
 * Error handling: all errors are caught and logged (MEMW-03 parity) — never throws.
 */
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';

/**
 * Discriminated union for memory extraction output.
 * Discriminator field is 'type' — must appear first in each branch for LLM clarity.
 */
export const extractionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('semantic'),
    content: z
      .string()
      .min(10)
      .max(500)
      .describe(
        'Stable user fact or preference that persists across sessions. Example: "Biel prefers direct answers"',
      ),
    confidence: z
      .number()
      .min(0)
      .max(1)
      .describe('0.0–1.0 confidence in this extraction; 0.8+ recommended for semantic'),
  }),
  z.object({
    type: z.literal('episodic'),
    content: z
      .string()
      .min(10)
      .max(500)
      .describe(
        'Timestamped event, decision, or statement from this conversation. Example: "User reported a bug in login flow"',
      ),
    confidence: z
      .number()
      .min(0)
      .max(1)
      .describe('Confidence in event extraction; lower thresholds OK for episodic'),
  }),
  z.object({
    type: z.literal('procedural'),
    content: z
      .string()
      .min(10)
      .max(500)
      .describe(
        'How-to, workaround, or problem-solving flow. Example: "To reset WiFi: Settings → Network → Reset"',
      ),
    confidence: z.number().min(0).max(1),
  }),
]);

export type Extraction = z.infer<typeof extractionSchema>;

const EXTRACTION_PROMPT = `You are an expert at extracting key facts and events from conversations.

Given a user message and JARVIS's response, extract 1-3 memories that are:
- **semantic**: Stable facts about the user's preferences, work, or situation (e.g., "uses TypeScript", "prefers concise answers")
- **episodic**: Specific events, decisions, or problems mentioned (e.g., "reported bug in login", "discussed architecture yesterday")
- **procedural**: How-tos, workflows, or solutions (e.g., "to reset the device, hold power for 10s")

Return an array of extracted memories. Each must have type, content (10-500 chars), and confidence (0.0-1.0).
If no memories are worth extracting, return an empty array.

User message: {userText}
Assistant response: {assistantText}`;

export class MemoryExtractor {
  private readonly structuredLlm: {
    invoke: (messages: HumanMessage[]) => Promise<unknown>;
  };

  constructor(llm: BaseChatModel) {
    // Enforce structured output — LLM must return JSON matching extractionSchema
    this.structuredLlm = llm.withStructuredOutput(extractionSchema) as {
      invoke: (messages: HumanMessage[]) => Promise<unknown>;
    };
  }

  /**
   * Extract 0-3 typed memories from a conversation turn.
   * Returns [] on any error (MEMW-03: silent failure, log only).
   */
  async extractMemories(userText: string, assistantText: string): Promise<Extraction[]> {
    try {
      const prompt = EXTRACTION_PROMPT.replace('{userText}', userText).replace(
        '{assistantText}',
        assistantText,
      );
      const result = await this.structuredLlm.invoke([new HumanMessage(prompt)]);

      if (Array.isArray(result)) {
        return result as Extraction[];
      } else if (result !== null && result !== undefined && typeof result === 'object' && 'type' in result) {
        return [result as Extraction];
      } else {
        return [];
      }
    } catch (err) {
      console.warn(`[extractor] extractMemories failed: ${(err as Error).message}`);
      return [];
    }
  }
}
