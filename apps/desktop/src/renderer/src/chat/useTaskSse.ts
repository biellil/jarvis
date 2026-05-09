/**
 * useTaskSse — Phase 66 (AGENT-03)
 *
 * Hook that opens an SSE connection via fetch + ReadableStream (NOT EventSource,
 * because EventSource has no custom-header API and we need Bearer auth).
 *
 * Parses the SSE wire format: `event: {kind}\ndata: {json}\n\n`
 * Dispatches typed TaskSseEvent for task:* events.
 * Passes legacy chat token data to onTextToken.
 *
 * Reconnect on disconnect is the CALLER's responsibility — this hook manages
 * a single SSE lifetime tied to [url, bearer] deps. Re-mount to reconnect.
 */
import { useEffect } from 'react';
import type { TaskSseEvent } from '../../../shared/ipc-types';

const TASK_EVENT_KINDS = new Set<string>([
  'task:plan',
  'task:awaiting-confirmation',
  'task:edit-loop',
  'task:step:start',
  'task:step:end',
  'task:awaiting-failure-decision',
  'task:done',
  'task:cancelled',
  'task:error',
]);

export interface UseTaskSseOptions {
  /** Full URL, e.g. 'http://localhost:3000/api/chat/stream?message=...' */
  url: string;
  bearer: string;
  onTaskEvent: (evt: TaskSseEvent) => void;
  /** Legacy chat token stream — non-task SSE data messages */
  onTextToken?: (token: string) => void;
  onError?: (err: Error) => void;
  onClose?: () => void;
}

export function useTaskSse(opts: UseTaskSseOptions | null): void {
  useEffect(() => {
    if (!opts) return;

    const controller = new AbortController();
    let closed = false;

    void (async () => {
      try {
        const response = await fetch(opts.url, {
          headers: { Authorization: `Bearer ${opts.bearer}` },
          signal: controller.signal,
        });
        if (!response.body) {
          opts.onError?.(new Error('No response body'));
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!closed) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          let idx: number;
          // SSE messages are separated by \n\n; parse each complete message.
          while ((idx = buffer.indexOf('\n\n')) >= 0) {
            const raw = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);

            const lines = raw.split('\n');
            let eventName: string | null = null;
            let dataStr = '';

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventName = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                dataStr += line.slice(6);
              }
            }

            if (eventName && TASK_EVENT_KINDS.has(eventName)) {
              try {
                const payload = JSON.parse(dataStr) as Record<string, unknown>;
                opts.onTaskEvent({ ...payload, kind: eventName } as TaskSseEvent);
              } catch (err) {
                opts.onError?.(err as Error);
              }
            } else if (!eventName && dataStr) {
              // Legacy chat token data arrives without an event name
              opts.onTextToken?.(dataStr.replace(/\\n/g, '\n'));
            }
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          opts.onError?.(err as Error);
        }
      } finally {
        opts.onClose?.();
      }
    })();

    return () => {
      closed = true;
      controller.abort();
    };
    // Re-open SSE only when url or bearer changes — not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.url, opts?.bearer]);
}
