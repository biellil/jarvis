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
import { useEffect, useRef } from 'react';
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
  // WR-05: keep callbacks in a ref so re-renders with new function identities
  // don't require re-opening SSE, but the latest callbacks are still used.
  const callbacksRef = useRef(opts);
  useEffect(() => {
    callbacksRef.current = opts;
  }, [opts]);

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
          callbacksRef.current?.onError?.(new Error('No response body'));
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
            // WR-02: collect all `data:` lines and join with `\n` per SSE spec.
            // Tolerate both `data: ` (with space) and `data:` (no space) prefixes.
            const dataLines: string[] = [];

            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventName = line.replace(/^event:\s?/, '').trim();
              } else if (line.startsWith('data:')) {
                dataLines.push(line.replace(/^data:\s?/, ''));
              }
            }

            const dataStr = dataLines.join('\n');

            if (eventName && TASK_EVENT_KINDS.has(eventName)) {
              try {
                // Task event JSON payloads come from JSON.stringify on the
                // backend, so they never contain literal newlines — single
                // data: line is the norm here.
                const payload = JSON.parse(dataStr) as Record<string, unknown>;
                callbacksRef.current?.onTaskEvent({ ...payload, kind: eventName } as TaskSseEvent);
              } catch (err) {
                callbacksRef.current?.onError?.(err as Error);
              }
            } else if (!eventName && dataStr) {
              // Legacy chat token data arrives without an event name and is
              // emitted by the backend with `\n` escaped as the literal `\n`
              // (chat.ts uses content.replace(/\n/g, '\\n')). Reverse here.
              callbacksRef.current?.onTextToken?.(dataStr.replace(/\\n/g, '\n'));
            }
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          callbacksRef.current?.onError?.(err as Error);
        }
      } finally {
        callbacksRef.current?.onClose?.();
      }
    })();

    return () => {
      closed = true;
      controller.abort();
    };
    // Re-open SSE only when url or bearer changes — not on every render.
    // Other callbacks are accessed via callbacksRef so stale-closure is avoided.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.url, opts?.bearer]);
}
