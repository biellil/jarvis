/**
 * ProactiveEventBubble — Phase 67 (PROACT-02, D-09)
 *
 * Chat bubble for proactive events (reminder, folder_event, daily_summary).
 * Renders as a full-width banner card with a left accent stripe colored by kind.
 *
 * Visual contract from UI-SPEC.md §"1. ProactiveEvent Bubble":
 *  - reminder:       stripe=border-accent (cyan), emoji=🔔, title="Lembrete"
 *  - folder_event:   stripe=border-success (emerald), emoji=📁, title="Novo arquivo em {folderName}"
 *  - daily_summary:  stripe=border-accent (cyan), emoji=🌅, title="Resumo diário"
 *
 * Content per kind:
 *  - reminder:       event.message (1 line)
 *  - folder_event:   1 file → name; 2–5 → comma-separated; 6+ → "name, name, name e mais N-3"
 *  - daily_summary:  event.text (1-3 sentences, may wrap)
 *
 * T-67-05 (mitigated): content rendered via JSX — React auto-escapes strings, no XSS.
 * No dangerouslySetInnerHTML used.
 */
import React from 'react';
import type { ProactiveEvent } from '../../../shared/ipc-types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProactiveEventBubbleProps {
  event: ProactiveEvent;
  onDismiss?: () => void;
  /** Reserved for future snooze feature (D-09: deferred). */
  onSnooze?: (minutes: number) => void;
}

// ---------------------------------------------------------------------------
// Kind-specific helpers
// ---------------------------------------------------------------------------

/** Returns the left-stripe border color class for each event kind. */
function getStripeColor(kind: ProactiveEvent['kind']): string {
  switch (kind) {
    case 'reminder':
      return 'border-accent';
    case 'folder_event':
      return 'border-success';
    case 'daily_summary':
      return 'border-accent';
  }
}

/** Returns the emoji for each event kind. */
function getEmoji(kind: ProactiveEvent['kind']): string {
  switch (kind) {
    case 'reminder':
      return '🔔';
    case 'folder_event':
      return '📁';
    case 'daily_summary':
      return '🌅';
  }
}

/** Returns the title string for each event kind. */
function getTitle(event: ProactiveEvent): string {
  switch (event.kind) {
    case 'reminder':
      return 'Lembrete';
    case 'folder_event': {
      const folderName = event.folderPath.split('/').pop() ?? event.folderPath;
      return `Novo arquivo em ${folderName}`;
    }
    case 'daily_summary':
      return 'Resumo diário';
  }
}

/** Returns the content string for each event kind (UI-SPEC §Visual Variants). */
function getContent(event: ProactiveEvent): string {
  switch (event.kind) {
    case 'reminder':
      return event.message;
    case 'folder_event': {
      const files = event.files;
      if (files.length === 0) return '';
      if (files.length === 1) return files[0]!.name;
      if (files.length <= 5) return files.map((f) => f.name).join(', ');
      // 6+ files: "name, name, name e mais N-3"
      const first3 = files.slice(0, 3).map((f) => f.name).join(', ');
      return `${first3} e mais ${files.length - 3}`;
    }
    case 'daily_summary':
      return event.text;
  }
}

/** Returns timestamp epoch (ms) for each event kind. */
function getTimestampMs(event: ProactiveEvent): number {
  switch (event.kind) {
    case 'reminder':
      return event.dueAt;
    case 'folder_event':
      return Date.now();
    case 'daily_summary':
      return event.generatedAt;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProactiveEventBubble({ event, onDismiss }: ProactiveEventBubbleProps) {
  const stripeColor = getStripeColor(event.kind);
  const emoji = getEmoji(event.kind);
  const title = getTitle(event);
  const content = getContent(event);
  const timestampMs = getTimestampMs(event);

  const isoTimestamp = new Date(timestampMs).toISOString();
  const timeHHMM = new Date(timestampMs).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Accessible label: "Notificação proativa: {kind}: {title}"
  const ariaLabel = `Notificação proativa: ${event.kind}: ${title}`;

  return (
    <div
      role="article"
      aria-label={ariaLabel}
      className={`flex gap-sm p-base rounded-lg bg-surface border-l-4 ${stripeColor}`}
    >
      {/* Emoji icon */}
      <div className="flex-shrink-0 text-lg" aria-hidden="true">
        {emoji}
      </div>

      {/* Content */}
      <div className="flex-1">
        <p className="text-base font-semibold text-fg">{title}</p>
        <p className="text-sm text-fg-muted mt-xs">{content}</p>
      </div>

      {/* Timestamp + optional dismiss */}
      <div className="flex-shrink-0 flex flex-col items-end gap-xs">
        <time className="text-xs text-fg-muted" dateTime={isoTimestamp}>
          {timeHHMM}
        </time>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-fg-subtle hover:text-fg transition-colors"
            aria-label="Dispensar notificação"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
