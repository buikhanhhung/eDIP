import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { hashContent } from '@features/ingestion/duplicate-check';
import 'dotenv/config';

/**
 * Hashes documents stored before the column existed.
 *
 * Without this the duplicate check is blind to everything already in the
 * library: a re-upload of an old document would compare against a null and be
 * waved through, which is the failure the check exists to prevent.
 *
 * A document whose file has gone missing is left with a null hash and
 * reported. That is the honest state — the bytes cannot be hashed if they are
 * not there — and it never blocks an upload, only fails to catch one.
 */
async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: `${process.env.DATABASE_URL}` }),
  });
  const storageDir = path.resolve(__dirname, '..', 'storage');

  const documents = await prisma.document.findMany({
    where: { contentHash: null },
    select: { id: true, filename: true, storagePath: true },
  });
  console.log(`${documents.length} document(s) without a hash`);

  let hashed = 0;
  const missing: string[] = [];

  for (const document of documents) {
    try {
      const bytes = await readFile(path.join(storageDir, path.basename(document.storagePath)));
      await prisma.document.update({
        where: { id: document.id },
        data: { contentHash: hashContent(bytes) },
      });
      hashed += 1;
    } catch {
      missing.push(document.filename);
    }
  }

  console.log(`hashed ${hashed}`);
  if (missing.length > 0) {
    console.log(`file missing for ${missing.length}: ${missing.join(', ')}`);
  }

  const duplicates = await prisma.$queryRaw<{ contentHash: string; count: bigint }[]>`
    SELECT "contentHash", COUNT(*) AS count
    FROM "Document"
    WHERE "contentHash" IS NOT NULL
    GROUP BY "contentHash"
    HAVING COUNT(*) > 1
  `;
  console.log(`${duplicates.length} set(s) of identical files already in the library`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
