import { z } from 'zod';

// D-05 plan schema — verbatim. pt-BR strings, hard cap 15 steps.
export const planSchema = z.object({
  steps: z
    .array(
      z.object({
        id: z.number().int().positive(),
        description: z.string().min(3).max(200),
        expectedOutcome: z.string().min(3).max(200),
      }),
    )
    .min(1)
    .max(15),
});

export type Plan = z.infer<typeof planSchema>;

export interface StepResult {
  stepId: number;
  status: 'success' | 'error' | 'skipped';
  outputSummary: string;
  toolName?: string;
}

// D-02 + D-16 — every kind the planner/executor interrupt can resume with
export type ResumeCommand =
  | { kind: 'confirm' }
  | { kind: 'cancel' }
  | { kind: 'edit'; feedback: string }
  | { kind: 'continue' }
  | { kind: 'replan' }
  | { kind: 'abort' };

// Mirrored on renderer in apps/desktop/src/shared/ipc-types.ts (Task 3 below).
// D-10 SSE event taxonomy.
export type TaskSseEvent =
  | { kind: 'task:plan'; taskId: string; plan: Plan }
  | { kind: 'task:awaiting-confirmation'; taskId: string }
  | { kind: 'task:edit-loop'; taskId: string }
  | { kind: 'task:step:start'; taskId: string; stepId: number; description: string }
  | { kind: 'task:step:end'; taskId: string; stepId: number; status: 'success' | 'error'; summary: string; toolName?: string }
  | { kind: 'task:awaiting-failure-decision'; taskId: string; stepId: number; error: string }
  | { kind: 'task:done'; taskId: string; summary: string }
  | { kind: 'task:cancelled'; taskId: string; atStep: number }
  | { kind: 'task:error'; taskId: string; atStep: number; message: string };

// POST /api/tasks/:taskId/resume body — V5 input validation (RESEARCH § Security Domain)
//
// WR-03: `cancel` is intentionally excluded — clients MUST use the dedicated
// POST /api/tasks/:taskId/cancel endpoint for cancellation. Accepting `cancel`
// here would silently fall through to the `abort` branch on a `step-failure`
// interrupt (executor.ts), masking a protocol mismatch. Single source of truth:
// /cancel for cancellation; /resume for confirm/edit/continue/replan/abort.
export const resumeRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('confirm') }),
  z.object({ kind: z.literal('edit'), feedback: z.string().min(1).max(500) }),
  z.object({ kind: z.literal('continue') }),
  z.object({ kind: z.literal('replan') }),
  z.object({ kind: z.literal('abort') }),
]);
export type ResumeRequest = z.infer<typeof resumeRequestSchema>;
