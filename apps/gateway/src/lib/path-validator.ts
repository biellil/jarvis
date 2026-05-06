import os from 'os';
import path from 'path';
import { z } from 'zod';

const WHITELISTED_DIRS = ['Downloads', 'Documents', 'Desktop'];

export function isPathValid(userPath: string): boolean {
  if (!userPath) return false;
  try {
    const home = os.homedir();
    const absolutePath = path.resolve(userPath);
    // Must be inside home or be home itself
    if (!absolutePath.startsWith(home + path.sep) && absolutePath !== home) {
      return false;
    }
    const relative = path.relative(home, absolutePath);
    // Home itself
    if (relative === '' || relative === '.') return true;
    // Reject any path containing '..' (traversal after resolve — belt-and-suspenders)
    if (relative.includes('..')) return false;
    const topDir = relative.split(path.sep)[0];
    return WHITELISTED_DIRS.includes(topDir!);
  } catch {
    return false;
  }
}

export const ActionRequestSchema = z.object({
  type: z.literal('action_request'),
  requestId: z.string().uuid(),
  action: z.enum(['openFolder', 'openFile', 'closeFile', 'viewContent']),
  path: z.string().refine(isPathValid, {
    message: 'Path outside whitelist (home, Downloads, Documents, Desktop)',
  }),
  model: z.string(),
});

export const ActionAckSchema = z.object({
  type: z.literal('action_ack'),
  requestId: z.string().uuid(),
  status: z.enum(['confirmed', 'denied', 'timeout']),
  /**
   * Phase 55 (D-01): file content for viewContent actions.
   * Present only when action=viewContent AND status='confirmed'.
   * Gateway passes this through to sendActionRequest return value.
   */
  content: z.string().optional(),
});

export type ActionRequest = z.infer<typeof ActionRequestSchema>;
export type ActionAck = z.infer<typeof ActionAckSchema>;
