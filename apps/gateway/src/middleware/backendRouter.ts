import { type Request } from 'express';
import { config } from '../config.js';

/**
 * Resolve o upstream URL com base no header X-Backend-Version.
 *
 * - Header "X-Backend-Version: ts" → config.backendTsUrl (port 8001)
 * - Ausente ou qualquer outro valor → config.fastapiUrl (port 8000, default)
 *
 * Usado pelos route handlers de chat para implementar o feature flag VAL-07.
 * Não altera o comportamento padrão — Python continua sendo o default.
 */
export function resolveUpstreamUrl(req: Request): string {
  const version = req.headers['x-backend-version'];
  if (version === 'ts') {
    return config.backendTsUrl;
  }
  return config.fastapiUrl;
}
