/**
 * The whole entity-dedup mechanism.
 *
 * Two mentions collapse into one graph node when they normalise to the same
 * string. At demo scale (tens of documents, tens of entities) string folding is
 * enough — embedding-based dedup, which ECVBot uses, costs an API round trip
 * per entity and buys nothing here.
 *
 * Only legal-form suffixes are stripped, never content words: dropping "Ltd"
 * merges `Ecloudvalley Vietnam Ltd` with `ECLOUDVALLEY VIETNAM`, while dropping
 * a content word would merge two genuinely different companies.
 */
const LEGAL_SUFFIXES =
  /\b(ltd|limited|jsc|joint stock company|co|corp|corporation|inc|company|cong ty|tnhh|cp|pte|llc|gmbh)\b/g;

export function normalizeEntityName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[.,;:'"()]/g, ' ')
    .replace(LEGAL_SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * v1 stores entity kinds; this is the closed set the rest of the system knows.
 * `department` is included because the seed corpus carries seven of them —
 * dropping it would silently lose those nodes.
 */
export const ENTITY_TYPES = [
  'company',
  'person',
  'project',
  'contract',
  'invoice',
  'department',
  'date',
  'amount',
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

/** Kinds that make useful graph nodes. Dates and amounts are metadata. */
export const GRAPH_ENTITY_TYPES: readonly EntityType[] = [
  'company',
  'person',
  'project',
  'contract',
  'invoice',
  'department',
];

export function isEntityType(value: string): value is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(value);
}

/** Unknown kinds are kept rather than dropped, bucketed as `project`. */
export function coerceEntityType(value: string): EntityType {
  return isEntityType(value) ? value : 'project';
}
