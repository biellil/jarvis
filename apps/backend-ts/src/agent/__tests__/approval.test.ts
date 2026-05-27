import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { hasCriticalAction, canonicalPlanKey, isApprovedPlan, saveApproval } from '../approval.js';
import { createStoreForTests } from '../../memory/store.js';
import type { Plan } from '../types.js';

// ──────────────────────────────────────────────────────────────────────────────
// DB setup — in-memory SQLite with migrations
// ──────────────────────────────────────────────────────────────────────────────

const DB_PATH = path.join(os.tmpdir(), `approval-test-${Date.now()}.sqlite`);
let db: ReturnType<typeof createStoreForTests>['db'];
let sqlite: ReturnType<typeof createStoreForTests>['sqlite'];

beforeAll(() => {
  const store = createStoreForTests(DB_PATH);
  db = store.db;
  sqlite = store.sqlite;
});

afterAll(() => {
  sqlite.close();
});

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

const safeStep = (desc: string) => ({ id: 1, description: desc, expectedOutcome: 'done' });
const safePlan = (desc: string): Plan => ({ steps: [safeStep(desc)] });

// ──────────────────────────────────────────────────────────────────────────────
// KWD-01 — hasCriticalAction keyword detection
// ──────────────────────────────────────────────────────────────────────────────

describe('hasCriticalAction', () => {
  it('KWD-01: returns true for step with "delete"', () => {
    const plan: Plan = {
      steps: [{ id: 1, description: 'delete file.txt', expectedOutcome: 'done' }],
    };
    expect(hasCriticalAction(plan)).toBe(true);
  });

  it('KWD-01b: case-insensitive — "DELETE FILE.TXT" is critical', () => {
    const plan: Plan = {
      steps: [{ id: 1, description: 'DELETE FILE.TXT', expectedOutcome: 'done' }],
    };
    expect(hasCriticalAction(plan)).toBe(true);
  });

  it('KWD-01c: "chmod 755 script.sh" is critical', () => {
    const plan: Plan = {
      steps: [{ id: 1, description: 'chmod 755 script.sh', expectedOutcome: 'done' }],
    };
    expect(hasCriticalAction(plan)).toBe(true);
  });

  it('KWD-01d: "listar arquivos em Downloads" is NOT critical', () => {
    const plan: Plan = {
      steps: [{ id: 1, description: 'listar arquivos em Downloads', expectedOutcome: '14 files' }],
    };
    expect(hasCriticalAction(plan)).toBe(false);
  });

  it('KWD-01e: "remover item da lista de display" is critical (keyword "remover")', () => {
    const plan: Plan = {
      steps: [{ id: 1, description: 'remover item da lista de display', expectedOutcome: 'done' }],
    };
    expect(hasCriticalAction(plan)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// KEY-01 — canonicalPlanKey determinism
// ──────────────────────────────────────────────────────────────────────────────

describe('canonicalPlanKey', () => {
  it('KEY-01: same descriptions in different sort order produce same key', () => {
    const plan1: Plan = {
      steps: [
        { id: 1, description: 'Passo A', expectedOutcome: 'done A' },
        { id: 2, description: 'Passo B', expectedOutcome: 'done B' },
      ],
    };
    // Same descriptions but reordered
    const plan2: Plan = {
      steps: [
        { id: 1, description: 'Passo B', expectedOutcome: 'done B' },
        { id: 2, description: 'Passo A', expectedOutcome: 'done A' },
      ],
    };
    expect(canonicalPlanKey(plan1)).toBe(canonicalPlanKey(plan2));
  });

  it('KEY-01b: different descriptions produce different keys', () => {
    const plan1: Plan = {
      steps: [{ id: 1, description: 'Passo A', expectedOutcome: 'done' }],
    };
    const plan2: Plan = {
      steps: [{ id: 1, description: 'Passo B', expectedOutcome: 'done' }],
    };
    expect(canonicalPlanKey(plan1)).not.toBe(canonicalPlanKey(plan2));
  });

  it('KEY-01c: key is a 64-char hex string (SHA-256)', () => {
    const key = canonicalPlanKey(safePlan('Listar arquivos'));
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// APR-01..03 — isApprovedPlan + saveApproval
// ──────────────────────────────────────────────────────────────────────────────

describe('isApprovedPlan / saveApproval', () => {
  it('APR-01: returns false when table is empty', async () => {
    const result = await isApprovedPlan('nonexistent-key-1234', db as any);
    expect(result).toBe(false);
  });

  it('APR-02: saveApproval then isApprovedPlan returns true within TTL', async () => {
    const plan = safePlan('Organizar Downloads');
    const key = canonicalPlanKey(plan);
    await saveApproval(key, plan, db as any, 90);
    const result = await isApprovedPlan(key, db as any);
    expect(result).toBe(true);
  });

  it('APR-03: returns false for key with expires_at in the past', async () => {
    const plan = safePlan('Plano expirado');
    const key = canonicalPlanKey(plan);
    // Save with ttlDays = 0 (expires immediately in the past)
    await saveApproval(key, plan, db as any, -1);
    const result = await isApprovedPlan(key, db as any);
    expect(result).toBe(false);
  });

  it('APR-04: re-saving updates expiresAt (upsert renews TTL)', async () => {
    const plan = safePlan('Plano renovado');
    const key = canonicalPlanKey(plan);
    // First save with negative TTL (expired)
    await saveApproval(key, plan, db as any, -1);
    const firstResult = await isApprovedPlan(key, db as any);
    expect(firstResult).toBe(false);
    // Re-save with valid TTL
    await saveApproval(key, plan, db as any, 90);
    const renewedResult = await isApprovedPlan(key, db as any);
    expect(renewedResult).toBe(true);
  });
});
