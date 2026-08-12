import { NER_TOOL_NAME, VERIFY_TOOL_NAME } from '@features/ingestion/schemas/graph-extraction.schema';
import { TokenMeterService } from './token-meter.service';

/**
 * The purpose map keys are string literals rather than imports, because the
 * infrastructure layer must not depend on a feature module. This spec is where
 * the two are held together: renaming a tool without updating the map fails
 * here instead of quietly filing its spend under the wrong heading.
 */
describe('TokenMeterService.purposeForTool', () => {
  const meter = new TokenMeterService({} as never);

  it('files both entity tools under entities', () => {
    expect(meter.purposeForTool(NER_TOOL_NAME)).toBe('entities');
    expect(meter.purposeForTool(VERIFY_TOOL_NAME)).toBe('entities');
  });

  it('files document analysis under analysis', () => {
    expect(meter.purposeForTool('record_document_analysis')).toBe('analysis');
  });

  it('files an unknown tool somewhere rather than dropping it', () => {
    const warn = jest.spyOn(meter['logger'], 'warn').mockImplementation();

    expect(meter.purposeForTool('a_tool_nobody_mapped')).toBe('analysis');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('a_tool_nobody_mapped'));

    warn.mockRestore();
  });
});
