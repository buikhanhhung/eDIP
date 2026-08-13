export const QUEUE_NAMES = {
  DOCUMENT_INGEST: 'document-ingest',
  DRIVE_IMPORT: 'drive-import',
} as const;

export const INGEST_JOB = 'ingest';

export const DRIVE_IMPORT_JOB = 'drive-import';

/**
 * Fetching one file out of Drive, so a folder of ninety does not have to happen
 * inside the request that asked for it.
 *
 * Fewer attempts than an ingest: the failures here are Drive saying no — a file
 * unshared this morning, a revoked token — and repeating the question three
 * times does not change the answer. One retry covers the transient case.
 */
export const DRIVE_IMPORT_JOB_OPTIONS = {
  attempts: 2,
  backoff: { type: 'exponential', delay: 3000 },
  removeOnComplete: 100,
  removeOnFail: 200,
} as const;

/**
 * Declared here rather than at each call site.
 *
 * BullMQ defaults to `attempts: 1`, so a queue without this loses the retry
 * behaviour the pipeline is designed around the moment someone adds a job
 * without repeating the options.
 */
export const INGEST_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 50,
  removeOnFail: 100,
} as const;
