/**
 * task-keywords.ts — Phase 66 (AGENT-02, AGENT-04)
 *
 * MIRROR of apps/backend-ts/src/agent/keywords.ts.
 * Source of truth: 66-UI-SPEC.md § Cancel/Confirm/Edit keyword contract.
 *
 * IF YOU CHANGE THIS FILE, ALSO CHANGE THE BACKEND SOURCE — they MUST stay in sync.
 * The parity test in task-keywords.test.ts asserts the lists match at test time.
 */

export const CONFIRM_KEYWORDS = [
  'vai', 'sim', 'confirma', 'confirmar', 'ok', 'okay',
  'prossegue', 'prossiga', 'pode', 'manda', 'bora',
] as const;

export const CANCEL_KEYWORDS = [
  'não', 'nao', 'cancela', 'cancelar', 'para', 'parar',
  'aborta', 'abortar', 'stop', 'cancela isso', 'para tudo',
] as const;

export const EDIT_PREFIXES = [
  'edita', 'editar', 'muda', 'mudar', 'troca', 'trocar',
  'ajusta', 'ajustar', 'altera', 'alterar', 'corrige', 'corrigir',
] as const;

/** States that accept keyword short-circuit */
export type TaskUiKind = 'awaiting-confirmation' | 'executing';

export type KeywordMatch =
  | { kind: 'cancel' }
  | { kind: 'confirm' }
  | { kind: 'edit'; feedback: string };

/**
 * Matches a transcribed utterance against the task keyword lists.
 *
 * Algorithm (UI-SPEC § Cancel/Confirm/Edit keyword contract):
 * 1. trim + lowercase + strip trailing punctuation
 * 2. Cancel matches during BOTH awaiting-confirmation AND executing
 * 3. Confirm matches ONLY during awaiting-confirmation
 * 4. Edit prefix matches ONLY during awaiting-confirmation:
 *    - whole utterance === prefix → { kind:'edit', feedback:'' } (open edit mode)
 *    - utterance starts with prefix + ' ' → { kind:'edit', feedback: rest }
 * 5. Returns null if no match (falls through to /api/chat)
 */
export function matchTaskKeyword(
  utterance: string,
  taskState: TaskUiKind,
): KeywordMatch | null {
  const lower = utterance.trim().toLowerCase().replace(/[.!?,]+$/, '');
  if (!lower) return null;

  if ((CANCEL_KEYWORDS as readonly string[]).includes(lower)) {
    return { kind: 'cancel' };
  }

  if (taskState === 'awaiting-confirmation') {
    if ((CONFIRM_KEYWORDS as readonly string[]).includes(lower)) {
      return { kind: 'confirm' };
    }
    for (const prefix of EDIT_PREFIXES) {
      if (lower === prefix) return { kind: 'edit', feedback: '' };
      if (lower.startsWith(prefix + ' ')) {
        return { kind: 'edit', feedback: utterance.slice(prefix.length + 1).trim() };
      }
    }
  }

  return null;
}
