/**
 * TaskCheckList — Phase 66 (AGENT-02, AGENT-03, AGENT-04)
 *
 * Single component implementing all 8 visual states from UI-SPEC § Visual Variants.
 * State machine driven — derives all rendering from the `state: TaskUiState` prop.
 * editMode is derived from props (state.editMode), NOT from local useState —
 * single source of truth is the ChatContext reducer (D-09 compliance).
 *
 * Reuses existing primitives: Button, Field, Input, Progress (no new deps).
 * All copy is pt-BR per UI-SPEC § Copywriting Contract.
 * ARIA contract from UI-SPEC § Accessibility fully implemented.
 */
import * as React from 'react';
import { Check, X, Circle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import type { TaskUiState, StepUiState } from '../../../shared/ipc-types';

export interface TaskCheckListProps {
  taskId: string;
  state: TaskUiState;
  onConfirm: () => void;
  onCancel: () => void;
  onEditSubmit: (feedback: string) => void;
  onFailureContinue: () => void;
  onFailureReplan: () => void;
  onFailureAbort: () => void;
  /** Dispatched when the user clicks "Editar" — caller flips state.editMode to true via ChatContext */
  onRequestEditMode: () => void;
  /** Dispatched when the user clicks "Voltar" or hits Esc inside edit-mode */
  onCancelEditMode: () => void;
}

type StepStatus = StepUiState['status'];

/**
 * StepIcon — renders the correct icon for a step status.
 * Color-blind safe: shape + color, never color-only (UI-SPEC § Accessibility).
 */
function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'success') {
    return <Check className="size-4 text-success shrink-0" aria-hidden />;
  }
  if (status === 'error') {
    return <X className="size-4 text-destructive shrink-0" aria-hidden />;
  }
  if (status === 'running') {
    return <Progress variant="circular" className="size-4 shrink-0" aria-hidden />;
  }
  if (status === 'cancelled-skip') {
    // Dashed circle via SVG stroke-dasharray — UI-SPEC § Color table "cancelled-skip"
    return (
      <Circle
        className="size-4 text-fg-subtle shrink-0 [stroke-dasharray:2_2]"
        aria-hidden
      />
    );
  }
  // pending
  return <Circle className="size-4 text-fg-disabled shrink-0" aria-hidden />;
}

export function TaskCheckList({
  taskId,
  state,
  onConfirm,
  onCancel,
  onEditSubmit,
  onFailureContinue,
  onFailureReplan,
  onFailureAbort,
  onRequestEditMode,
  onCancelEditMode,
}: TaskCheckListProps): React.ReactElement {
  /**
   * editMode is DERIVED from props every render — single source of truth is
   * the reducer in ChatContext. Local React state would stale-sync when the
   * backend dispatches `task:edit-loop` and the reducer resets editMode to false
   * in the same render cycle.
   */
  const editMode = state.kind === 'awaiting-confirmation' && state.editMode;

  const [editFeedback, setEditFeedback] = React.useState('');

  // Container-level Esc handling — UI-SPEC § Accessibility lines 401, 403, 404
  const onKeyDown = (evt: React.KeyboardEvent<HTMLDivElement>) => {
    if (evt.key === 'Escape') {
      if (editMode) {
        onCancelEditMode();
        evt.preventDefault();
        return;
      }
      if (state.kind === 'awaiting-confirmation' || state.kind === 'executing') {
        onCancel();
        evt.preventDefault();
      }
    }
  };

  // ── State 1 + 2 — awaiting-confirmation ───────────────────────────────

  if (state.kind === 'awaiting-confirmation') {
    if (editMode) {
      // State 2 — edit mode
      return (
        <div
          role="region"
          aria-label="Plano de execução pendente"
          className="bg-surface rounded-lg p-base"
          onKeyDown={onKeyDown}
        >
          {/* Read-only plan list — dimmed (UI-SPEC State 2) */}
          <ol role="list" className="space-y-sm mb-md">
            {state.plan.steps.map((s) => (
              <li
                key={s.id}
                role="listitem"
                className="flex items-start gap-xs text-sm text-fg-disabled"
              >
                <Circle className="size-4 text-fg-disabled shrink-0" aria-hidden />
                <span>
                  {s.id}. {s.description}
                </span>
              </li>
            ))}
          </ol>
          <Field>
            <Field.Label>Editar plano</Field.Label>
            <Field.Control>
              <Input
                autoFocus
                value={editFeedback}
                onChange={(e) => setEditFeedback(e.target.value)}
                placeholder="Como você quer ajustar o plano?"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && editFeedback.trim()) {
                    onEditSubmit(editFeedback.trim());
                  }
                }}
              />
            </Field.Control>
          </Field>
          <div className="flex gap-sm mt-md">
            <Button
              variant="primary"
              size="sm"
              disabled={!editFeedback.trim()}
              onClick={() => {
                if (editFeedback.trim()) onEditSubmit(editFeedback.trim());
              }}
            >
              Aplicar
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancelEditMode}>
              Voltar
            </Button>
          </div>
        </div>
      );
    }

    // State 1 — normal awaiting-confirmation
    return (
      <div
        role="region"
        aria-label="Plano de execução pendente"
        className="bg-surface rounded-lg p-base"
        onKeyDown={onKeyDown}
      >
        <h3 className="text-base font-semibold mb-md">Aqui está o plano:</h3>
        <ol role="list" className="space-y-sm mb-md">
          {state.plan.steps.map((s) => (
            <li
              key={s.id}
              role="listitem"
              className="flex items-start gap-xs text-sm text-fg-disabled"
            >
              <Circle className="size-4 text-fg-disabled shrink-0" aria-hidden />
              <span>
                {s.id}. {s.description}
              </span>
            </li>
          ))}
        </ol>
        <p className="flex items-start gap-xs text-xs text-fg-subtle mt-md">
          <Info className="size-3 shrink-0 mt-[1px]" aria-hidden />
          <span>
            JARVIS não desfaz ações já executadas. Cancele o quanto antes se mudar de
            ideia.
          </span>
        </p>
        <div className="flex gap-sm mt-lg">
          {/* autoFocus on Confirmar — UI-SPEC § Accessibility line 397 */}
          <Button variant="primary" size="sm" autoFocus onClick={onConfirm}>
            Confirmar
          </Button>
          <Button variant="secondary" size="sm" onClick={onRequestEditMode}>
            Editar
          </Button>
          <Button variant="destructive" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  // ── State 3 — editing-loop ─────────────────────────────────────────────

  if (state.kind === 'editing-loop') {
    return (
      <div
        role="region"
        aria-label="Replanejando"
        aria-busy="true"
        className="bg-surface rounded-lg p-base"
      >
        <ol role="list" className="space-y-sm mb-md">
          {state.previousPlan.steps.map((s) => (
            <li
              key={s.id}
              className="flex items-start gap-xs text-sm text-fg-disabled line-through"
            >
              <Circle className="size-4 text-fg-disabled shrink-0" aria-hidden />
              <span>
                {s.id}. {s.description}
              </span>
            </li>
          ))}
        </ol>
        <p className="flex items-center gap-xs text-sm text-fg-muted">
          <Progress variant="circular" className="size-4 text-accent shrink-0" aria-hidden />
          <span>Replanejando…</span>
        </p>
      </div>
    );
  }

  // ── State 4 — executing ────────────────────────────────────────────────

  if (state.kind === 'executing') {
    return (
      <div
        role="region"
        aria-label="Tarefa em execução"
        aria-busy="true"
        className="bg-surface rounded-lg p-base"
        onKeyDown={onKeyDown}
      >
        <ol
          role="list"
          aria-live="polite"
          aria-atomic="false"
          className="space-y-sm mb-md"
        >
          {state.steps.map((s) => {
            const isRunning = s.status === 'running';
            const rowClass = isRunning
              ? 'border-l-2 border-accent pl-sm flex items-start gap-xs text-sm text-fg'
              : `flex items-start gap-xs text-sm ${
                  s.status === 'success' || s.status === 'error'
                    ? 'text-fg-muted'
                    : 'text-fg-disabled'
                }`;
            return (
              <li
                key={s.id}
                role="listitem"
                aria-current={isRunning ? 'step' : undefined}
                className={rowClass}
              >
                <StepIcon status={s.status} />
                <div className="flex-1">
                  <div>
                    {s.id}. {s.description}
                  </div>
                  {s.status === 'success' && s.outputSummary && (
                    <div className="ml-base text-xs text-fg-subtle">
                      └ {s.outputSummary}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        <Button variant="destructive" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    );
  }

  // ── State 5 — awaiting-failure-decision ────────────────────────────────

  if (state.kind === 'awaiting-failure-decision') {
    const titleId = `task-failure-title-${taskId}`;
    return (
      <div
        role="alertdialog"
        aria-labelledby={titleId}
        className="bg-surface rounded-lg p-base"
      >
        {/* sr-only heading — UI-SPEC § Accessibility "Screen reader — failure dialog" */}
        <h2 id={titleId} className="sr-only">
          Falha na etapa {state.failedStepId}
        </h2>
        <ol role="list" className="space-y-sm mb-md">
          {state.steps.map((s) => (
            <li key={s.id} className="flex flex-col">
              <div className="flex items-start gap-xs text-sm">
                <StepIcon status={s.status} />
                <span
                  className={
                    s.status === 'error' || s.status === 'success'
                      ? 'text-fg-muted'
                      : 'text-fg-disabled'
                  }
                >
                  {s.id}. {s.description}
                </span>
              </div>
              {s.id === state.failedStepId && (
                <div className="ml-base text-xs text-destructive mt-xs">
                  └ Erro: {state.errorMessage}
                </div>
              )}
            </li>
          ))}
        </ol>
        {/* Screen reader live alert for the error — announced immediately (UI-SPEC § Accessibility) */}
        <div role="alert" className="sr-only">
          Erro: {state.errorMessage}
        </div>
        <div className="flex gap-sm mt-lg">
          <Button variant="primary" size="sm" onClick={onFailureContinue}>
            Continuar
          </Button>
          <Button variant="secondary" size="sm" onClick={onFailureReplan}>
            Replanejar
          </Button>
          <Button variant="destructive" size="sm" onClick={onFailureAbort}>
            Abortar
          </Button>
        </div>
      </div>
    );
  }

  // ── State 6 — done ─────────────────────────────────────────────────────

  if (state.kind === 'done') {
    return (
      <div
        role="region"
        aria-label="Tarefa concluída"
        className="bg-surface rounded-lg p-base"
      >
        <p className="flex items-center gap-xs text-base font-semibold mb-md">
          <Check className="size-4 text-success shrink-0" aria-hidden />
          <span>Tarefa concluída.</span>
        </p>
        <p className="text-sm text-fg-muted">{state.summary}</p>
      </div>
    );
  }

  // ── State 7 — cancelled ────────────────────────────────────────────────

  if (state.kind === 'cancelled') {
    return (
      <div
        role="region"
        aria-label="Tarefa cancelada"
        className="bg-surface rounded-lg p-base"
      >
        <ol role="list" className="space-y-sm mb-md">
          {state.steps.map((s) => (
            <li
              key={s.id}
              className={`flex items-start gap-xs text-sm ${
                s.status === 'cancelled-skip'
                  ? 'text-fg-subtle line-through'
                  : ''
              }`}
            >
              <StepIcon status={s.status} />
              <span>
                {s.id}. {s.description}
              </span>
            </li>
          ))}
        </ol>
        <p className="flex items-center gap-xs text-sm text-fg-muted">
          <Info className="size-4 shrink-0" aria-hidden />
          <span>Cancelado no passo {state.atStep}</span>
        </p>
      </div>
    );
  }

  // ── State 8 — error (terminal, after Abortar) ──────────────────────────

  // state.kind === 'error'
  return (
    <div
      role="region"
      aria-label="Tarefa interrompida por erro"
      className="bg-surface rounded-lg p-base"
    >
      <ol role="list" className="space-y-sm mb-md">
        {state.steps.map((s) => (
          <li key={s.id} className="flex flex-col">
            <div className="flex items-start gap-xs text-sm">
              <StepIcon status={s.status} />
              <span className={s.status === 'error' ? 'text-fg-muted' : 'text-fg-disabled'}>
                {s.id}. {s.description}
              </span>
            </div>
            {s.id === state.atStep && (
              <div className="ml-base text-xs text-destructive mt-xs">
                └ Erro: {state.errorMessage}
              </div>
            )}
          </li>
        ))}
      </ol>
      <p className="flex items-center gap-xs text-sm text-destructive">
        <Info className="size-4 shrink-0" aria-hidden />
        <span>Tarefa interrompida no passo {state.atStep}.</span>
      </p>
    </div>
  );
}
