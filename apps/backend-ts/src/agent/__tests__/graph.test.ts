import { describe, it } from 'vitest';

describe('buildTaskGraph', () => {
  describe('AGENT-02: plan-confirmation interrupt', () => {
    it.todo('after planner runs, graph.getState() shows task with interrupts[0].value.kind === "plan-confirmation"');
    it.todo('Command({resume:{kind:"confirm"}}) progresses graph to executor node');
    it.todo('Command({resume:{kind:"cancel"}}) terminates with cancelRequested=true and goto END');
    it.todo('Command({resume:{kind:"edit", feedback:"..."}}) loops back to planner with editFeedback set');
  });

  describe('AGENT-01: end-to-end', () => {
    it.todo('completes 3-step task end-to-end: plan → confirm → step1 → step2 → step3 → done');
  });

  describe('AGENT-03: SSE custom stream events', () => {
    it.todo('emits task:plan after planner');
    it.todo('emits task:step:start and task:step:end in order for each step');
    it.todo('emits task:done with non-empty summary at terminal');
  });

  describe('AGENT-04: cancellation', () => {
    it.todo('cancelRequested halts execution at next step boundary (no further task:step:end after cancel)');
    it.todo('task:cancelled emitted with atStep field set to the step that was about to start');
    it.todo('AbortSignal aborted mid-step propagates to running tool (best-effort secondary lever)');
  });

  describe('MemorySaver lifecycle', () => {
    it.todo('after task:done, taskCheckpointer.deleteThread(threadId) is called');
    it.todo('after task:cancelled, taskCheckpointer.deleteThread(threadId) is called');
  });
});
