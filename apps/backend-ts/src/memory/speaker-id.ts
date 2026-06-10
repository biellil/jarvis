/**
 * Phase 94 D-12: normalize speaker names mirroring Python _safe_profile_name.
 * Rule: trim + space→underscore, NO lowercasing (case-sensitive identity).
 * "unknown" is a reserved value — passes through unchanged (D-13).
 */
export function normalizeSpeakerId(name: string): string;
export function normalizeSpeakerId(name: undefined): undefined;
export function normalizeSpeakerId(name: string | undefined): string | undefined {
  if (name === undefined) return undefined;
  const trimmed = name.trim().replace(/ /g, '_');
  if (trimmed === '') throw new Error('Speaker name cannot be empty');
  return trimmed;
}
