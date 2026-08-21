import { ChunkingService } from './chunking.service';
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
    const registered = CHUNKING_STRATEGIES.filter((id) => service.supports(id));
    expect(registered).toEqual(['RECURSIVE_CHARACTER']);
  });
});
