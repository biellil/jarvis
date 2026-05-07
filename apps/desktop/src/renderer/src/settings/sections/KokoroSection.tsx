import {
  Field,
  Button,
  Progress,
} from '../../components/ui';
import type { KokoroDownloadProgress } from '../../../../shared/ipc-types';

interface KokoroSectionProps {
  modelCached: boolean;
  downloadState: KokoroDownloadProgress | null;
  onDownload: () => void;
  onCancelDownload: () => void;
}

export function KokoroSection({
  modelCached,
  downloadState,
  onDownload,
  onCancelDownload,
}: KokoroSectionProps) {
  const isDownloading = downloadState?.status === 'downloading';
  const hasError = downloadState?.status === 'error';

  // Helper text states (D-12 mirror of WhisperSection)
  let helperText: string;
  if (modelCached) {
    helperText = `Pronto (~350 MB) — síntese offline ativa`;
  } else if (isDownloading) {
    helperText = '';
  } else {
    helperText = 'Modelo não baixado — clique em Download para instalar (~350 MB)';
  }

  const progressText = isDownloading && downloadState
    ? `Baixando… ${downloadState.percent}% (${downloadState.downloadedMb.toFixed(0)} / ${downloadState.totalMb.toFixed(0)} MB)`
    : null;

  return (
    <div className="space-y-base">
      <Field>
        <Field.Label>Modelo Kokoro (~350 MB)</Field.Label>
        <Field.Control>
          {/* Action buttons row */}
          <div className="flex items-center gap-sm">
            {!modelCached && !isDownloading && (
              <Button variant="secondary" size="sm" onClick={onDownload} disabled={isDownloading}>
                Download modelo
              </Button>
            )}
            {isDownloading && (
              <Button variant="ghost" size="sm" onClick={onCancelDownload}>
                Cancelar
              </Button>
            )}
            {modelCached && !isDownloading && (
              <span aria-hidden="true" />
            )}
          </div>
        </Field.Control>

        {/* Progress bar — visible during and after successful download */}
        {downloadState && !hasError && (
          <div className="mt-md space-y-xs">
            <Progress
              variant="linear"
              value={downloadState.status === 'success' ? 100 : downloadState.percent}
              status={downloadState.status === 'success' ? 'success' : 'progress'}
              size="sm"
              label="Download progress"
            />
            {progressText && (
              <p className="text-xs text-fg-subtle">{progressText}</p>
            )}
          </div>
        )}

        {/* Error state: message + Try again (D-02 retry pattern) */}
        {hasError && (
          <div className="flex items-center gap-sm mt-xs">
            <span className="text-xs text-destructive">
              Falha no download. Verifique sua conexão.
            </span>
            <Button variant="ghost" size="sm" onClick={onDownload}>
              Try again
            </Button>
          </div>
        )}

        {/* Helper text — hidden when error (error row takes precedence) */}
        {!hasError && helperText && (
          <Field.Helper>{helperText}</Field.Helper>
        )}
      </Field>
    </div>
  );
}
