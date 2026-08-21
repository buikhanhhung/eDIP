import { Logger } from '@nestjs/common';
import type { IEmbeddingService } from '@infrastructure/ai/ai.port';
import type { Chunk, ChunkingStrategy } from './chunking.types';
import { chooseThreshold, groupSizes } from './semantic-threshold';
import { cosineSimilarity, splitSentences } from './sentence-splitter';
import { splitText } from './text-splitter';

/**
 * Chunk size the threshold search aims for, in characters.
 *
 * Characters rather than estimated tokens: everything else in this module
 * measures in characters, and `splitText` defaults to a thousand, so the two
 * strategies produce comparably sized chunks instead of differing by whatever
 * a token estimate happens to be.
 */
const TARGET_CHUNK_CHARS = 1000;

/** A threshold that would produce a chunk shorter than this is rejected. */
const MIN_CHUNK_CHARS = 200;

/**
 * Below this many sentences the whole document is one topic often enough that
 * embedding each sentence buys nothing — and it is the check that keeps a
 * two-line upload from costing a provider call.
 */
const MIN_SENTENCES = 5;

/**
 * Above this, the sentence-by-sentence pass costs more than it is worth.
 *
 * The provider batches ninety-six at a time and does so sequentially, so the
 * calls, the wait and the vectors held in memory all grow with the sentence
 * count: at this cap it is sixteen calls and roughly twelve megabytes of
 * floats, and a rate limit at the last batch discards everything the earlier
 * ones were billed for. A document this long is also the least likely to be a
 * single topic, which is what the strategy is for.
 */
const MAX_SENTENCES = 1500;

const logger = new Logger('SemanticChunking');

export interface SemanticOptions {
  targetChars?: number;
  minChars?: number;
  minSentences?: number;
  maxSentences?: number;
}

/**
 * Cuts where the meaning changes rather than where the character budget runs
 * out: each sentence is embedded, and a chunk ends where a neighbouring pair
 * stops resembling each other.
 *
 * It is the only strategy that spends quota, so every path that cannot deliver
 * falls back to the paragraph splitter instead of failing the document — and
 * says so in `metadata`, because a document recorded as SEMANTIC whose chunks
 * were cut another way is otherwise indistinguishable from one that was not.
 *
 * There is no separate accounting to do here: the provider records its own
 * usage inside `generateEmbeddings`, so adding a second record would count this
 * pass twice.
 */
export async function semanticChunks(
  text: string,
  embeddings?: IEmbeddingService,
  options: SemanticOptions = {},
): Promise<Chunk[]> {
  const targetChars = options.targetChars ?? TARGET_CHUNK_CHARS;
  const minChars = options.minChars ?? MIN_CHUNK_CHARS;
  const minSentences = options.minSentences ?? MIN_SENTENCES;
  const maxSentences = options.maxSentences ?? MAX_SENTENCES;

  if (text.trim().length === 0) return [];

  if (!embeddings) {
    // The registry is meant to supply this; reaching here is a wiring mistake
    // rather than a runtime condition, and the document still gets chunked.
    return fallback(text, 'no embedding service was supplied');
  }

  const sentences = splitSentences(text);
  if (sentences.length < minSentences) {
    return fallback(text, `only ${sentences.length} sentence(s), not worth an embedding call`);
  }
  if (sentences.length > maxSentences) {
    return fallback(
      text,
      `${sentences.length} sentences exceeds the ${maxSentences} this strategy will embed`,
    );
  }

  let vectors: number[][];
  try {
    // One call with the whole array: the provider batches internally, and
    // asking sentence by sentence is how a long document meets a rate limit.
    vectors = await embeddings.generateEmbeddings(sentences, 'search_document');
  } catch (error) {
    return fallback(text, (error as Error).message);
  }

  if (vectors.length !== sentences.length) {
    return fallback(text, `got ${vectors.length} vectors for ${sentences.length} sentences`);
  }

  return groupBySimilarity(sentences, vectors, targetChars, minChars);
}

/**
 * The registered strategy: the same work at the production sizes. The sizes are
 * a parameter only so a test can hand it a document small enough to reason
 * about — at a thousand-character target, a three-hundred-character fixture is
 * correctly left whole, which makes cutting impossible to exercise.
 */
export const semanticStrategy: ChunkingStrategy = (text: string, embeddings?: IEmbeddingService) =>
  semanticChunks(text, embeddings);

function groupBySimilarity(
  sentences: string[],
  vectors: number[][],
  targetChars: number,
  minChars: number,
): Chunk[] {
  const similarities: number[] = [];
  for (let i = 1; i < sentences.length; i++) {
    similarities.push(cosineSimilarity(vectors[i - 1], vectors[i]));
  }

  // Sentence lengths plus the single space `buildChunk` joins them with, so the
  // size the search reasons about is the size of the string that gets stored.
  const sizes = sentences.map((sentence, index) => sentence.length + (index > 0 ? 1 : 0));
  const shape = { targetChars, minChars };
  const threshold = chooseThreshold(similarities, sizes, shape);

  // The same function the search scored its candidates with — cuts and the
  // merge of short groups included — so the chunks it was choosing between are
  // the chunks that come out.
  const groups = groupSizes(similarities, sizes, threshold, shape);

  const chunks: Chunk[] = [];
  let offset = 0;
  for (const count of groups) {
    chunks.push(buildChunk(sentences.slice(offset, offset + count), threshold));
    offset += count;
  }

  return chunks;
}

function buildChunk(sentences: string[], threshold: number): Chunk {
  return {
    content: sentences.join(' '),
    metadata: {
      chunkingStrategy: 'SEMANTIC',
      sentenceCount: sentences.length,
      // Recorded per document, because it was chosen per document: without it
      // there is no way to tell a document that stayed whole from one the
      // search declined to cut.
      similarityThreshold: Number(threshold.toFixed(3)),
    },
  };
}

/**
 * The paragraph splitter's own output, marked with why it was used. The reason
 * is stored rather than only logged: logs rotate, and the row is what someone
 * reads when they ask why a document chose one strategy and got another.
 */
function fallback(text: string, reason: string): Chunk[] {
  logger.warn(`semantic chunking unavailable (${reason}); falling back to paragraph splitting`);

  return splitText(text).map((content) => ({
    content,
    metadata: {
      chunkingStrategy: 'SEMANTIC',
      fellBackTo: 'RECURSIVE_CHARACTER',
      fallbackReason: reason,
    },
  }));
}
