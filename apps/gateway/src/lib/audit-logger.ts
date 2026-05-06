import { config } from '../config.js';
import { logger } from './logger.js';

export interface ActionLogEntry {
  timestamp: string;
  path: string;
  action: string;
  result: 'approved' | 'denied' | 'timeout';
  model?: string;
  clientId?: string;
  requestId?: string;
}

export async function logActionToBackend(entry: ActionLogEntry): Promise<void> {
  try {
    const response = await fetch(`${config.backendTsUrl}/internal/actions-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (!response.ok) {
      logger.warn({ status: response.status, path: entry.path }, 'Action log POST failed');
    }
  } catch (err) {
    logger.error({ error: err, path: entry.path }, 'Action log POST error — audit not persisted');
  }
}
