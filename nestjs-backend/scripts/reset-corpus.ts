import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { FalkorDB } from 'falkordb';
import 'dotenv/config';

/**
 * Clears every document from all three stores so a corpus can be rebuilt by
 * uploading through the real ingest pipeline.
 *
 * The seed loads eDIP v1's pre-computed analysis straight into Postgres, which
 * is fine for a skeleton but means those documents never ran through
 * classification, chunking, embedding or entity extraction — so the knowledge
 * graph had mentions and no relations. Re-uploading them fixes that, and this
 * script clears the way.
 *
 * Users and their roles are left alone: the point is to rebuild the corpus, not
 * to lock everyone out of it.
 */
async function main() {
  // Prisma 7 requires a driver adapter; a bare `new PrismaClient()` throws.
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: `${process.env.DATABASE_URL}` }),
  });
  const storageDir = path.resolve(__dirname, '..', 'storage');

  const chunks = await prisma.$executeRawUnsafe('DELETE FROM embedding_chunks');
  const documents = await prisma.document.deleteMany({});
  const audit = await prisma.auditLog.deleteMany({});
  console.log(
    `postgres: ${documents.count} documents, ${chunks} chunks, ${audit.count} audit entries`,
  );

  const falkor = await FalkorDB.connect({
    socket: {
      host: process.env.FALKORDB_HOST ?? 'localhost',
      port: Number(process.env.FALKORDB_PORT ?? 6384),
    },
  });
  const graphName = process.env.FALKORDB_GRAPH ?? 'edip';
  // Dropping the graph takes its indexes with it; the app rebuilds them when
  // it next boots.
  try {
    await (await falkor.selectGraph(graphName)).delete();
    console.log(`falkordb: dropped graph "${graphName}"`);
  } catch (error) {
    // A missing graph is the state we were aiming for anyway.
    if (!/key doesn't contain a graph|empty key/i.test((error as Error).message)) throw error;
    console.log(`falkordb: graph "${graphName}" was already absent`);
  }
  await falkor.close();

  let removed = 0;
  for (const entry of await readdir(storageDir).catch(() => [])) {
    if (entry === '.gitkeep') continue;
    await rm(path.join(storageDir, entry), { recursive: true, force: true });
    removed += 1;
  }
  console.log(`storage: removed ${removed} files`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
