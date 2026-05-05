/**
 * LlmSection — Settings section for LLM provider + LM Studio URL (SEXT-01, SEXT-02).
 *
 * SEXT-01: URL input (text), validated on blur via native URL constructor.
 *          Prepends http:// if schema missing (Pitfall #1 from RESEARCH.md).
 *          Applied via onLmStudioUrlChange (real-time IPC, not Save button).
 *
 * SEXT-02: Provider dropdown (Radix Select). On change, calls estimateContextTokens
 *          to check for overflow. If exceedsLimit, shows confirmation modal before
 *          calling onLlmProviderChange.
 */
import React, { useState } from 'react';
import { Zap } from 'lucide-react';
import {
  Input,
  Field,
  Button,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../../components/ui';
import { estimateContextTokens } from '../../lib/tokenizer';
import type { SettingsSectionProps } from '../SettingsLayout';
import type { LlmProvider } from '../../../../../shared/ipc-types';

type Props = Pick<
  SettingsSectionProps,
  'lmStudioUrl' | 'onLmStudioUrlChange' | 'llmProvider' | 'onLlmProviderChange'
>;

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  lmstudio: 'LM Studio (Local)',
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
};

export function LlmSection({
  lmStudioUrl,
  onLmStudioUrlChange,
  llmProvider,
  onLlmProviderChange,
}: Props) {
  const [urlInput, setUrlInput] = useState(lmStudioUrl);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [pendingProvider, setPendingProvider] = useState<LlmProvider | null>(null);
  const [warningText, setWarningText] = useState<string | null>(null);

  function handleUrlBlur(): void {
    try {
      const withSchema = urlInput.startsWith('http') ? urlInput : `http://${urlInput}`;
      const normalized = new URL(withSchema).toString().replace(/\/$/, '');
      setUrlError(null);
      setUrlInput(normalized);
      void onLmStudioUrlChange(normalized);
    } catch {
      setUrlError('Invalid URL. Use format: http://host:port or host:port');
    }
  }

  function handleProviderSelect(value: string): void {
    const newProvider = value as LlmProvider;
    const estimation = estimateContextTokens(newProvider);
    if (estimation.exceedsLimit) {
      setPendingProvider(newProvider);
      setWarningText(estimation.summary);
      return;
    }
    void onLlmProviderChange(newProvider);
  }

  function handleModalConfirm(): void {
    if (pendingProvider) {
      void onLlmProviderChange(pendingProvider);
    }
    setPendingProvider(null);
    setWarningText(null);
  }

  function handleModalCancel(): void {
    setPendingProvider(null);
    setWarningText(null);
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-fg tracking-tight">LLM Configuration</h1>
      <p className="text-sm text-fg-subtle mt-sm mb-lg">
        Configure which AI model powers JARVIS and where to find it.
      </p>

      <Field error={!!urlError}>
        <Field.Label>LM Studio URL</Field.Label>
        <Field.Control>
          <Input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onBlur={handleUrlBlur}
            placeholder="http://localhost:1234/v1"
            aria-label="LM Studio base URL"
          />
        </Field.Control>
        <Field.Error>{urlError ?? ''}</Field.Error>
        <Field.Helper>
          URL where LM Studio is running. Applied immediately — no restart needed.
          Accepts <code>host:port</code> or <code>http://host:port/v1</code> format.
        </Field.Helper>
      </Field>

      <Field className="mt-lg">
        <Field.Label>LLM Provider</Field.Label>
        <Field.Control>
          <Select value={llmProvider} onValueChange={handleProviderSelect}>
            <SelectTrigger aria-label="Select LLM provider">
              <SelectValue placeholder="Choose provider" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PROVIDER_LABELS) as LlmProvider[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {PROVIDER_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field.Control>
        <Field.Helper>
          Applied immediately. Switching provider may affect response style and context limits.
        </Field.Helper>
      </Field>

      {/* Context overflow confirmation modal */}
      {warningText && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Provider switch warning"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        >
          <div className="bg-surface border border-white/8 rounded-lg p-xl max-w-md w-full shadow-xl">
            <div className="flex items-center gap-sm mb-base">
              <Zap size={20} className="text-amber-400" />
              <h2 className="text-base font-semibold text-fg">Context Overflow Warning</h2>
            </div>
            <p className="text-sm text-fg-muted mb-lg">{warningText}</p>
            <p className="text-sm text-fg-muted mb-xl">
              Older messages may be truncated when switching to{' '}
              <strong>{pendingProvider ? PROVIDER_LABELS[pendingProvider] : ''}</strong>.
              Continue?
            </p>
            <div className="flex justify-end gap-md">
              <Button variant="secondary" size="md" onClick={handleModalCancel}>
                Cancel
              </Button>
              <Button variant="primary" size="md" onClick={handleModalConfirm}>
                Switch Provider
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
