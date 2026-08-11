import { z } from 'zod';

export const DOCUMENT_TYPES = [
  'contract',
  'invoice',
  'report',
  'policy',
  'kyc',
  'other',
] as const;

/**
 * The analysis contract, in one place: this schema is both the JSON Schema sent
 * to Claude as a tool definition and the parser applied to what comes back.
 *
 * Document-level only. Entities used to be extracted here too; they moved to
 * the chunk-level two-pass pipeline in `entity-extraction.service.ts`, which
 * also produces the typed relations between them. Keeping both would mean
 * paying twice for the same extraction and then reconciling two answers.
 */
export const analysisSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  typeConfidence: z.number().min(0).max(1),
  language: z.string(),
  title: z.string(),
  summary: z.string(),
  parties: z.array(z.string()),
  date: z.string().nullable(),
  amount: z.string().nullable(),
  keywords: z.array(z.string()),
});

export type DocumentAnalysis = z.infer<typeof analysisSchema>;

/** The same shape as JSON Schema, for the Bedrock tool definition. */
export const ANALYSIS_TOOL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    documentType: { type: 'string', enum: [...DOCUMENT_TYPES] },
    typeConfidence: { type: 'number', minimum: 0, maximum: 1 },
    language: { type: 'string', description: 'ISO code of the dominant language, e.g. vi or en' },
    title: { type: 'string', description: 'Title as written in the document' },
    summary: { type: 'string', description: 'Two or three sentences, in the document language' },
    parties: { type: 'array', items: { type: 'string' } },
    date: { type: ['string', 'null'], description: 'Main document date, ISO 8601, null if absent' },
    amount: { type: ['string', 'null'], description: 'Main amount with currency, null if absent' },
    keywords: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'documentType',
    'typeConfidence',
    'language',
    'title',
    'summary',
    'parties',
    'date',
    'amount',
    'keywords',
  ],
};
