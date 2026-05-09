import { describe, it } from 'vitest';

describe('runExecutorNode', () => {
  it.todo('checks state.cancelRequested BEFORE invoking reactAgent for each step (D-13 primary lever)');
  it.todo('emits task:step:start before reactAgent.invoke and task:step:end after');
  it.todo('threads config.signal through reactAgent.invoke({messages}, {signal: config.signal, configurable})');
  it.todo('on tool error, calls interrupt({kind:"step-failure", stepId, error}) — does NOT swallow');
  it.todo('decision.kind === "continue" appends StepResult{status:"skipped"} and continues to next step');
  it.todo('decision.kind === "replan" returns Command({goto:"planner", update:{editFeedback, lastError}})');
  it.todo('decision.kind === "abort" emits task:error and returns terminal state');
  it.todo('after all steps succeed, emits task:done with summary from generateFinalSummary LLM call');
  it.todo('config.signal.aborted before any step → emits task:cancelled with atStep = first pending step');
});
