import type { PrismaClient } from '@prisma/client';
import { coerceEntityType, normalizeEntityName } from './entity-normalizer';

export interface EntityMention {
  /** Kind as produced by the model or carried over from v1. */
  type: string;
  /** Must appear verbatim in the document text for an offset to be recorded. */
  value: string;
  confidence?: number | null;
}

/**
 * Upserts entities and links them to a document, recording where each mention
 * sits in the text.
 *
 * Offsets come from `indexOf` on the stored text, never from the model. The
 * mention is required to be verbatim, so this is exact when it matches; when it
 * does not, the link is still written but without an offset. Dropping the
 * entity instead would lose a real fact because highlighting could not be
 * placed — the graph does not need offsets, only the highlighter does.
 *
 * Shared by the seed script and the ingestion pipeline so both produce the same
 * shape of data.
 */
export async function linkDocumentEntities(
  prisma: PrismaClient,
  documentId: string,
  text: string,
  mentions: EntityMention[],
): Promise<{ linked: number; withOffset: number }> {
  let linked = 0;
  let withOffset = 0;

  for (const mention of mentions) {
    const normalizedName = normalizeEntityName(mention.value);
    if (!normalizedName) continue;

    const type = coerceEntityType(mention.type);
    const entity = await prisma.entity.upsert({
      where: { type_normalizedName: { type, normalizedName } },
      update: {},
      create: { type, normalizedName, displayName: mention.value },
    });

    const charStart = text.indexOf(mention.value);
    if (charStart >= 0) withOffset += 1;

    await prisma.documentEntity.upsert({
      where: {
        documentId_entityId_mentionText: {
          documentId,
          entityId: entity.id,
          mentionText: mention.value,
        },
      },
      update: {},
      create: {
        documentId,
        entityId: entity.id,
        mentionText: mention.value,
        charStart: charStart >= 0 ? charStart : null,
        charEnd: charStart >= 0 ? charStart + mention.value.length : null,
        confidence: mention.confidence ?? null,
      },
    });
    linked += 1;
  }

  return { linked, withOffset };
}
