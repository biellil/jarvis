// @vitest-environment happy-dom
import { describe, it } from 'vitest';

describe('TaskCheckList', () => {
  describe('State 1 — awaiting-confirmation (editMode:false)', () => {
    it.todo('renders heading "Aqui está o plano:"');
    it.todo('renders 3 buttons: Confirmar (primary), Editar (secondary), Cancelar (destructive)');
    it.todo('renders disclaimer "JARVIS não desfaz ações já executadas..."');
    it.todo('Confirmar autoFocus on mount');
    it.todo('Esc key dispatches onCancel');
  });

  describe('State 2 — awaiting-confirmation (editMode:true)', () => {
    it.todo('renders Field with Label "Editar plano" + Input placeholder "Como você quer ajustar o plano?"');
    it.todo('Aplicar disabled when feedback is empty/whitespace');
    it.todo('Enter in Input submits onEditSubmit(feedback)');
    it.todo('Esc returns to State 1 (editMode:false)');
  });

  describe('State 3 — editing-loop', () => {
    it.todo('renders "Replanejando…" with circular Progress spinner');
    it.todo('container has aria-busy="true"');
    it.todo('no buttons rendered');
  });

  describe('State 4 — executing', () => {
    it.todo('running step has border-l-2 border-accent pl-sm');
    it.todo('completed step shows Check icon + outputSummary line');
    it.todo('pending step shows Circle icon at text-fg-disabled');
    it.todo('Cancelar button (destructive) is the only button');
    it.todo('aria-current="step" is set on the running step <li>');
    it.todo('<ol> has aria-live="polite"');
  });

  describe('State 5 — awaiting-failure-decision', () => {
    it.todo('renders 3 buttons: Continuar (primary), Replanejar (secondary), Abortar (destructive)');
    it.todo('failed step shows X icon + error sub-line at text-destructive');
    it.todo('container is role="alertdialog" with sr-only h2 "Falha na etapa {N}"');
  });

  describe('State 6 — done', () => {
    it.todo('renders Check + "Tarefa concluída." + summary text');
    it.todo('no buttons');
  });

  describe('State 7 — cancelled', () => {
    it.todo('renders "Cancelado no passo {N}"');
    it.todo('steps after atStep render with cancelled-skip styling (line-through, dashed circle)');
  });

  describe('State 8 — error', () => {
    it.todo('renders "Tarefa interrompida no passo {N}." in text-destructive');
    it.todo('failed step shows X + error sub-line');
  });
});
