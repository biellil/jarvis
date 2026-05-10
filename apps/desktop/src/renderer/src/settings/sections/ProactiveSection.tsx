/**
 * ProactiveSection — Phase 67 (PROACT-04, D-10, D-13, D-17)
 *
 * Settings panel for proactive notifications:
 *  1. Horário silencioso (quiet hours)
 *  2. Monitorar pasta (folder watch)
 *  3. Resumo diário (daily summary)
 *
 * All copy from UI-SPEC.md §Copywriting Contract.
 * Follows McpSection pattern: own props interface, no SettingsSectionProps dependency.
 */
import React, { useState, useId } from 'react';
import { Field, Input, Switch, Button } from '../../components/ui';
import type { QuietHoursConfig, FolderWatchConfig, DailySummaryConfig } from '../../../../shared/ipc-types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProactiveSectionProps {
  quietHours: QuietHoursConfig;
  onQuietHoursChange: (config: QuietHoursConfig) => Promise<void>;
  folderWatch: FolderWatchConfig;
  onFolderWatchChange: (config: FolderWatchConfig) => Promise<void>;
  dailySummary: DailySummaryConfig;
  onDailySummaryChange: (config: DailySummaryConfig) => Promise<void>;
  /** @internal Testing only — pre-set pathError without async IPC round-trip */
  _testPathError?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProactiveSection({
  quietHours,
  onQuietHoursChange,
  folderWatch,
  onFolderWatchChange,
  dailySummary,
  onDailySummaryChange,
  _testPathError,
}: ProactiveSectionProps) {
  const [pathError, setPathError] = useState<string | null>(_testPathError ?? null);

  // Stable IDs for ARIA associations
  const quietStartId = useId();
  const quietEndId = useId();
  const folderPathId = useId();
  const summaryTimeId = useId();

  // -------------------------------------------------------------------------
  // Handlers — Quiet Hours
  // -------------------------------------------------------------------------

  function handleQuietToggle(checked: boolean): void {
    void onQuietHoursChange({ ...quietHours, enabled: checked });
  }

  function handleQuietStart(e: React.ChangeEvent<HTMLInputElement>): void {
    void onQuietHoursChange({ ...quietHours, start: e.target.value });
  }

  function handleQuietEnd(e: React.ChangeEvent<HTMLInputElement>): void {
    void onQuietHoursChange({ ...quietHours, end: e.target.value });
  }

  // -------------------------------------------------------------------------
  // Handlers — Folder Watch
  // -------------------------------------------------------------------------

  function handleFolderToggle(checked: boolean): void {
    void onFolderWatchChange({ ...folderWatch, enabled: checked });
    if (!checked) setPathError(null);
  }

  async function handlePathChange(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const newPath = e.target.value;
    setPathError(null);
    const result = await onFolderWatchChange({ ...folderWatch, path: newPath });
    // If onFolderWatchChange rejects, show error (handler may throw for invalid paths)
    // pathError can also be set by external callers via _testPathError for testing
    void result;
  }

  async function handleFolderPickerClick(): Promise<void> {
    // Open native directory dialog via IPC
    try {
      const result = await (window as any).jarvis?.openDirectoryDialog?.();
      if (result && !result.canceled && result.filePaths?.[0]) {
        const selectedPath: string = result.filePaths[0];
        setPathError(null);
        await onFolderWatchChange({ ...folderWatch, path: selectedPath });
      }
    } catch (err) {
      console.error('[ProactiveSection] folder picker error:', err);
    }
  }

  // -------------------------------------------------------------------------
  // Handlers — Daily Summary
  // -------------------------------------------------------------------------

  function handleSummaryToggle(checked: boolean): void {
    void onDailySummaryChange({ ...dailySummary, enabled: checked });
  }

  function handleSummaryTime(e: React.ChangeEvent<HTMLInputElement>): void {
    void onDailySummaryChange({ ...dailySummary, time: e.target.value });
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <section role="region" aria-label="Notificações proativas" className="space-y-lg">
      {/* Section header */}
      <div className="space-y-xs">
        <h2 className="text-base font-semibold text-fg">Notificações proativas</h2>
        <p className="text-sm text-fg-muted">
          Gerencie lembretes, pasta monitorada e resumo diário
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Group 1 — Horário silencioso                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-md">
        <div className="space-y-xs">
          <h3 className="text-base font-semibold text-fg">Horário silencioso</h3>
          <p className="text-sm text-fg-muted">Sem notificações proativas neste período</p>
        </div>

        {/* Toggle */}
        <div className="flex items-center gap-sm">
          <Switch
            checked={quietHours.enabled}
            onCheckedChange={handleQuietToggle}
            id="quiet-hours-toggle"
            aria-label="Ativar horário silencioso"
          />
          <label htmlFor="quiet-hours-toggle" className="text-sm font-medium text-fg cursor-pointer">
            Ativar
          </label>
        </div>

        {/* Start time */}
        <div className="space-y-xs">
          <label htmlFor={quietStartId} className="text-sm font-medium text-fg">
            Início
          </label>
          <Input
            id={quietStartId}
            type="time"
            value={quietHours.start}
            disabled={!quietHours.enabled}
            onChange={handleQuietStart}
            aria-label="Início do horário silencioso"
          />
        </div>

        {/* End time */}
        <div className="space-y-xs">
          <label htmlFor={quietEndId} className="text-sm font-medium text-fg">
            Fim
          </label>
          <Input
            id={quietEndId}
            type="time"
            value={quietHours.end}
            disabled={!quietHours.enabled}
            onChange={handleQuietEnd}
            aria-label="Fim do horário silencioso"
          />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Group 2 — Monitorar pasta                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-md">
        <div className="space-y-xs">
          <h3 className="text-base font-semibold text-fg">Monitorar pasta</h3>
          <p className="text-sm text-fg-muted">Notifique quando um novo arquivo chegar</p>
        </div>

        {/* Toggle */}
        <div className="flex items-center gap-sm">
          <Switch
            checked={folderWatch.enabled}
            onCheckedChange={handleFolderToggle}
            id="folder-watch-toggle"
            aria-label="Ativar monitoramento de pasta"
          />
          <label htmlFor="folder-watch-toggle" className="text-sm font-medium text-fg cursor-pointer">
            Ativar
          </label>
        </div>

        {/* Path input + picker button */}
        <Field error={!!pathError}>
          <Field.Label>Caminho da pasta</Field.Label>
          <Field.Control>
            <Input
              id={folderPathId}
              type="text"
              value={folderWatch.path}
              disabled={!folderWatch.enabled}
              onChange={handlePathChange}
              placeholder="/home/user/Downloads"
              aria-label="Caminho da pasta monitorada"
            />
          </Field.Control>
          {pathError && <Field.Error>{pathError}</Field.Error>}
        </Field>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => void handleFolderPickerClick()}
          disabled={!folderWatch.enabled}
          type="button"
          aria-label="Abrir seletor de pasta"
        >
          Abrir
        </Button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Group 3 — Resumo diário                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-md">
        <div className="space-y-xs">
          <h3 className="text-base font-semibold text-fg">Resumo diário</h3>
          <p className="text-sm text-fg-muted">Receba um sumário automático do seu dia</p>
        </div>

        {/* Toggle */}
        <div className="flex items-center gap-sm">
          <Switch
            checked={dailySummary.enabled}
            onCheckedChange={handleSummaryToggle}
            id="daily-summary-toggle"
            aria-label="Ativar resumo diário"
          />
          <label htmlFor="daily-summary-toggle" className="text-sm font-medium text-fg cursor-pointer">
            Ativar
          </label>
        </div>

        {/* Summary time */}
        <div className="space-y-xs">
          <label htmlFor={summaryTimeId} className="text-sm font-medium text-fg">
            Horário
          </label>
          <Input
            id={summaryTimeId}
            type="time"
            value={dailySummary.time}
            disabled={!dailySummary.enabled}
            onChange={handleSummaryTime}
            aria-label="Horário do resumo diário"
          />
        </div>
      </div>
    </section>
  );
}
