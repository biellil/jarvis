// @vitest-environment happy-dom
/**
 * ProactiveMessageList tests — Phase 67 (PROACT-02, gap-closure 67-13)
 *
 * Verifica:
 * 1. Retorna null quando messages esta vazio
 * 2. Retorna null quando ha messages mas nenhuma com role='proactive'
 * 3. Renderiza 1 ProactiveEventBubble quando ha 1 mensagem proativa
 * 4. Renderiza 2 ProactiveEventBubble quando ha 2 mensagens proativas
 * 5. onDismiss de um bubble remove-o da lista (estado interno)
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ProactiveMessageList } from '../ProactiveMessageList';
import type { ChatMessage } from '../ChatContext';
import type { ProactiveEvent } from '../../../../shared/ipc-types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock do useChat para controlar messages externamente
const mockMessages: ChatMessage[] = [];
vi.mock('../ChatContext', () => ({
  useChat: () => ({ messages: mockMessages }),
}));

// Mock do ProactiveEventBubble para simplificar assertions
vi.mock('../ProactiveEventBubble', () => ({
  ProactiveEventBubble: ({
    event,
    onDismiss,
  }: {
    event: ProactiveEvent;
    onDismiss?: () => void;
  }) => (
    <div data-testid="proactive-bubble" data-kind={event.kind}>
      <button type="button" onClick={onDismiss} data-testid="dismiss-btn">
        dismiss
      </button>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const reminderEvent: ProactiveEvent = {
  kind: 'reminder',
  message: 'Revisar PR',
  dueAt: Date.now(),
  id: 1,
};

const folderEvent: ProactiveEvent = {
  kind: 'folder_event',
  files: [{ name: 'report.pdf', path: '/home/user/Downloads/report.pdf' }],
  folderPath: '/home/user/Downloads',
};

function makeProactiveMessage(id: string, event: ProactiveEvent): ChatMessage {
  return {
    id,
    role: 'proactive',
    text: '',
    proactiveEvent: event,
  };
}

function makeHumanMessage(id: string): ChatMessage {
  return { id, role: 'human', text: 'olá' };
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  // Reset shared mock array
  mockMessages.length = 0;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProactiveMessageList', () => {
  it('Test 1: retorna null quando messages está vazio', () => {
    // mockMessages is already empty
    const { container } = render(<ProactiveMessageList />);
    expect(container.firstChild).toBeNull();
  });

  it('Test 2: retorna null quando há messages mas nenhuma com role=proactive', () => {
    mockMessages.push(makeHumanMessage('h1'));
    mockMessages.push({ id: 'a1', role: 'agent', text: 'resposta' });
    const { container } = render(<ProactiveMessageList />);
    expect(container.firstChild).toBeNull();
  });

  it('Test 3: renderiza 1 ProactiveEventBubble quando há 1 mensagem proativa', () => {
    mockMessages.push(makeProactiveMessage('p1', reminderEvent));
    render(<ProactiveMessageList />);
    const bubbles = screen.getAllByTestId('proactive-bubble');
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0]!.getAttribute('data-kind')).toBe('reminder');
  });

  it('Test 4: renderiza 2 ProactiveEventBubble quando há 2 mensagens proativas', () => {
    mockMessages.push(makeProactiveMessage('p1', reminderEvent));
    mockMessages.push(makeProactiveMessage('p2', folderEvent));
    render(<ProactiveMessageList />);
    const bubbles = screen.getAllByTestId('proactive-bubble');
    expect(bubbles).toHaveLength(2);
  });

  it('Test 5: chamada a onDismiss remove o bubble da lista (estado interno)', () => {
    mockMessages.push(makeProactiveMessage('p1', reminderEvent));
    mockMessages.push(makeProactiveMessage('p2', folderEvent));
    render(<ProactiveMessageList />);

    // Inicialmente 2 bubbles
    expect(screen.getAllByTestId('proactive-bubble')).toHaveLength(2);

    // Clica dismiss no primeiro bubble
    const dismissBtns = screen.getAllByTestId('dismiss-btn');
    fireEvent.click(dismissBtns[0]!);

    // Agora apenas 1 bubble deve ser visivel
    expect(screen.getAllByTestId('proactive-bubble')).toHaveLength(1);
  });
});
