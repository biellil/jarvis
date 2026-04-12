import type { TTSProvider, TTSResult } from "./provider.js";

/**
 * MurfTTSProvider — cloud TTS de alta qualidade via Murf.ai REST API.
 *
 * Usa `fetch` nativo do Node 22+. Não depende de nenhum SDK externo.
 *
 * Env vars:
 *   - MURF_API_KEY  (obrigatório — throw no synthesize se ausente)
 *   - MURF_VOICE_ID (default: "pt-BR-heitor" — voz masculina pt-BR, style "Conversation")
 *
 * Alternativas de voz pt-BR masculina documentadas em `.env.example`:
 *   pt-BR-gustavo, pt-BR-benicio, pt-BR-silvio, pt-BR-yago
 *
 * PRIVACY: Murf é cloud TTS — envia APENAS o texto da resposta do LLM (não
 * áudio do usuário) para https://api.murf.ai. Usuário opta explicitamente via
 * `TTS_PROVIDER=murf` no `.env`. Áudio de entrada permanece local (STT roda
 * via nodejs-whisper). Mesmo trade-off do ElevenLabs existente.
 *
 * SECURITY (T-24-01): MURF_API_KEY NUNCA é concatenada em mensagens de erro,
 * bodies logados, ou chamadas `console.*`. Mensagens de erro usam apenas o
 * status HTTP + `res.text().slice(0, 200)`. Coberto por regression test
 * em `murf.test.ts`.
 *
 * Streaming endpoint (`/v1/speech/stream`) existe mas está fora do escopo da
 * Phase 24 por D-10. Referência para Phase 25 (partial TTS streaming).
 */
export class MurfTTSProvider implements TTSProvider {
  readonly name = "murf";

  private readonly voiceId: string;

  constructor() {
    this.voiceId = process.env.MURF_VOICE_ID ?? "pt-BR-heitor";
  }

  async synthesize(text: string): Promise<TTSResult> {
    if (!text || text.trim().length === 0) {
      throw new Error("MurfTTSProvider: empty text");
    }

    const apiKey = process.env.MURF_API_KEY;
    if (!apiKey) {
      throw new Error("MurfTTSProvider: MURF_API_KEY not set");
    }

    const url = "https://api.murf.ai/v1/speech/generate";

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          // Murf usa header literal `api-key` — NÃO é `Authorization: Bearer`.
          "api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          text,
          voiceId: this.voiceId,
          format: "MP3",
          channelType: "MONO",
          encodeAsBase64: true,
          rate: 0,
          pitch: 0,
        }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`MurfTTSProvider: network error: ${msg}`);
    }

    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        body = "";
      }
      throw new Error(`Murf error ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      encodedAudio?: string;
      audioFile?: string;
      audioLengthInSeconds?: number;
      remainingCharacterCount?: number;
    };

    if (!json.encodedAudio) {
      throw new Error("MurfTTSProvider: empty encodedAudio in response");
    }

    if (typeof json.remainingCharacterCount === "number") {
      console.log(
        `[voice] Murf quota remaining: ${json.remainingCharacterCount} chars`,
      );
    }

    return {
      audio: Buffer.from(json.encodedAudio, "base64"),
      format: "mp3",
    };
  }
}
