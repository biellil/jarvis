import type { TTSProvider, TTSResult } from "./provider.js";

/**
 * ElevenLabsTTSProvider — cloud TTS de alta qualidade via API REST.
 *
 * Usa `fetch` nativo do Node 22+. Não depende de nenhum SDK externo.
 *
 * Env vars:
 *   - ELEVENLABS_API_KEY  (obrigatório — throw no synthesize se ausente)
 *   - ELEVENLABS_VOICE_ID (default: EXAVITQu4vr4xnSDxMaL — Sarah)
 *   - ELEVENLABS_MODEL_ID (default: eleven_multilingual_v2 — suporta pt-BR)
 */
export class ElevenLabsTTSProvider implements TTSProvider {
  readonly name = "elevenlabs";

  private readonly voiceId: string;
  private readonly modelId: string;

  constructor() {
    this.voiceId = process.env.ELEVENLABS_VOICE_ID ?? "EXAVITQu4vr4xnSDxMaL";
    this.modelId = process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2";
  }

  async synthesize(text: string): Promise<TTSResult> {
    if (!text || text.trim().length === 0) {
      throw new Error("ElevenLabsTTSProvider: empty text");
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error("ElevenLabsTTSProvider: ELEVENLABS_API_KEY not set");
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: this.modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`ElevenLabsTTSProvider: network error: ${msg}`);
    }

    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        body = "";
      }
      throw new Error(
        `ElevenLabs error ${res.status}: ${body.slice(0, 200)}`,
      );
    }

    const ab = await res.arrayBuffer();
    return { audio: Buffer.from(ab), format: "mp3" };
  }
}
