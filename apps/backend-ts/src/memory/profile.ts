/**
 * User profile extraction — implicit and explicit fact learning.
 *
 * TypeScript port of `src/jarvis/memory/profile.py`.
 * Per D-03, two modes of learning user preferences:
 *   1. Explicit: user message starts with a known trigger (e.g. "lembra que...")
 *   2. Implicit: post-turn LLM analysis extracts facts
 *
 * Both functions never throw — they return empty results on any failure
 * (parity with MEM-05 swallow-and-log policy).
 */
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export const EXPLICIT_TRIGGERS: readonly string[] = [
  'lembra que',
  'lembre que',
  'lembre-se que',
  'minha preferencia e',
  'minha preferência é',
  'eu prefiro',
  'eu gosto de',
  'eu odeio',
  'eu trabalho com',
  'eu uso',
  'eu moro',
  'meu nome e',
  'meu nome é',
  'remember that',
  'my preference is',
  'i prefer',
] as const;

export const EXTRACTION_PROMPT = `Analyze the following user message and extract any personal facts, preferences, or habits.
Return a JSON object with key-value pairs. Keys should be short descriptive labels in Portuguese.
If no personal facts are found, return an empty JSON object {}.

Examples:
- "Eu trabalho com Python e Go" -> {"linguagem_trabalho": "Python e Go"}
- "Prefiro dark mode em tudo" -> {"preferencia_tema": "dark mode"}
- "Bom dia, tudo bem?" -> {}

User message: {user_input}

Return ONLY valid JSON, nothing else.`;

/** Check if the user message starts with an explicit profile trigger. Per D-03. */
export function isExplicitProfileCommand(text: string): boolean {
  const lowered = text.toLowerCase().trim();
  return EXPLICIT_TRIGGERS.some((t) => lowered.startsWith(t));
}

/** Extract string content from a LangChain message response. Handles multimodal array form. */
function extractContentString(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part && typeof (part as { text: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
    }
  }
  return '';
}

/** Strip markdown code fences (```json ... ``` or ``` ... ```). Port of Python algorithm. */
function stripCodeFences(content: string): string {
  if (!content.startsWith('```')) return content;
  const lines = content.split('\n');
  const inner: string[] = [];
  for (const line of lines.slice(1)) {
    if (line.trim() === '```') break;
    inner.push(line);
  }
  return inner.join('\n').trim();
}

/**
 * Use an LLM to extract personal facts from a user message.
 *
 * Returns a dict of {key: value} pairs (both stringified).
 * Returns {} on ANY error — never throws. Logs warnings on failure.
 */
export async function extractProfileFacts(
  llm: BaseChatModel,
  userInput: string,
): Promise<Record<string, string>> {
  try {
    const prompt = EXTRACTION_PROMPT.replace('{user_input}', userInput);
    const response = await llm.invoke([
      new SystemMessage('You are a fact extractor. Return only valid JSON.'),
      new HumanMessage(prompt),
    ]);

    let content = extractContentString(response.content).trim();
    content = stripCodeFences(content);

    const parsed: unknown = JSON.parse(content);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      out[String(k)] = String(v);
    }
    return out;
  } catch (exc) {
    console.warn(`extractProfileFacts failed: ${(exc as Error).message}`);
    return {};
  }
}
