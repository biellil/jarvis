/**
 * POST /internal/capture-screen — Phase 63 Vision Pipeline (VISION-01)
 *
 * Called by the backend's ChatSession captureScreenFn (via fetch to gateway).
 * Reads clientId from x-jarvis-client-id header, dispatches WS capture request to Electron,
 * returns CaptureScreenResult as JSON.
 */
import { Router } from 'express';
import { dispatchCaptureScreen } from '../lib/capture-screen-dispatcher.js';

export const captureScreenRouter = Router();

captureScreenRouter.post('/capture-screen', async (req, res) => {
  const clientId = req.headers['x-jarvis-client-id'];
  if (!clientId || typeof clientId !== 'string') {
    res.status(400).json({ success: false, error: 'x-jarvis-client-id header required' });
    return;
  }

  const result = await dispatchCaptureScreen(clientId);
  res.json(result);
});
