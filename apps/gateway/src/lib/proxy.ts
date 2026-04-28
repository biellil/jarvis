import {
  fetch as undiciFetch,
  type RequestInit,
  type Response as UndiciResponse,
} from "undici";
import type { Logger } from "pino";
import { logger } from "./logger.js";

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

export interface LoggedFetchOptions extends RequestInit {
  /** Logger filho com reqId; default: logger raiz. */
  log?: Logger;
}

/**
 * Wrapper instrumentado de undici.fetch que loga 1 linha por chamada
 * (info no sucesso, error na exceção) com target/method/status/durationMs.
 */
export async function loggedFetch(
  url: string,
  options: LoggedFetchOptions = {},
): Promise<UndiciResponse> {
  const { log = logger, ...init } = options;
  const method = init.method ?? "GET";
  const start = process.hrtime.bigint();

  try {
    const res = await undiciFetch(url, init);
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    log.info(
      {
        target: url,
        method,
        status: res.status,
        durationMs: Math.round(durationMs * 100) / 100,
      },
      "proxy",
    );
    return res;
  } catch (err) {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    log.error(
      {
        target: url,
        method,
        durationMs: Math.round(durationMs * 100) / 100,
        err: {
          message: (err as Error).message,
          name: (err as Error).name,
        },
      },
      "proxy_error",
    );
    throw err;
  }
}
