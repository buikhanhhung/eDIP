import type { Prisma } from '@prisma/client';
import { IngestionService } from './ingestion.service';

/**
 * The upload path with its three collaborators stubbed. What is under test is
 * only what gets written to the `Document` row — the storage write, the
 * duplicate query and the queue push are someone else's specs.
 */
function serviceWithStubs() {
  const create = jest.fn(
    (args: { data: Prisma.DocumentCreateInput }): Promise<Record<string, unknown>> =>
      Promise.resolve({
        id: 'doc-1',
        filename: args.data.filename,
        status: args.data.status,
        uploadedAt: new Date('2026-08-21T03:00:00.000Z'),
      }),
  );
  const prisma = { document: { findMany: jest.fn().mockResolvedValue([]), create } };
  const storage = { save: jest.fn().mockResolvedValue('2026/08/hop-dong.txt') };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };

  const service = new IngestionService(prisma as never, storage as never, queue as never);
  return { service, create };
}

const file = () => ({
  originalname: 'hop-dong.txt',
  buffer: Buffer.from('HỢP ĐỒNG DỊCH VỤ'),
  size: 16,
});

describe('IngestionService.upload chunking strategy', () => {
  it('records the default when the caller names none', async () => {
    const { service, create } = serviceWithStubs();

    await service.upload(file(), 'owner-1');

    expect(create.mock.calls[0][0].data.chunkingStrategy).toBe('RECURSIVE_CHARACTER');
  });

  it('records the strategy the caller chose', async () => {
    const { service, create } = serviceWithStubs();

    await service.upload(file(), 'owner-1', 'upload', 'RECURSIVE_CHARACTER');

    expect(create.mock.calls[0][0].data.chunkingStrategy).toBe('RECURSIVE_CHARACTER');
  });

  /**
   * Drive import calls this with three arguments and must keep working
   * untouched, which is the whole reason the new parameter sits last.
   */
  it('leaves a three-argument caller on the default', async () => {
    const { service, create } = serviceWithStubs();

    await service.upload(file(), 'owner-1', 'google_drive');

    expect(create.mock.calls[0][0].data.source).toBe('google_drive');
    expect(create.mock.calls[0][0].data.chunkingStrategy).toBe('RECURSIVE_CHARACTER');
  });
});
