import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

/**
 * ChatContext — Plano 19_5-04
 *
 * Mantém histórico simples de mensagens do chat (user + agente) e o toast
 * global. App.tsx provê, ChatInput consome para injetar o handler de áudio.
 */

export type ChatRole = 'human' | 'agent';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
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
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

let counter = 0;
function nextId(): string {
  counter += 1;
  return `${Date.now()}-${counter}`;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);

  const addHumanMessage = useCallback((text: string) => {
    setMessages((prev) => [...prev, { id: nextId(), role: 'human', text }]);
  }, []);

  const addAgentMessage = useCallback((text: string) => {
    setMessages((prev) => [...prev, { id: nextId(), role: 'agent', text }]);
  }, []);

  return (
    <ChatContext.Provider
      value={{ messages, addHumanMessage, addAgentMessage, toast, setToast }}
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
};

/**
 * Hook tolerante: retorna defaults no-op quando usado fora de um ChatProvider,
 * para permitir que testes isolados de componentes (ex.: ChatInput) continuem
 * funcionando sem precisar envolver cada render numa árvore de providers.
 */
export function useChat(): ChatContextValue {
  return useContext(ChatContext) ?? NOOP_CHAT;
}
