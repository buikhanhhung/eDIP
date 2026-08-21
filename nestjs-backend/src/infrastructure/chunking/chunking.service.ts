import { Injectable } from '@nestjs/common';
import type { Chunk, ChunkingStrategy, ChunkingStrategyId } from './chunking.types';
import { recursiveCharacterStrategy } from './recursive-character.strategy';

/**
 * A flat lookup from strategy id to implementation.
 *
 * Deliberately not a strategy-pattern factory: the abstraction ECVBot builds
 * for this — an interface, a base class, a registry service and a module per
 * strategy — costs 13 files to answer a question a `Record` answers. What is
 * wanted here is the list of strategies, not a layer between the caller and it.
 */
@Injectable()
export class ChunkingService {
  private readonly strategies: Partial<Record<ChunkingStrategyId, ChunkingStrategy>> = {
    RECURSIVE_CHARACTER: recursiveCharacterStrategy,
  };

  supports(strategy: ChunkingStrategyId): boolean {
    return this.strategies[strategy] !== undefined;
  }

  /**
   * Throws for a strategy that is listed but not yet implemented. Falling back
   * to the default instead would store chunks under a `chunking_strategy` that
   * never produced them, which is worse than a failed job: it is a failed job
   * that looks like a successful one.
   */
  async split(text: string, strategy: ChunkingStrategyId): Promise<Chunk[]> {
    const implementation = this.strategies[strategy];
    if (!implementation) {
      const available = Object.keys(this.strategies).join(', ');
      throw new Error(`Chunking strategy ${strategy} is not implemented (available: ${available})`);
    }
    return implementation(text);
  }
}
