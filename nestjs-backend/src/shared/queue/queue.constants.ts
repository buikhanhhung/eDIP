export const QUEUE_NAMES = {
  DOCUMENT_INGEST: 'document-ingest',
} as const;

export const INGEST_JOB = 'ingest';

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
