// Source of truth: 66-UI-SPEC.md § Cancel/Confirm/Edit keyword contract.
// Renderer mirrors this list (apps/desktop/src/renderer/src/voice/voiceInput/sendAudioAndHandle.ts in Plan 04).

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

export type TaskUiKind = 'awaiting-confirmation' | 'executing';

export type KeywordMatch =
  | { kind: 'cancel' }
  | { kind: 'confirm' }
  | { kind: 'edit'; feedback: string };

/**
 * Match algorithm per UI-SPEC: trim + lowercase + strip trailing punctuation.
 * Confirm/Cancel match WHOLE utterance.
 * Edit matches FIRST WORD as prefix; rest of utterance becomes feedback.
 * If empty feedback after prefix, returns kind:'edit' with feedback:'' (caller transitions to State 2 editMode:true).
 */
export function matchTaskKeyword(
  utterance: string,
  taskState: TaskUiKind,
): KeywordMatch | null {
  const lower = utterance.trim().toLowerCase().replace(/[.!?,]+$/, '');
  if (!lower) return null;
  // Cancel works in BOTH awaiting-confirmation AND executing
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
