import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 512;

export { EMBEDDING_DIMENSIONS };

/**
 * Generate an embedding vector for the given text.
 */
export async function embedText(text: string): Promise<number[]> {
  const res = await getOpenAI().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return res.data[0].embedding;
}

/**
 * Generate embedding vectors for multiple texts in a single API call.
 * Returns vectors in the same order as the input texts.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await getOpenAI().embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  // OpenAI returns embeddings in order of index, but sort to be safe
  const sorted = [...res.data].sort((a, b) => a.index - b.index);
  return sorted.map((d) => d.embedding);
}

/**
 * Flatten a transcript into a single string for embedding.
 */
export function transcriptToText(
  lines: { speaker: string; text: string }[],
): string {
  return lines.map((l) => `${l.speaker}: ${l.text}`).join("\n");
}
