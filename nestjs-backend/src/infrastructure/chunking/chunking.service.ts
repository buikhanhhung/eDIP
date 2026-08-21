import { Injectable } from '@nestjs/common';
import type { Chunk, ChunkingStrategy, ChunkingStrategyId } from './chunking.types';
import { parentChildMarkdownStrategy } from './parent-child-markdown.strategy';
import { recursiveCharacterStrategy } from './recursive-character.strategy';

/**
 * A flat lookup from strategy id to implementation.
 *
 * Deliberately not a strategy-pattern factory: the abstraction ECVBot builds
 * for this — an interface, a base class, a registry service and a module per
 * strategy — costs 13 files to answer a question a `Record` answers. What is
 * wanted here is the list of strategies, not a layer between the caller and it.
 */
const STRATEGIES: Partial<Record<ChunkingStrategyId, ChunkingStrategy>> = {
  RECURSIVE_CHARACTER: recursiveCharacterStrategy,
  PARENT_CHILD_MARKDOWN: parentChildMarkdownStrategy,
};

/**
 * The strategies that exist right now, as opposed to the four the column can
 * hold. Exported so the upload endpoint can refuse a strategy nobody has
 * written yet at the door, instead of accepting the file and failing its job.
 */
export const IMPLEMENTED_CHUNKING_STRATEGIES = Object.entries(STRATEGIES)
  // Filtered on the value, not just the key: a registry entry that resolves to
  // `undefined` — a strategy put behind a config flag, say — would otherwise be
  // offered by the API and then throw in `split()`, which is the failure the
  // rejection at the door exists to prevent.
  .filter(([, implementation]) => implementation !== undefined)
  .map(([id]) => id as ChunkingStrategyId);

@Injectable()
export class ChunkingService {
  supports(strategy: ChunkingStrategyId): boolean {
    return STRATEGIES[strategy] !== undefined;
  }

  /**
   * Throws for a strategy that is listed but not yet implemented. Falling back
   * to the default instead would store chunks under a `chunking_strategy` that
   * never produced them, which is worse than a failed job: it is a failed job
   * that looks like a successful one.
   */
  async split(text: string, strategy: ChunkingStrategyId): Promise<Chunk[]> {
    const implementation = STRATEGIES[strategy];
    if (!implementation) {
      const available = IMPLEMENTED_CHUNKING_STRATEGIES.join(', ');
      throw new Error(`Chunking strategy ${strategy} is not implemented (available: ${available})`);
    }
    return implementation(text);
  }
}
