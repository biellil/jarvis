// @vitest-environment happy-dom
/**
 * TaskCheckList tests — Phase 66 (AGENT-02, AGENT-03)
 *
 * Covers all 8 visual states from UI-SPEC § Visual Variants.
 * Verifies exact pt-BR copy, ARIA attributes, keyboard interactions,
 * and callback dispatch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskCheckList, type TaskCheckListProps } from '../TaskCheckList.js';
import type { TaskUiState, StepUiState, Plan } from '../../../../shared/ipc-types';

const samplePlan: Plan = {
  steps: [
    { id: 1, description: 'Listar arquivos em ~/Downloads', expectedOutcome: 'Lista de arquivos' },
    { id: 2, description: 'Filtrar por extensão .pdf', expectedOutcome: 'Apenas PDFs' },
    { id: 3, description: 'Mover para ~/Documentos/PDFs', expectedOutcome: 'Arquivos movidos' },
  ],
};

const sampleSteps: StepUiState[] = [
  { id: 1, description: 'Listar arquivos em ~/Downloads', status: 'success', outputSummary: 'Listei 14 arquivos' },
  { id: 2, description: 'Filtrar por extensão .pdf', status: 'running' },
  { id: 3, description: 'Mover para ~/Documentos/PDFs', status: 'pending' },
];

function makeProps(state: TaskUiState, overrides: Partial<TaskCheckListProps> = {}): TaskCheckListProps {
  return {
    taskId: 'task-test-1',
    state,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onEditSubmit: vi.fn(),
    onFailureContinue: vi.fn(),
    onFailureReplan: vi.fn(),
    onFailureAbort: vi.fn(),
    onRequestEditMode: vi.fn(),
    onCancelEditMode: vi.fn(),
    ...overrides,
  };
}

describe('TaskCheckList', () => {
  describe('State 1 — awaiting-confirmation (editMode:false)', () => {
    const state: TaskUiState = { kind: 'awaiting-confirmation', plan: samplePlan, editMode: false };

    it('renders heading "Aqui está o plano:"', () => {
      render(<TaskCheckList {...makeProps(state)} />);
      expect(screen.getByText('Aqui está o plano:')).toBeTruthy();
    });

    it('renders 3 buttons: Confirmar (primary), Editar (secondary), Cancelar (destructive)', () => {
      render(<TaskCheckList {...makeProps(state)} />);
      expect(screen.getByText('Confirmar')).toBeTruthy();
      expect(screen.getByText('Editar')).toBeTruthy();
      expect(screen.getByText('Cancelar')).toBeTruthy();
    });

    it('renders disclaimer "JARVIS não desfaz ações já executadas..."', () => {
      render(<TaskCheckList {...makeProps(state)} />);
      expect(screen.getByText(/JARVIS não desfaz ações já executadas/)).toBeTruthy();
    });

    it('renders all plan steps in the list', () => {
      render(<TaskCheckList {...makeProps(state)} />);
      expect(screen.getByText(/Listar arquivos em ~\/Downloads/)).toBeTruthy();
      expect(screen.getByText(/Filtrar por extensão .pdf/)).toBeTruthy();
      expect(screen.getByText(/Mover para ~\/Documentos\/PDFs/)).toBeTruthy();
    });

    it('Esc key dispatches onCancel', () => {
      const onCancel = vi.fn();
      const { container } = render(<TaskCheckList {...makeProps(state, { onCancel })} />);
      const region = container.querySelector('[role="region"]')!;
      fireEvent.keyDown(region, { key: 'Escape' });
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('Confirmar button dispatches onConfirm on click', () => {
      const onConfirm = vi.fn();
      render(<TaskCheckList {...makeProps(state, { onConfirm })} />);
      fireEvent.click(screen.getByText('Confirmar'));
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('Editar button dispatches onRequestEditMode on click', () => {
      const onRequestEditMode = vi.fn();
      render(<TaskCheckList {...makeProps(state, { onRequestEditMode })} />);
      fireEvent.click(screen.getByText('Editar'));
      expect(onRequestEditMode).toHaveBeenCalledTimes(1);
    });

    it('Cancelar button dispatches onCancel on click', () => {
      const onCancel = vi.fn();
      render(<TaskCheckList {...makeProps(state, { onCancel })} />);
      fireEvent.click(screen.getByText('Cancelar'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('container has role="region" and aria-label="Plano de execução pendente"', () => {
      const { container } = render(<TaskCheckList {...makeProps(state)} />);
      const region = container.querySelector('[role="region"][aria-label="Plano de execução pendente"]');
      expect(region).toBeTruthy();
    });
  });

  describe('State 2 — awaiting-confirmation (editMode:true)', () => {
    const state: TaskUiState = { kind: 'awaiting-confirmation', plan: samplePlan, editMode: true };

    it('renders Field with Label "Editar plano" + Input placeholder "Como você quer ajustar o plano?"', () => {
      render(<TaskCheckList {...makeProps(state)} />);
      expect(screen.getByText('Editar plano')).toBeTruthy();
      const input = screen.getByPlaceholderText('Como você quer ajustar o plano?');
      expect(input).toBeTruthy();
    });

    it('renders Aplicar and Voltar buttons', () => {
      render(<TaskCheckList {...makeProps(state)} />);
      expect(screen.getByText('Aplicar')).toBeTruthy();
      expect(screen.getByText('Voltar')).toBeTruthy();
    });

    it('Aplicar disabled when feedback is empty', () => {
      render(<TaskCheckList {...makeProps(state)} />);
      const aplicar = screen.getByText('Aplicar').closest('button')!;
      expect(aplicar.disabled).toBe(true);
    });

    it('Aplicar enabled when feedback is non-empty', () => {
      render(<TaskCheckList {...makeProps(state)} />);
      const input = screen.getByPlaceholderText('Como você quer ajustar o plano?');
      fireEvent.change(input, { target: { value: 'ajustar o plano' } });
      const aplicar = screen.getByText('Aplicar').closest('button')!;
      expect(aplicar.disabled).toBe(false);
    });

    it('Enter in Input submits onEditSubmit when feedback is non-empty', () => {
      const onEditSubmit = vi.fn();
      render(<TaskCheckList {...makeProps(state, { onEditSubmit })} />);
      const input = screen.getByPlaceholderText('Como você quer ajustar o plano?');
      fireEvent.change(input, { target: { value: 'nova descrição' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onEditSubmit).toHaveBeenCalledWith('nova descrição');
    });

    it('Esc key calls onCancelEditMode (returns to State 1)', () => {
      const onCancelEditMode = vi.fn();
      const { container } = render(<TaskCheckList {...makeProps(state, { onCancelEditMode })} />);
      const region = container.querySelector('[role="region"]')!;
      fireEvent.keyDown(region, { key: 'Escape' });
      expect(onCancelEditMode).toHaveBeenCalledTimes(1);
    });

    it('Voltar button dispatches onCancelEditMode', () => {
      const onCancelEditMode = vi.fn();
      render(<TaskCheckList {...makeProps(state, { onCancelEditMode })} />);
      fireEvent.click(screen.getByText('Voltar'));
      expect(onCancelEditMode).toHaveBeenCalledTimes(1);
    });
  });

  describe('State 3 — editing-loop', () => {
    const state: TaskUiState = { kind: 'editing-loop', previousPlan: samplePlan };

    it('renders "Replanejando…" text', () => {
      render(<TaskCheckList {...makeProps(state)} />);
      expect(screen.getByText('Replanejando…')).toBeTruthy();
    });

    it('container has aria-busy="true"', () => {
      const { container } = render(<TaskCheckList {...makeProps(state)} />);
      const region = container.querySelector('[aria-busy="true"]');
      expect(region).toBeTruthy();
    });

    it('no action buttons rendered', () => {
      render(<TaskCheckList {...makeProps(state)} />);
      expect(screen.queryByText('Confirmar')).toBeNull();
      expect(screen.queryByText('Cancelar')).toBeNull();
    });

    it('renders previous plan steps with line-through', () => {
      const { container } = render(<TaskCheckList {...makeProps(state)} />);
      const lineThroughItems = container.querySelectorAll('.line-through');
      expect(lineThroughItems.length).toBe(samplePlan.steps.length);
    });
  });

  describe('State 4 — executing', () => {
    const state: TaskUiState = {
      kind: 'executing',
      plan: samplePlan,
      steps: sampleSteps,
      currentStepId: 2,
    };

    it('running step has border-l-2 border-accent pl-sm CSS classes', () => {
      const { container } = render(<TaskCheckList {...makeProps(state)} />);
      const runningLi = container.querySelector('[aria-current="step"]')!;
      expect(runningLi).toBeTruthy();
      expect(runningLi.className).toContain('border-l-2');
      expect(runningLi.className).toContain('border-accent');
      expect(runningLi.className).toContain('pl-sm');
    });

    it('completed step shows outputSummary line', () => {
      render(<TaskCheckList {...makeProps(state)} />);
      expect(screen.getByText(/Listei 14 arquivos/)).toBeTruthy();
    });

    it('pending step has text-fg-disabled class', () => {
      const { container } = render(<TaskCheckList {...makeProps(state)} />);
      // The pending step (id:3) should have text-fg-disabled
      const pendingLi = Array.from(container.querySelectorAll('li')).find(
        (li) => li.textContent?.includes('Mover para') && li.className.includes('text-fg-disabled'),
      );
      expect(pendingLi).toBeTruthy();
    });

    it('Cancelar button (destructive) is the only action button', () => {
      render(<TaskCheckList {...makeProps(state)} />);
      expect(screen.getByText('Cancelar')).toBeTruthy();
      expect(screen.queryByText('Confirmar')).toBeNull();
      expect(screen.queryByText('Continuar')).toBeNull();
    });

    it('aria-current="step" is set on the running step <li>', () => {
      const { container } = render(<TaskCheckList {...makeProps(state)} />);
      const currentStep = container.querySelector('[aria-current="step"]');
      expect(currentStep).toBeTruthy();
      expect(currentStep!.textContent).toContain('Filtrar por extensão');
    });

    it('<ol> has aria-live="polite"', () => {
      const { container } = render(<TaskCheckList {...makeProps(state)} />);
      const ol = container.querySelector('ol[aria-live="polite"]');
      expect(ol).toBeTruthy();
    });

    it('container has aria-busy="true"', () => {
      const { container } = render(<TaskCheckList {...makeProps(state)} />);
      const region = container.querySelector('[aria-busy="true"]');
      expect(region).toBeTruthy();
    });

    it('Esc dispatches onCancel during executing', () => {
      const onCancel = vi.fn();
      const { container } = render(<TaskCheckList {...makeProps(state, { onCancel })} />);
      const region = container.querySelector('[role="region"]')!;
      fireEvent.keyDown(region, { key: 'Escape' });
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('State 5 — awaiting-failure-decision', () => {
    const stepsWithError: StepUiState[] = [
      { id: 1, description: 'Listar arquivos', status: 'success' },
      { id: 2, description: 'Filtrar por extensão .pdf', status: 'error' },
      { id: 3, description: 'Mover para ~/Documentos/PDFs', status: 'pending' },
    ];
    const state: TaskUiState = {
      kind: 'awaiting-failure-decision',
      plan: samplePlan,
      steps: stepsWithError,
      failedStepId: 2,
      errorMessage: 'permissão negada em /home/*.pdf',
    };

    it('renders 3 buttons: Continuar (primary), Replanejar (secondary), Abortar (destructive)', () => {
      render(<TaskCheckList {...makeProps(state)} />);
      expect(screen.getByText('Continuar')).toBeTruthy();
      expect(screen.getByText('Replanejar')).toBeTruthy();
      expect(screen.getByText('Abortar')).toBeTruthy();
    });

    it('failed step shows X icon area + error sub-line at text-destructive', () => {
      const { container } = render(<TaskCheckList {...makeProps(state)} />);
      const allDestructive = container.querySelectorAll('.text-destructive');
      const hasErrorText = Array.from(allDestructive).some(
        (el) => el.textContent?.includes('permissão negada'),
      );
      expect(hasErrorText).toBe(true);
    });

    it('container is role="alertdialog" with aria-labelledby pointing to sr-only h2', () => {
      const { container } = render(<TaskCheckList {...makeProps(state)} />);
      const dialog = container.querySelector('[role="alertdialog"]');
      expect(dialog).toBeTruthy();
      const labelledById = dialog!.getAttribute('aria-labelledby');
      expect(labelledById).toBeTruthy();
      const heading = container.querySelector(`#${CSS.escape(labelledById!)}`)!;
      expect(heading).toBeTruthy();
      expect(heading.textContent).toContain('Falha na etapa 2');
    });

    it('Continuar dispatches onFailureContinue', () => {
      const onFailureContinue = vi.fn();
      render(<TaskCheckList {...makeProps(state, { onFailureContinue })} />);
      fireEvent.click(screen.getByText('Continuar'));
      expect(onFailureContinue).toHaveBeenCalledTimes(1);
    });

    it('Replanejar dispatches onFailureReplan', () => {
      const onFailureReplan = vi.fn();
      render(<TaskCheckList {...makeProps(state, { onFailureReplan })} />);
      fireEvent.click(screen.getByText('Replanejar'));
      expect(onFailureReplan).toHaveBeenCalledTimes(1);
    });

    it('Abortar dispatches onFailureAbort', () => {
      const onFailureAbort = vi.fn();
      render(<TaskCheckList {...makeProps(state, { onFailureAbort })} />);
      fireEvent.click(screen.getByText('Abortar'));
      expect(onFailureAbort).toHaveBeenCalledTimes(1);
    });
  });

  describe('State 6 — done', () => {
    const doneSteps: StepUiState[] = [
      { id: 1, description: 'Listar arquivos', status: 'success' },
      { id: 2, description: 'Filtrar PDFs', status: 'success' },
    ];
    const state: TaskUiState = {
      kind: 'done',
      summary: 'Movi 14 PDFs de ~/Downloads para ~/Documentos/PDFs.',
      steps: doneSteps,
    };

    it('renders Check + "Tarefa concluída." heading', () => {
      render(<TaskCheckList {...makeProps(state)} />);
      expect(screen.getByText('Tarefa concluída.')).toBeTruthy();
    });

    it('renders summary text', () => {
      render(<TaskCheckList {...makeProps(state)} />);
      expect(screen.getByText(/Movi 14 PDFs/)).toBeTruthy();
    });

    it('no action buttons rendered', () => {
      render(<TaskCheckList {...makeProps(state)} />);
      expect(screen.queryByText('Confirmar')).toBeNull();
      expect(screen.queryByText('Cancelar')).toBeNull();
    });
  });

  describe('State 7 — cancelled', () => {
    const cancelledSteps: StepUiState[] = [
      { id: 1, description: 'Listar arquivos', status: 'success' },
      { id: 2, description: 'Filtrar PDFs', status: 'success' },
      { id: 3, description: 'Mover arquivos', status: 'cancelled-skip' },
    ];
    const state: TaskUiState = { kind: 'cancelled', atStep: 3, steps: cancelledSteps };

    it('renders "Cancelado no passo 3"', () => {
      render(<TaskCheckList {...makeProps(state)} />);
      expect(screen.getByText('Cancelado no passo 3')).toBeTruthy();
    });

    it('steps after atStep render with cancelled-skip styling (line-through)', () => {
      const { container } = render(<TaskCheckList {...makeProps(state)} />);
      const lineThroughItems = container.querySelectorAll('.line-through');
      expect(lineThroughItems.length).toBeGreaterThanOrEqual(1);
      // The cancelled-skip step should have line-through
      const cancelledItem = Array.from(container.querySelectorAll('li')).find(
        (li) => li.className.includes('line-through'),
      );
      expect(cancelledItem!.textContent).toContain('Mover arquivos');
    });

    it('no action buttons rendered', () => {
      render(<TaskCheckList {...makeProps(state)} />);
      expect(screen.queryByText('Confirmar')).toBeNull();
      expect(screen.queryByText('Cancelar')).toBeNull();
    });
  });

  describe('State 8 — error (terminal)', () => {
    const errorSteps: StepUiState[] = [
      { id: 1, description: 'Listar arquivos', status: 'success' },
      { id: 2, description: 'Filtrar PDFs', status: 'error' },
      { id: 3, description: 'Mover arquivos', status: 'pending' },
    ];
    const state: TaskUiState = {
      kind: 'error',
      atStep: 2,
      errorMessage: 'permissão negada',
      steps: errorSteps,
    };

    it('renders "Tarefa interrompida no passo 2." in text-destructive', () => {
      const { container } = render(<TaskCheckList {...makeProps(state)} />);
      const allDestructive = container.querySelectorAll('.text-destructive');
      const hasTerminalMsg = Array.from(allDestructive).some(
        (el) => el.textContent?.includes('Tarefa interrompida no passo 2.'),
      );
      expect(hasTerminalMsg).toBe(true);
    });

    it('failed step shows X + error sub-line', () => {
      const { container } = render(<TaskCheckList {...makeProps(state)} />);
      const errorLine = Array.from(container.querySelectorAll('.text-destructive')).find(
        (el) => el.textContent?.includes('permissão negada'),
      );
      expect(errorLine).toBeTruthy();
    });

    it('no action buttons rendered', () => {
      render(<TaskCheckList {...makeProps(state)} />);
      expect(screen.queryByText('Confirmar')).toBeNull();
      expect(screen.queryByText('Abortar')).toBeNull();
    });
  });

  describe('ARIA + copy contract', () => {
    it('all 8 state kinds render without throwing', () => {
      const states: TaskUiState[] = [
        { kind: 'awaiting-confirmation', plan: samplePlan, editMode: false },
        { kind: 'awaiting-confirmation', plan: samplePlan, editMode: true },
        { kind: 'editing-loop', previousPlan: samplePlan },
        { kind: 'executing', plan: samplePlan, steps: sampleSteps, currentStepId: 2 },
        {
          kind: 'awaiting-failure-decision',
          plan: samplePlan,
          steps: sampleSteps,
          failedStepId: 2,
          errorMessage: 'err',
        },
        { kind: 'done', summary: 'Feito.', steps: [] },
        { kind: 'cancelled', atStep: 1, steps: [] },
        { kind: 'error', atStep: 1, errorMessage: 'err', steps: [] },
      ];

      for (const state of states) {
        expect(() => render(<TaskCheckList {...makeProps(state)} />)).not.toThrow();
      }
    });
  });
});
