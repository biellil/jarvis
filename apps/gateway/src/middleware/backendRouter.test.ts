import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import { resolveUpstreamUrl } from './backendRouter.js';
import { config } from '../config.js';

/**
 * Cria um mock mínimo de Request do Express com os headers especificados.
 * Não depende de supertest nem de servidor HTTP — unit test puro.
 */
function makeReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

describe('resolveUpstreamUrl', () => {
  it('retorna backendTsUrl quando header X-Backend-Version é "ts"', () => {
    const req = makeReq({ 'x-backend-version': 'ts' });
    expect(resolveUpstreamUrl(req)).toBe(config.backendTsUrl);
  });

  it('retorna fastapiUrl quando header X-Backend-Version está ausente', () => {
    const req = makeReq({});
    expect(resolveUpstreamUrl(req)).toBe(config.fastapiUrl);
  });

  it('retorna fastapiUrl quando header X-Backend-Version tem valor diferente de "ts"', () => {
    const req = makeReq({ 'x-backend-version': 'python' });
    expect(resolveUpstreamUrl(req)).toBe(config.fastapiUrl);
  });
});
