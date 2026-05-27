/**
 * Phase 82 — Conditional plan approval memory.
 *
 * D-02: Critical actions always interrupt (keyword detection).
 * D-01: Approved plans skip interrupt (SHA-256 key + SQLite TTL).
 * D-03: saveApproval called on user confirmation; isApprovedPlan checked before interrupt.
 */
import crypto from 'node:crypto';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import type * as schema from '../memory/schema.js';
import { approvedPlans } from '../memory/schema.js';
import type { Plan } from './types.js';

type DrizzleDb = BetterSQLite3Database<typeof schema>;

// D-02: keywords que indicam ação crítica — detectados em step.description (lowercase)
const CRITICAL_KEYWORDS = [
  'deletar', 'delete', 'remover', 'remove',
  'apagar', 'erase', 'unlink', 'rm', 'trash',
  'permission', 'chmod', 'chown', 'registry',
  'system config', 'configuração do sistema',
] as const;

/**
 * D-02: Retorna true se qualquer step do plano contém keyword crítica.
 * Normaliza para lowercase antes da comparação.
 */
export function hasCriticalAction(plan: Plan): boolean {
  return plan.steps.some((step) => {
    const desc = step.description.toLowerCase();
    return CRITICAL_KEYWORDS.some((kw) => desc.includes(kw));
  });
}

/**
 * D-01: Gera chave SHA-256 canônica do plano.
 * Normalização: lowercase + trim de cada description, sort alfabético, join com \n.
 * Sort garante que a mesma ordem sempre produz a mesma chave.
 */
export function canonicalPlanKey(plan: Plan): string {
  const normalized = plan.steps
    .map((s) => s.description.toLowerCase().trim())
    .sort()
    .join('\n');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * D-01: Verifica se a chave existe em approved_plans e não está expirada.
 * TTL checado via comparação léxica de ISO strings (funciona porque ISO 8601 é lexicograficamente ordenável).
 */
export async function isApprovedPlan(planKey: string, db: DrizzleDb): Promise<boolean> {
  const now = new Date().toISOString();
  const row = await db
    .select({ expiresAt: approvedPlans.expiresAt })
    .from(approvedPlans)
    .where(eq(approvedPlans.key, planKey))
    .limit(1);
  const expiresAt = row[0]?.expiresAt;
  if (!expiresAt) return false;
  return expiresAt > now; // ISO strings são comparáveis lexicograficamente
}

/**
 * D-03: Salva ou atualiza uma aprovação em approved_plans.
 * ttlDays padrão = 90 (D-01).
 * ON CONFLICT DO UPDATE atualiza expiresAt (re-aprovação renova TTL).
 */
export async function saveApproval(
  planKey: string,
  plan: Plan,
  db: DrizzleDb,
  ttlDays = 90,
): Promise<void> {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  await db
    .insert(approvedPlans)
    .values({
      key: planKey,
      planJson: JSON.stringify(plan),
      approvedAt: now,
      expiresAt,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: approvedPlans.key,
      set: {
        approvedAt: now,
        expiresAt,
        planJson: JSON.stringify(plan),
      },
    });
}
