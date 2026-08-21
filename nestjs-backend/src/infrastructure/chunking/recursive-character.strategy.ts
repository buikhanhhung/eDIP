import type { Chunk, ChunkingStrategy } from './chunking.types';
import { splitText } from './text-splitter';

/**
 * The behaviour the corpus was built with, reached through the registry.
 *
 * It delegates rather than absorbing `splitText`, because the five tests in
 * `text-splitter.spec.ts` are aimed at that function — and this is the strategy
 * the other three are compared against.
 */
export const recursiveCharacterStrategy: ChunkingStrategy = (text: string): Promise<Chunk[]> =>
  Promise.resolve(splitText(text).map((content) => ({ content })));
