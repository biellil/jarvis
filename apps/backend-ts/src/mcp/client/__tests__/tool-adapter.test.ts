import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildLangChainTool, TOOL_TIMEOUT_MS, type McpToolDef } from '../tool-adapter.js';

type CallToolFn = (req: { name: string; arguments: any }) => Promise<any>;
function makeClient(callTool: CallToolFn): any {
  return { callTool: vi.fn(callTool) };
}
function makeLogger(): any {
  return { logDispatch: vi.fn(() => 1) };
}

const sampleDef: McpToolDef = {
  name: 'send_email',
  description: 'Sends an email via SMTP',
  inputSchema: {
    type: 'object',
    properties: { to: { type: 'string' }, body: { type: 'string' } },
    required: ['to', 'body'],
  },
};

describe('buildLangChainTool (Phase 65 D-05/D-06/D-07/D-15/D-16/D-17)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
    vi.useRealTimers();
  });

  it('invoke forwards to client.callTool with original (unprefixed) name', async () => {
    const client = makeClient(async () => ({ content: [{ type: 'text', text: 'ok' }] }));
    const logger = makeLogger();
    const t = buildLangChainTool(sampleDef, 'n8n', client, new Set(), logger)!;
    await t.invoke({ to: 'a@b', body: 'hi' });
    expect(client.callTool).toHaveBeenCalledWith({
      name: 'send_email',
      arguments: { to: 'a@b', body: 'hi' },
    });
  });

  it('prefixed name uses MCP_SERVER_NAME', () => {
    const t = buildLangChainTool(sampleDef, 'n8n', makeClient(async () => ({ content: [] })), new Set(), makeLogger())!;
    expect(t.name).toBe('n8n.send_email');
  });

  it('annotated description prepends [via NAME]', () => {
    const t = buildLangChainTool(sampleDef, 'n8n', makeClient(async () => ({ content: [] })), new Set(), makeLogger())!;
    expect(t.description).toBe('[via n8n] Sends an email via SMTP');
  });

  it('collision skip: prefixed name in nativeNames returns null + warn', () => {
    const t = buildLangChainTool(sampleDef, 'n8n', makeClient(async () => ({ content: [] })), new Set(['n8n.send_email']), makeLogger());
    expect(t).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]![0]).toContain('n8n.send_email');
    expect(warnSpy.mock.calls[0]![0]).toContain('skipped');
  });

  it('collision skip: raw name match is also caught (defensive for empty serverName)', () => {
    const t = buildLangChainTool(
      { ...sampleDef, name: 'recall_memory' },
      '',
      makeClient(async () => ({ content: [] })),
      new Set(['recall_memory']),
      makeLogger(),
    );
    expect(t).toBeNull();
  });

  it('schema preserves required fields (Zod throws on missing required)', async () => {
    const t = buildLangChainTool(sampleDef, 'n8n', makeClient(async () => ({ content: [{ type: 'text', text: 'ok' }] })), new Set(), makeLogger())!;
    // Invoking with empty input should fail schema validation before reaching callTool
    await expect(t.invoke({} as any)).rejects.toBeTruthy();
  });

  it('server down: thrown callTool returns pt-BR error string', async () => {
    const client = makeClient(async () => { throw new Error('ECONNREFUSED'); });
    const logger = makeLogger();
    const t = buildLangChainTool(sampleDef, 'n8n', client, new Set(), logger)!;
    const result = await t.invoke({ to: 'a@b', body: 'hi' });
    expect(result).toContain('MCP server n8n indisponível');
    expect(result).toContain('send_email');
    expect(result).toContain('ECONNREFUSED');
  });

  it('isError true is returned as joined text (LLM narrates)', async () => {
    const client = makeClient(async () => ({ isError: true, content: [{ type: 'text', text: 'rate limit' }] }));
    const t = buildLangChainTool(sampleDef, 'n8n', client, new Set(), makeLogger())!;
    const result = await t.invoke({ to: 'a@b', body: 'hi' });
    expect(result).toBe('rate limit');
  });

  it('ToolLogger receives mcp-external metadata on success', async () => {
    const client = makeClient(async () => ({ content: [{ type: 'text', text: 'ok' }] }));
    const logger = makeLogger();
    const t = buildLangChainTool(sampleDef, 'n8n', client, new Set(), logger)!;
    await t.invoke({ to: 'a@b', body: 'hi' });
    expect(logger.logDispatch).toHaveBeenCalledWith(
      'n8n.send_email',
      { to: 'a@b', body: 'hi' },
      { source: 'mcp-external', serverName: 'n8n' },
    );
  });

  it('ToolLogger receives error metadata on failure', async () => {
    const client = makeClient(async () => { throw new Error('boom'); });
    const logger = makeLogger();
    const t = buildLangChainTool(sampleDef, 'n8n', client, new Set(), logger)!;
    await t.invoke({ to: 'a@b', body: 'hi' });
    expect(logger.logDispatch).toHaveBeenCalledWith(
      'n8n.send_email',
      { to: 'a@b', body: 'hi' },
      expect.objectContaining({
        source: 'mcp-external',
        serverName: 'n8n',
        error: 'boom',
      }),
    );
  });

  it('30s timeout returns timeout error when callTool never resolves', async () => {
    vi.useFakeTimers();
    const client = makeClient(() => new Promise(() => { /* never resolves */ }));
    const logger = makeLogger();
    const t = buildLangChainTool(sampleDef, 'n8n', client, new Set(), logger)!;
    const promise = t.invoke({ to: 'a@b', body: 'hi' });
    await vi.advanceTimersByTimeAsync(TOOL_TIMEOUT_MS + 10);
    const result = await promise;
    expect(result).toContain('MCP server n8n indisponível');
    expect(result).toContain('timeout');
    expect(result).toContain('30000ms');
  });
});
