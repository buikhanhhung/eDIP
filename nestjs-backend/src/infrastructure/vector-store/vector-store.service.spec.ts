import { VectorStoreService } from './vector-store.service';

/**
 * The first spec this file has had, and it exists for one reason: the INSERT is
 * raw SQL with positional parameters, so adding a column means renumbering
 * every parameter after it. A transposed pair binds a document id to a chunk
 * index and Postgres accepts it happily.
 *
 * Prisma is stubbed rather than reached: what needs witnessing is the statement
 * and the order of its bindings, and that is fully determined here. Whether the
 * columns survive a round trip is checked against the real database at the end
 * of the phase, which a mock could never prove anyway.
 */
interface RawCall {
  sql: string;
  args: unknown[];
}

function serviceWithStub() {
  // Calls are recorded into a typed array rather than read back off the mock,
  // whose `mock.calls` is `any[]` and would make every assertion below unsafe.
  const calls: RawCall[] = [];
  const executeRawUnsafe = (sql: string, ...args: unknown[]) => {
    calls.push({ sql, args });
    return Promise.resolve(0);
  };
  const service = new VectorStoreService({ $executeRawUnsafe: executeRawUnsafe } as never);
  jest.spyOn(service['logger'], 'log').mockImplementation();
  return { service, calls };
}

/** The INSERT call, ignoring the DELETE that purges first. */
function insertCall(calls: RawCall[]): RawCall {
  const call = calls.find((entry) => entry.sql.includes('INSERT INTO embedding_chunks'));
  if (!call) throw new Error('no INSERT was issued');
  return call;
}

const chunk = (overrides: Record<string, unknown> = {}) => ({
  documentId: 'doc-1',
  content: 'con',
  chunkingStrategy: 'PARENT_CHILD_MARKDOWN',
  chunkIndex: 0,
  ...overrides,
});

describe('VectorStoreService.replaceChunks', () => {
  it('purges before inserting, so a retried job replaces instead of doubling', async () => {
    const { service, calls } = serviceWithStub();

    await service.replaceChunks('doc-1', [chunk()]);

    expect(calls[0].sql).toContain('DELETE FROM embedding_chunks');
    expect(calls[1].sql).toContain('INSERT INTO embedding_chunks');
  });

  it('binds every column in the order the statement declares them', async () => {
    const { service, calls } = serviceWithStub();

    await service.replaceChunks('doc-1', [
      chunk({
        content: 'đoạn con',
        parentContent: 'đoạn cha, dài hơn',
        metadata: { sectionHeader: 'MỤC 1', level: 1 },
        chunkIndex: 3,
      }),
    ]);

    const { sql, args } = insertCall(calls);
    const columns = /INSERT INTO embedding_chunks \(([^)]+)\)/.exec(sql)?.[1] ?? '';
    const placeholders = /VALUES \(([^)]+)\)/.exec(sql)?.[1] ?? '';

    // Asserted explicitly, because the column list and the argument list are
    // both written by hand and agree with each other even when the VALUES
    // clause does not: `($1, $2, $4, $3, ...)` binds the strategy into
    // parent_content while every other assertion here still passes.
    expect(placeholders.split(',').map((p) => p.trim())).toEqual([
      '$1',
      '$2',
      '$3',
      '$4',
      '$5',
      '$6::jsonb',
      '$7::vector',
    ]);

    // The column list and the argument list are asserted against each other:
    // that is the pairing a renumbering mistake breaks.
    expect(columns.split(',').map((c) => c.trim())).toEqual([
      'document_id',
      'content',
      'parent_content',
      'chunking_strategy',
      'chunk_index',
      'metadata',
      'embedding',
    ]);
    expect(args).toEqual([
      'doc-1',
      'đoạn con',
      'đoạn cha, dài hơn',
      'PARENT_CHILD_MARKDOWN',
      3,
      JSON.stringify({ sectionHeader: 'MỤC 1', level: 1 }),
      null,
    ]);
  });

  it('writes null for a parent and metadata the strategy did not set', async () => {
    const { service, calls } = serviceWithStub();

    await service.replaceChunks('doc-1', [chunk({ chunkingStrategy: 'RECURSIVE_CHARACTER' })]);

    const { args } = insertCall(calls);
    // Positions 2 and 5: the flat strategies leave both empty, and the read
    // side depends on parent_content being NULL rather than an empty string —
    // COALESCE would happily return ''.
    expect(args[2]).toBeNull();
    expect(args[5]).toBeNull();
  });

  it('still purges when handed nothing, and issues no INSERT', async () => {
    const { service, calls } = serviceWithStub();

    await service.replaceChunks('doc-1', []);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('DELETE');
  });
});
