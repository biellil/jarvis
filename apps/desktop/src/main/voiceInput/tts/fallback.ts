import type { TTSProvider, TTSResult } from "./provider.js";

/**
 * FallbackTTSProvider — tenta primary, cai pra secondary se primary throw.
 *
 * Usado pra combinar dois cloud providers num provider único que nunca falha
 * silenciosamente: se cloud primário cai, loga warning e usa secundário.
 * O result carrega `providerUsed` pro audit log saber quem efetivamente sintetizou.
 *
 * Migrated to Electron main process in Phase 30 (TTS-01, TTS-03).
 */
export class FallbackTTSProvider implements TTSProvider {
  readonly name: string;

  constructor(
    private readonly primary: TTSProvider,
    private readonly secondary: TTSProvider,
  ) {
    this.name = `${primary.name}+${secondary.name}`;
  }

  async synthesize(text: string): Promise<TTSResult> {
    let primaryErr: unknown;
    try {
      const result = await this.primary.synthesize(text);
      return { ...result, providerUsed: this.primary.name };
    } catch (err) {
      primaryErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[voice] TTS primary ${this.primary.name} failed: ${msg}; falling back to ${this.secondary.name}`,
      );
    }

    try {
      const result = await this.secondary.synthesize(text);
      return { ...result, providerUsed: this.secondary.name };
    } catch (err) {
      const e1 = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      const e2 = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Both TTS providers failed: primary=${e1}; secondary=${e2}`,
      );
    }
  }
}
