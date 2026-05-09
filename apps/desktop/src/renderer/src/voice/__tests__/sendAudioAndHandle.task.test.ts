// @vitest-environment happy-dom
import { describe, it } from 'vitest';

describe('sendAudioAndHandle — task short-circuit', () => {
  it.todo('when no active task, falls through to existing /api/chat path');
  it.todo('when task is awaiting-confirmation and STT returns "vai", calls window.jarvis.resumeTask(taskId, {kind:"confirm"})');
  it.todo('when task is executing and STT returns "cancela", calls window.jarvis.cancelTask(taskId)');
  it.todo('when task is awaiting-confirmation and STT returns "muda o passo 1", calls resumeTask(taskId, {kind:"edit", feedback:"o passo 1"})');
  it.todo('when STT returns non-keyword utterance during active task, falls through to /api/chat (no short-circuit)');
});
