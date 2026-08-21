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
    expect(IMPLEMENTED_CHUNKING_STRATEGIES).toEqual([
      'RECURSIVE_CHARACTER',
      'PARENT_CHILD_MARKDOWN',
      'DOCUMENT_STRUCTURE',
    ]);
  });

  /**
   * The API validates against the exported list while the pipeline dispatches
   * through `supports()`. If those two ever disagree, an upload is accepted for
   * a strategy that cannot run it — so they are asserted against each other
   * rather than each against a hard-coded answer.
   */
  it('advertises the same set it can dispatch', () => {
    const dispatchable = CHUNKING_STRATEGIES.filter((id) => service.supports(id));
    // Compared as sorted sets: the two sides are built from different orders —
    // the declared id list and the registry's insertion order — and reordering
    // the registry is not a defect worth a red test.
    expect([...dispatchable].sort()).toEqual([...IMPLEMENTED_CHUNKING_STRATEGIES].sort());
  });

  /**
   * Every strategy is reached here at least once, through the registry rather
   * than by importing it. Without this, a registry wired to the wrong function —
   * or to one carrying test-only options — passes the whole suite.
   */
  it('dispatches each registered strategy to the implementation that owns it', async () => {
    const markdown = '# Điều 1\n\nBên A thanh toán trong 30 ngày.';

    const recursive = await service.split(markdown, 'RECURSIVE_CHARACTER');
    expect(recursive[0].metadata).toBeUndefined();

    const parentChild = await service.split(markdown, 'PARENT_CHILD_MARKDOWN');
    expect(parentChild[0].metadata?.chunkingStrategy).toBe('PARENT_CHILD_MARKDOWN');

    const documentStructure = await service.split(markdown, 'DOCUMENT_STRUCTURE');
    expect(documentStructure[0].metadata?.chunkingStrategy).toBe('DOCUMENT_STRUCTURE');
    // At the default size this section is one whole chunk, which is what says
    // the registered strategy runs on defaults and not on a test size.
    expect(documentStructure).toHaveLength(1);
    expect(documentStructure[0].metadata?.isSubChunk).toBe(false);
  });
});
