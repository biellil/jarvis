/**
 * folder-watcher.ts — Phase 67 (D-13, D-14, D-12)
 *
 * Monitora uma única pasta (depth: 0) com chokidar 5.0.0.
 * Arquivos novos são acumulados em buffer com debounce de 2s.
 * Durante quiet hours, os eventos são diferidos para o fim do quiet window.
 *
 * Segurança (T-67-03): path validation deve acontecer ANTES de chamar startWatching.
 * Segurança (T-67-08): quietBuffer limitado a 1000 entradas para evitar crescimento ilimitado.
 */

import { watch as chokidarWatch, type FSWatcher } from 'chokidar';
import path from 'path';
import { isInQuietHours, nextQuietEnd } from './quiet-hours.js';

export interface QuietHoursConfig {
  enabled: boolean;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

export interface FolderEventFile {
  name: string;
  path: string;
}

export class FolderWatcher {
  private watcher: FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private quietDeferTimer: NodeJS.Timeout | null = null;
  private bufferFiles: FolderEventFile[] = [];
  private quietBuffer: FolderEventFile[] = [];
  private readonly getQuietHoursConfig: () => QuietHoursConfig;

  constructor(getQuietHoursConfig: () => QuietHoursConfig) {
    this.getQuietHoursConfig = getQuietHoursConfig;
  }

  async startWatching(
    folderPath: string,
    onFolderEvent: (files: FolderEventFile[]) => void,
  ): Promise<void> {
    // Close existing watcher and clear all pending state
    if (this.watcher !== null) {
      if (this.debounceTimer !== null) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      if (this.quietDeferTimer !== null) {
        clearTimeout(this.quietDeferTimer);
        this.quietDeferTimer = null;
      }
      this.bufferFiles = [];
      this.quietBuffer = [];
      await this.watcher.close();
      this.watcher = null;
    }

    this.watcher = chokidarWatch(folderPath, {
      ignoreInitial: true,
      persistent: true,
      depth: 0,
    });

    this.watcher.on('add', (filePath: string) => {
      this.bufferFiles.push({
        name: path.basename(filePath),
        path: filePath,
      });

      // Reset debounce timer on each new file
      if (this.debounceTimer !== null) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(() => {
        const filesToProcess = [...this.bufferFiles];
        this.bufferFiles = [];
        this.debounceTimer = null;

        const config = this.getQuietHoursConfig();
        const now = new Date();

        if (config.enabled && isInQuietHours(now, config.start, config.end)) {
          // T-67-08: cap quietBuffer at 1000 entries to prevent unbounded growth
          const remaining = 1000 - this.quietBuffer.length;
          if (remaining > 0) {
            this.quietBuffer.push(...filesToProcess.slice(0, remaining));
          }

          if (this.quietDeferTimer === null) {
            // First batch during this quiet window — schedule emit at quiet end
            const quietEndDate = nextQuietEnd(now, config.end);
            const msUntilQuietEnd = quietEndDate.getTime() - now.getTime();

            this.quietDeferTimer = setTimeout(() => {
              const buffered = [...this.quietBuffer];
              this.quietBuffer = [];
              this.quietDeferTimer = null;
              onFolderEvent(buffered);
            }, msUntilQuietEnd);
          }
          // If quietDeferTimer !== null: timer already running — just appended to quietBuffer
        } else {
          // Normal hours — fire immediately
          onFolderEvent(filesToProcess);
        }
      }, 2000);
    });

    this.watcher.on('error', (err: Error) => {
      console.error('[FolderWatcher] chokidar error:', err);
    });
  }

  async stopWatching(): Promise<void> {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.quietDeferTimer !== null) {
      clearTimeout(this.quietDeferTimer);
      this.quietDeferTimer = null;
    }
    this.bufferFiles = [];
    this.quietBuffer = [];
    if (this.watcher !== null) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
}
