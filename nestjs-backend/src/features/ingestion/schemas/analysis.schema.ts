import { z } from 'zod';
import { ENTITY_TYPES } from '@features/graph/entity-normalizer';

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
 * Character offsets are deliberately absent. Asking the model for them costs
 * tokens and latency for numbers that are recomputed server-side with
 * `indexOf` anyway — and offset arithmetic over multi-byte Vietnamese is among
 * the things a language model is worst at. The mention text must be verbatim;
 * the position is derived from it.
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
  entities: z.array(
    z.object({
      type: z.enum(ENTITY_TYPES),
      text: z.string().min(1),
    }),
  ),
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
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: [...ENTITY_TYPES] },
          text: {
            type: 'string',
            description: 'Copied verbatim from the document, character for character',
          },
        },
        required: ['type', 'text'],
      },
    },
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
    'entities',
  ],
};
