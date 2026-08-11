import { ANALYSIS_TOOL_SCHEMA } from '@features/ingestion/schemas/analysis.schema';
import { VERIFY_TOOL_SCHEMA } from '@features/ingestion/schemas/graph-extraction.schema';
import { toGeminiSchema } from './gemini-client';

/** Recursively collects every key name appearing anywhere in the structure. */
function keysAnywhere(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) keysAnywhere(item, found);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      found.add(key);
      keysAnywhere(child, found);
    }
  }
  return found;
}

describe('toGeminiSchema', () => {
  // The two providers disagree about the same schema: OpenAI's strict mode
  // requires additionalProperties, Gemini rejects it. One schema is kept,
  // written for the stricter reader, and trimmed for this one.
  it.each([
    ['analysis', ANALYSIS_TOOL_SCHEMA],
    ['verify relations', VERIFY_TOOL_SCHEMA],
  ])('removes additionalProperties at every depth of the %s schema', (_name, schema) => {
    expect(keysAnywhere(schema).has('additionalProperties')).toBe(true);
    expect(keysAnywhere(toGeminiSchema(schema)).has('additionalProperties')).toBe(false);
  });

  it('keeps everything the model still needs', () => {
    const trimmed = keysAnywhere(toGeminiSchema(VERIFY_TOOL_SCHEMA));
    for (const key of ['type', 'properties', 'required', 'items', 'enum', 'description']) {
      expect(trimmed.has(key)).toBe(true);
    }
  });

  it('leaves the original untouched', () => {
    const before = JSON.stringify(ANALYSIS_TOOL_SCHEMA);
    toGeminiSchema(ANALYSIS_TOOL_SCHEMA);
    expect(JSON.stringify(ANALYSIS_TOOL_SCHEMA)).toBe(before);
  });

  it('passes through primitives and arrays unchanged', () => {
    expect(toGeminiSchema('string')).toBe('string');
    expect(toGeminiSchema(null)).toBeNull();
    expect(toGeminiSchema([{ additionalProperties: false, type: 'object' }])).toEqual([
      { type: 'object' },
    ]);
  });
});
