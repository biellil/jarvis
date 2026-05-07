/**
 * CAPTURE_SCREEN IPC handler — Phase 63 Vision Pipeline (VISION-01, VISION-03)
 *
 * D-01: desktopCapturer MUST run in main process (removed from renderer in Electron 20+)
 * D-01: PNG from desktopCapturer → sharp resize max 1920×1080 → JPEG 80% → base64 data URL
 * D-10: sharp is a native addon — externalized in MAIN_EXTERNALS (not bundled by Rollup)
 *
 * Pitfall: sources.length === 0 on macOS when Screen Recording permission denied.
 * Return { success: false, error: 'PERMISSION_DENIED' } — do NOT throw.
 */
import { ipcMain, desktopCapturer } from 'electron';
import sharp from 'sharp';
import { IPC_CHANNELS } from '../../shared/ipc-types.js';
import type { CaptureScreenResult } from '../../shared/ipc-types.js';

export function registerCaptureHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CAPTURE_SCREEN, async (): Promise<CaptureScreenResult> => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 },
      });

      if (sources.length === 0) {
        // macOS: Screen Recording permission denied — sources is empty, no error thrown
        console.warn('[capture] desktopCapturer returned 0 sources — permission denied?');
        return { success: false, error: 'PERMISSION_DENIED' };
      }

      // sources[0] is the primary screen
      const pngBuffer = sources[0].thumbnail.toPNG();

      // sharp resize (handles HiDPI/Retina — nativeImage.toJPEG() does not guarantee max dims)
      const jpegBuffer = await sharp(pngBuffer)
        .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();

      const base64 = `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
      console.log(`[capture] Screen captured — ${jpegBuffer.length} bytes JPEG`);

      return { success: true, base64 };
    } catch (err) {
      const message = (err as Error).message ?? 'Unknown error';
      console.error('[capture] desktopCapturer error:', message);
      return { success: false, error: message };
    }
  });
}
