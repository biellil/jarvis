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
 *
 * Phase 57 (LLM-PROV-01): Adds 'Google Gemini' as 4th provider option. Conditional
 *          API key inputs for openai/anthropic/gemini. reloadLlm called on provider
 *          change and on API key blur.
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
import type { LlmProvider } from '@shared/ipc-types';

type Props = Pick<
  SettingsSectionProps,
  | 'lmStudioUrl'
  | 'onLmStudioUrlChange'
  | 'llmProvider'
  | 'onLlmProviderChange'
  | 'openaiApiKey'
  | 'anthropicApiKey'
  | 'geminiApiKey'
  | 'onReloadLlm'
  | 'streamingLMStudioEventsEnabled'
  | 'onStreamingLMStudioEventsChange'
>;

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  lmstudio: 'LM Studio (Local)',
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
  gemini: 'Google Gemini',
};

export function LlmSection({
  lmStudioUrl,
  onLmStudioUrlChange,
  llmProvider,
  onLlmProviderChange,
  openaiApiKey,
  anthropicApiKey,
  geminiApiKey,
  onReloadLlm,
  streamingLMStudioEventsEnabled,
  onStreamingLMStudioEventsChange,
}: Props) {
  const [urlInput, setUrlInput] = useState(lmStudioUrl);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [pendingProvider, setPendingProvider] = useState<LlmProvider | null>(null);
  const [warningText, setWarningText] = useState<string | null>(null);

  // Phase 57 — local state for API key inputs
  const [openaiKeyInput, setOpenaiKeyInput] = useState(openaiApiKey);
  const [anthropicKeyInput, setAnthropicKeyInput] = useState(anthropicApiKey);
  const [geminiKeyInput, setGeminiKeyInput] = useState(geminiApiKey);

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

  // Phase 57 — handleReloadLlm called on provider change and API key blur
  function handleReloadLlm(provider: LlmProvider): void {
    void onReloadLlm({
      provider,
      lmStudioUrl: lmStudioUrl,
      openaiApiKey: provider === 'openai' ? openaiKeyInput : undefined,
      anthropicApiKey: provider === 'anthropic' ? anthropicKeyInput : undefined,
      geminiApiKey: provider === 'gemini' ? geminiKeyInput : undefined,
    });
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
    handleReloadLlm(newProvider);
  }

  function handleModalConfirm(): void {
    if (pendingProvider) {
      void onLlmProviderChange(pendingProvider);
      handleReloadLlm(pendingProvider);
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

      {/* Phase 57 — Conditional API key inputs (D-07, D-08, D-09) */}
      {llmProvider === 'openai' && (
        <Field className="mt-lg">
          <Field.Label>OpenAI API Key</Field.Label>
          <Field.Control>
            <Input
              type="text"
              value={openaiKeyInput}
              onChange={(e) => setOpenaiKeyInput(e.target.value)}
              onBlur={() => handleReloadLlm('openai')}
              placeholder="sk-proj-…"
              aria-label="OpenAI API Key"
            />
          </Field.Control>
          <Field.Helper>Found at https://platform.openai.com/account/api-keys</Field.Helper>
        </Field>
      )}

      {llmProvider === 'anthropic' && (
        <Field className="mt-lg">
          <Field.Label>Anthropic API Key</Field.Label>
          <Field.Control>
            <Input
              type="text"
              value={anthropicKeyInput}
              onChange={(e) => setAnthropicKeyInput(e.target.value)}
              onBlur={() => handleReloadLlm('anthropic')}
              placeholder="sk-ant-…"
              aria-label="Anthropic API Key"
            />
          </Field.Control>
          <Field.Helper>Found at https://console.anthropic.com/account/keys</Field.Helper>
        </Field>
      )}

      {llmProvider === 'gemini' && (
        <Field className="mt-lg">
          <Field.Label>Google Gemini API Key</Field.Label>
          <Field.Control>
            <Input
              type="text"
              value={geminiKeyInput}
              onChange={(e) => setGeminiKeyInput(e.target.value)}
              onBlur={() => handleReloadLlm('gemini')}
              placeholder="AIzaSy…"
              aria-label="Google Gemini API Key"
            />
          </Field.Control>
          <Field.Helper>Get free API key at https://aistudio.google.com/apikey</Field.Helper>
        </Field>
      )}

      {/* Phase 60 — LM Studio Streaming Events toggle (LLM-PROV-02, D-04: always visible) */}
      <Field className="mt-lg">
        <Field.Label>LM Studio Streaming Events</Field.Label>
        <Field.Control>
          <label className="flex items-center gap-sm cursor-pointer">
            <input
              type="checkbox"
              checked={streamingLMStudioEventsEnabled}
              onChange={(e) => onStreamingLMStudioEventsChange(e.target.checked)}
              aria-label="Enable LM Studio Streaming Events"
            />
            <span className="text-sm text-fg">Enable native streaming protocol</span>
          </label>
        </Field.Control>
        <Field.Helper>
          Uses LM Studio&apos;s native /api/v1/chat SSE events instead of OpenAI-compat endpoint.
          Falls back to standard SSE automatically if unsupported. Applied immediately.
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
