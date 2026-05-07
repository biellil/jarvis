/**
 * Input validators + execFile wrapper for PC action handlers.
 *
 * SECURITY: subprocess helper uses ONLY `execFile` (never `exec`), always with
 * args as an array. Inputs MUST be validated here before reaching the handler.
 */
import { execFile } from 'node:child_process';

export const EXEC_TIMEOUT_MS = 30_000;
const MAX_STDERR_CHARS = 500;

export class ActionValidationError extends Error {
  public readonly code: string;
  constructor(code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.name = 'ActionValidationError';
  }
}

const SAFE_APP_NAME_RE = /^[a-zA-Z0-9._\-+]+$/;

export function assertAbsolutePath(p: unknown, field: string): string {
  if (typeof p !== 'string' || p.length === 0) {
    throw new ActionValidationError('invalid_args', `${field} must be a non-empty string`);
  }
  if (p.startsWith('~') || p.includes('$HOME') || p.startsWith('./') || p.startsWith('../')) {
    throw new ActionValidationError('path_must_be_absolute', field);
  }
  if (!p.startsWith('/')) {
    throw new ActionValidationError('path_must_be_absolute', field);
  }
  return p;
}

export function assertSafeAppName(name: unknown): string {
  if (typeof name !== 'string' || name.length === 0) {
    throw new ActionValidationError('invalid_args', 'app must be a non-empty string');
  }
  if (!SAFE_APP_NAME_RE.test(name)) {
    throw new ActionValidationError('invalid_args', 'app contains unsafe characters');
  }
  return name;
}

export function assertLevel0to100(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100) {
    throw new ActionValidationError('invalid_args', 'level must be integer in [0,100]');
  }
  return v;
}

export function assertDelta(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < -100 || v > 100) {
    throw new ActionValidationError('invalid_args', 'delta must be integer in [-100, 100]');
  }
  return v;
}

export function assertSafeGlobPattern(p: unknown): string {
  if (typeof p !== 'string' || p.length === 0) {
    throw new ActionValidationError('invalid_args', 'pattern must be a non-empty string');
  }
  if (
    p.includes('..') ||
    p.includes('/') ||
    p.includes(';') ||
    p.includes('|') ||
    p.includes('`') ||
    p.includes('$')
  ) {
    throw new ActionValidationError('invalid_args', 'pattern contains unsafe characters');
  }
  return p;
}

export interface ExecFileResult {
  stdout: string;
  stderr: string;
}

/**
 * Wraps `child_process.execFile` in a Promise with structured error mapping.
 * NEVER invoke a shell. Args ALWAYS passed as an array.
 */
export function runExecFile(cmd: string, args: string[]): Promise<ExecFileResult> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { timeout: EXEC_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          // Map typical failures to structured codes.
          const err = error as NodeJS.ErrnoException & { killed?: boolean; code?: string | number };
          if (err.killed) {
            reject(new ActionValidationError('subprocess_timeout'));
            return;
          }
          if (err.code === 'ENOENT') {
            reject(new ActionValidationError('command_not_found', cmd));
            return;
          }
          if (err.code === 'EACCES') {
            reject(new ActionValidationError('permission_denied', cmd));
            return;
          }
          const trimmed = String(stderr ?? error.message ?? '').slice(0, MAX_STDERR_CHARS);
          reject(new ActionValidationError('subprocess_failed', trimmed));
          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

/**
 * Maps an unknown thrown value into the structured error string used by the
 * `ActionResult` tagged union.
 */
export function describeError(err: unknown): string {
  if (err instanceof ActionValidationError) {
    return err.message;
  }
  const e = err as NodeJS.ErrnoException;
  if (e?.code === 'ENOENT') return 'path_not_found';
  if (e?.code === 'EACCES' || e?.code === 'EPERM') return 'permission_denied';
  if (e?.code === 'EXDEV') return 'subprocess_failed: cross-device move not supported';
  if (e?.message) return `subprocess_failed: ${e.message.slice(0, 500)}`;
  return 'subprocess_failed: unknown error';
}
