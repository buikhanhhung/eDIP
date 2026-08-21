import { IMPLEMENTED_CHUNKING_STRATEGIES } from '@infrastructure/chunking/chunking.service';
import {
  DEFAULT_CHUNKING_STRATEGY,
  type ChunkingStrategyId,
} from '@infrastructure/chunking/chunking.types';

/**
 * Resolves a strategy from an untrusted source: a multipart field on the way
 * in, or the stored column on the way back out.
 *
 * Three outcomes, and the middle one is the reason this returns a union rather
 * than throwing. Absent — no field, or the empty string a browser sends for an
 * untouched control — is "no preference" and yields the default. A supplied
 * value that is not an implemented strategy yields `null`, and the caller
 * decides what that means: the upload endpoint refuses it, while the worker and
 * the backfill script fall back and log, because a stored row cannot be argued
 * with.
 */
export function parseChunkingStrategy(raw: unknown): ChunkingStrategyId | null {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_CHUNKING_STRATEGY;
  if (typeof raw !== 'string') return null;

  // Checked against what is implemented rather than the four ids the column
  // accepts: the other three are a promise about later phases, not an offer.
  return IMPLEMENTED_CHUNKING_STRATEGIES.find((id) => id === raw) ?? null;
}

/** The values an uploader may send today, for an error message worth reading. */
export function acceptedChunkingStrategies(): string {
  return IMPLEMENTED_CHUNKING_STRATEGIES.join(', ');
}
