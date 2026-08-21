import { ChunkingService, IMPLEMENTED_CHUNKING_STRATEGIES } from './chunking.service';
import { CHUNKING_STRATEGIES } from './chunking.types';

describe('ChunkingService', () => {
  const service = new ChunkingService();

  it('names the strategy it cannot serve instead of falling back quietly', async () => {
    await expect(service.split('bất kỳ', 'SEMANTIC')).rejects.toThrow(/SEMANTIC/);
  });

  /**
   * A strategy reaches the dropdown by being listed in `CHUNKING_STRATEGIES`
   * and reaches the pipeline by being registered. Those are two edits, and a
   * value offered but not registered would fail only at upload time — so the
   * gap is asserted here, where it costs a red test instead of a failed job.
   */
  it('offers exactly the strategies it has registered', () => {
    expect(IMPLEMENTED_CHUNKING_STRATEGIES).toEqual(['RECURSIVE_CHARACTER']);
  });

  /**
   * The API validates against the exported list while the pipeline dispatches
   * through `supports()`. If those two ever disagree, an upload is accepted for
   * a strategy that cannot run it — so they are asserted against each other
   * rather than each against a hard-coded answer.
   */
  it('advertises the same set it can dispatch', () => {
    const dispatchable = CHUNKING_STRATEGIES.filter((id) => service.supports(id));
    expect(dispatchable).toEqual(IMPLEMENTED_CHUNKING_STRATEGIES);
  });
});
