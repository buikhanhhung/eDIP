import { createHash } from 'node:crypto';

/**
 * Two different questions, deliberately answered differently.
 *
 * Identical bytes are a re-upload: there is nothing to gain by processing them
 * again, and on a rate-limited key the second run costs the same quota as the
 * first for a document already in the library. That one is refused.
 *
 * The same name with different bytes is a *new version* — the contract came
 * back signed, the report was revised. Refusing it would lose the revision, so
 * it is accepted and the earlier file is named in the reply, which is the
 * signal a reader actually wants.
 */

export interface DuplicateMatch {
  id: string;
  filename: string;
  uploadedAt: Date;
}

export interface DuplicateVerdict {
  /** Same bytes already stored. The upload should be refused. */
  identical: DuplicateMatch | null;
  /** Same name, different bytes. The upload proceeds; the UI mentions these. */
  sameName: DuplicateMatch[];
}

/** SHA-256, hex. Collisions are not a concern at any corpus size. */
export function hashContent(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function decideDuplicate(
  hash: string,
  existing: (DuplicateMatch & { contentHash: string | null })[],
): DuplicateVerdict {
  const identical = existing.find((document) => document.contentHash === hash) ?? null;

  return {
    identical: identical ? strip(identical) : null,
    // Only reported when the bytes differ; an identical file is already
    // covered by the verdict above and would just say the same thing twice.
    sameName: identical ? [] : existing.map(strip),
  };
}

function strip(match: DuplicateMatch): DuplicateMatch {
  return { id: match.id, filename: match.filename, uploadedAt: match.uploadedAt };
}
