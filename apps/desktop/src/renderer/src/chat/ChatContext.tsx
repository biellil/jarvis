import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type {
  TaskSseEvent,
  TaskUiState,
  StepUiState,
  Plan,
} from '../../../shared/ipc-types';

/**
 * ChatContext — Plano 19_5-04 (extended Phase 66 — Agentic Tasks)
 *
 * Mantém histórico simples de mensagens do chat (user + agente) e o toast
 * global. App.tsx provê, ChatInput consome para injetar o handler de áudio.
 *
 * Phase 66: Extended with `tasks: Map<taskId, TaskUiState>` + reducer wired
 * to SSE task:* events. Single source of truth for all task UI state —
 * no local component useState for editMode or task progress.
 */

export type ChatRole = 'human' | 'agent';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  /** Phase 66: When set, this message is the parent bubble for a task checklist */
  taskId?: string;
}

export type ToastVariant = 'error' | 'warning' | 'info';

export interface ToastState {
  message: string;
  variant: ToastVariant;
  /** Phase 44 (VHARD-01, D-04): botão de ação opcional no toast (ex: "Abrir System Settings") */
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ChatContextValue {
  messages: ChatMessage[];
  addHumanMessage: (text: string) => void;
  addAgentMessage: (text: string) => void;
  toast: ToastState | null;
  setToast: (toast: ToastState | null) => void;
  // Phase 66: task state map + reducer
  tasks: ReadonlyMap<string, TaskUiState>;
  /** Maps taskId → parentMessageId (the agent message bubble that hosts the checklist) */
  parentMessageIdByTask: ReadonlyMap<string, string>;
  /** Dispatch a task SSE event into the reducer (called by useTaskSse consumer) */
  handleTaskEvent: (evt: TaskSseEvent) => void;
  /** Flip awaiting-confirmation editMode without going through SSE — local UI intent */
  setTaskEditMode: (taskId: string, on: boolean) => void;
  /** Register the parent message bubble for a task (called when task:plan arrives) */
  setParentMessageIdForTask: (taskId: string, messageId: string) => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

let counter = 0;
function nextId(): string {
  counter += 1;
  return `${Date.now()}-${counter}`;
}

/**
 * buildPlanTtsSummary — Phase 66 D-08
 *
 * Builds the TTS summary string for a plan using exact templates from UI-SPEC
 * § Copywriting Contract. No extra LLM call — deterministic from plan steps.
 *
 * N=1: "Vou fazer 1 coisa: {desc}. Confirma?"
 * N=2: "Vou fazer 2 coisas: {desc1}, e {desc2}. Confirma?"
 * N=3: "Vou fazer 3 coisas: {desc1}, {desc2}, e {desc3}. Confirma?"
 * N>3: "Vou fazer {N} coisas: {desc1}, {desc2}, e mais {N-2}. Confirma?"
 */
export function buildPlanTtsSummary(plan: Plan): string {
  const N = plan.steps.length;
  if (N === 0) return 'Não consegui planejar essa tarefa. Tente reformular o pedido.';
  if (N === 1) {
    return `Vou fazer 1 coisa: ${plan.steps[0]!.description}. Confirma?`;
  }
  if (N === 2) {
    return `Vou fazer 2 coisas: ${plan.steps[0]!.description}, e ${plan.steps[1]!.description}. Confirma?`;
  }
  if (N === 3) {
    return `Vou fazer 3 coisas: ${plan.steps[0]!.description}, ${plan.steps[1]!.description}, e ${plan.steps[2]!.description}. Confirma?`;
  }
  return `Vou fazer ${N} coisas: ${plan.steps[0]!.description}, ${plan.steps[1]!.description}, e mais ${N - 2}. Confirma?`;
}

/**
 * reduceTaskEvent — pure reducer: given current tasks map + one SSE event,
 * returns the next tasks map. Handles all 9 TaskSseEvent kinds.
 */
function reduceTaskEvent(
  prev: Map<string, TaskUiState>,
  evt: TaskSseEvent,
): Map<string, TaskUiState> {
  const next = new Map(prev);
  const current = next.get(evt.taskId);

  switch (evt.kind) {
    case 'task:plan': {
      next.set(evt.taskId, {
        kind: 'awaiting-confirmation',
        plan: evt.plan,
        editMode: false,
      });
      break;
    }
    case 'task:awaiting-confirmation': {
      // Marker event — task:plan already set the state; no state change needed.
      break;
    }
    case 'task:edit-loop': {
      const previousPlan: Plan =
        current && 'plan' in current ? current.plan : { steps: [] };
      next.set(evt.taskId, { kind: 'editing-loop', previousPlan });
      break;
    }
    case 'task:step:start': {
      if (
        current &&
        'plan' in current &&
        (current.kind === 'awaiting-confirmation' || current.kind === 'executing')
      ) {
        const steps: StepUiState[] =
          current.kind === 'executing'
            ? [...current.steps]
            : current.plan.steps.map((s) => ({
                id: s.id,
                description: s.description,
                status: 'pending' as const,
              }));
        const idx = steps.findIndex((s) => s.id === evt.stepId);
        if (idx >= 0) steps[idx] = { ...steps[idx]!, status: 'running' };
        next.set(evt.taskId, {
          kind: 'executing',
          plan: current.plan,
          steps,
          currentStepId: evt.stepId,
        });
      }
      break;
    }
    case 'task:step:end': {
      if (current && current.kind === 'executing') {
        const steps = current.steps.map((s) =>
          s.id === evt.stepId
            ? { ...s, status: evt.status, outputSummary: evt.summary }
            : s,
        );
        next.set(evt.taskId, { ...current, steps });
      }
      break;
    }
    case 'task:awaiting-failure-decision': {
      if (current && current.kind === 'executing') {
        next.set(evt.taskId, {
          kind: 'awaiting-failure-decision',
          plan: current.plan,
          steps: current.steps,
          failedStepId: evt.stepId,
          errorMessage: evt.error,
        });
      }
      break;
    }
    case 'task:done': {
      if (current && 'steps' in current) {
        next.set(evt.taskId, {
          kind: 'done',
          summary: evt.summary,
          steps: current.steps,
        });
      } else {
        // Done without step history (edge case)
        next.set(evt.taskId, { kind: 'done', summary: evt.summary, steps: [] });
      }
      break;
    }
    case 'task:cancelled': {
      if (current && 'steps' in current) {
        const steps = current.steps.map((s) =>
          s.id >= evt.atStep ? { ...s, status: 'cancelled-skip' as const } : s,
        );
        next.set(evt.taskId, { kind: 'cancelled', atStep: evt.atStep, steps });
      } else {
        // Cancelled before any step started
        next.set(evt.taskId, { kind: 'cancelled', atStep: evt.atStep, steps: [] });
      }
      break;
    }
    case 'task:error': {
      if (current && 'steps' in current) {
        next.set(evt.taskId, {
          kind: 'error',
          atStep: evt.atStep,
          errorMessage: evt.message,
          steps: current.steps,
        });
      } else {
        next.set(evt.taskId, {
          kind: 'error',
          atStep: evt.atStep,
          errorMessage: evt.message,
          steps: [],
        });
      }
      break;
    }
  }
  return next;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [tasks, setTasks] = useState<Map<string, TaskUiState>>(() => new Map());
  const [parentMessageIdByTask, setParentMessageIdByTask] = useState<
    Map<string, string>
  >(() => new Map());

  const addHumanMessage = useCallback((text: string) => {
    setMessages((prev) => [...prev, { id: nextId(), role: 'human', text }]);
  }, []);

  const addAgentMessage = useCallback((text: string) => {
    setMessages((prev) => [...prev, { id: nextId(), role: 'agent', text }]);
  }, []);

  const handleTaskEvent = useCallback((evt: TaskSseEvent) => {
    setTasks((prev) => reduceTaskEvent(prev, evt));

    // Side effects on specific events (D-08 TTS sumário)
    if (evt.kind === 'task:plan') {
      const ttsText = buildPlanTtsSummary(evt.plan);
      try {
        // Phase 53/62: existing TTS bridge — optional (may not be configured)
        (window.jarvis as any).speakText?.(ttsText);
      } catch {
        // Graceful degrade — TTS failure must not block the task flow
      }
    } else if (evt.kind === 'task:done') {
      try {
        (window.jarvis as any).speakText?.(`Pronto. ${evt.summary}`);
      } catch {
        // Graceful degrade
      }
    } else if (evt.kind === 'task:cancelled') {
      try {
        (window.jarvis as any).speakText?.('Cancelado.');
      } catch {
        // Graceful degrade
      }
    }
  }, []);

  const setTaskEditMode = useCallback((taskId: string, on: boolean) => {
    setTasks((prev) => {
      const cur = prev.get(taskId);
      if (!cur || cur.kind !== 'awaiting-confirmation') return prev;
      if (cur.editMode === on) return prev;
      const next = new Map(prev);
      next.set(taskId, { ...cur, editMode: on });
      return next;
    });
  }, []);

  const setParentMessageIdForTask = useCallback(
    (taskId: string, messageId: string) => {
      setParentMessageIdByTask((m) => new Map(m).set(taskId, messageId));
    },
    [],
  );

  return (
    <ChatContext.Provider
      value={{
        messages,
        addHumanMessage,
        addAgentMessage,
        toast,
        setToast,
        tasks,
        parentMessageIdByTask,
        handleTaskEvent,
        setTaskEditMode,
        setParentMessageIdForTask,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

const NOOP_CHAT: ChatContextValue = {
  messages: [],
  addHumanMessage: () => {},
  addAgentMessage: () => {},
  toast: null,
  setToast: () => {},
  tasks: new Map(),
  parentMessageIdByTask: new Map(),
  handleTaskEvent: () => {},
  setTaskEditMode: () => {},
  setParentMessageIdForTask: () => {},
};

/**
 * Hook tolerante: retorna defaults no-op quando usado fora de um ChatProvider,
 * para permitir que testes isolados de componentes (ex.: ChatInput) continuem
 * funcionando sem precisar envolver cada render numa árvore de providers.
 */
export function useChat(): ChatContextValue {
  return useContext(ChatContext) ?? NOOP_CHAT;
}
