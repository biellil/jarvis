import { pipeline } from '@xenova/transformers';

export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIM = 384;

// Singleton: load the model ONCE per process. Subsequent calls reuse the pipeline.
// Mirrors Python's "Created ONCE at session start" contract in src/jarvis/memory/vectors.py.
let extractorPromise: Promise<unknown> | null = null;

export async function getEmbedder(): Promise<unknown> {
  if (extractorPromise === null) {
    extractorPromise = pipeline('feature-extraction', EMBEDDING_MODEL);
  }
  return extractorPromise;
}

type ExtractorFn = (
  input: string | string[],
  opts: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array; dims: number[] }>;

export async function embedText(text: string): Promise<Float32Array> {
  try {
    const extractor = (await getEmbedder()) as ExtractorFn;
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    // output.data is a flat Float32Array of length EMBEDDING_DIM for a single input.
    return output.data as Float32Array;
  } catch (err) {
    console.error('[embeddings] embedText failed:', err);
    throw err;
  }
}

export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  try {
    const extractor = (await getEmbedder()) as ExtractorFn;
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    // output.data is a flat Float32Array of length texts.length * EMBEDDING_DIM.
    const flat = output.data as Float32Array;
    const result: Float32Array[] = [];
    for (let i = 0; i < texts.length; i++) {
      result.push(flat.slice(i * EMBEDDING_DIM, (i + 1) * EMBEDDING_DIM));
    }
    return result;
  } catch (err) {
    console.error('[embeddings] embedBatch failed:', err);
    throw err;
  }
}
