/**
 * ProactiveMessageList — Phase 67 Gap 3 (PROACT-02)
 *
 * Renderiza bubbles proativas a partir do ChatContext.messages.
 * Filtra role='proactive', limita aos 5 mais recentes para evitar overflow visual.
 * Dismiss é gerenciado por estado interno (ids dispensados) — não remove do ChatContext
 * pois ChatContext não tem removeMessage; o evento permanece no histórico para eventual
 * MessageList completo.
 *
 * T-67-13-02 (mitigated): MAX_VISIBLE=5 limita a 5 mensagens mais recentes,
 * evitando overflow visual com muitos eventos acumulados.
 */
import { useState } from 'react';
import { useChat } from './ChatContext';
import { ProactiveEventBubble } from './ProactiveEventBubble';

const MAX_VISIBLE = 5;

export function ProactiveMessageList() {
  const { messages } = useChat();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const proactiveMessages = messages
    .filter((m) => m.role === 'proactive' && m.proactiveEvent && !dismissedIds.has(m.id))
    .slice(-MAX_VISIBLE); // Mantém somente os 5 mais recentes

  if (proactiveMessages.length === 0) return null;

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]));
  };

  return (
    <div
      className="flex flex-col gap-xs w-full max-h-64 overflow-y-auto"
      aria-label="Notificacoes proativas recentes"
      aria-live="polite"
    >
      {proactiveMessages.map((msg) => (
        <ProactiveEventBubble
          key={msg.id}
          event={msg.proactiveEvent!}
          onDismiss={() => handleDismiss(msg.id)}
        />
      ))}
    </div>
  );
}
