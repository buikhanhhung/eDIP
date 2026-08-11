import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';
import { linkDocumentEntities } from '../src/features/graph/entity-linker';

/**
 * Seeds the demo corpus carried over from eDIP v1, including the analysis v1
 * already produced: document type, metadata, summary and 59 entities.
 *
 * Re-deriving that analysis with Bedrock would cost nine LLM round trips to
 * reproduce data already on disk, and would leave the dashboard, the knowledge
 * graph and source highlighting empty until the ingestion pipeline runs. Seeded
 * this way, those three features work from `db seed` alone — no AWS required.
 *
 * Entity character offsets are computed here with indexOf rather than taken
 * from the source data (v1 stores none) or asked of an LLM. The stored mention
 * is verbatim, so indexOf is exact, and it is the same routine the ingestion
 * pipeline uses for freshly uploaded files.
 */

interface V1Entity {
  kind: string;
  value: string;
  confidence?: number;
}

interface V1Record {
  id: string;
  text: string;
  textSource: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  status: string;
  analysis: {
    type: string;
    typeConfidence: number;
    metadata: {
      title?: string;
      parties?: string[];
      documentDate?: string | null;
      amount?: string | number | null;
      currency?: string | null;
      keywords?: string[];
      language?: string;
    };
    summary: string;
    tags?: string[];
    entities: V1Entity[];
  } | null;
}

// Prisma 7 requires a driver adapter; a bare `new PrismaClient()` throws.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: `${process.env.DATABASE_URL}` }),
});

const TEXT_SOURCES = ['native', 'pdf_text', 'docx', 'vision'] as const;
type TextSource = (typeof TEXT_SOURCES)[number];

function toTextSource(raw: string): TextSource {
  return (TEXT_SOURCES as readonly string[]).includes(raw) ? (raw as TextSource) : 'native';
}

/** "1500000" + "USD" -> "1500000 USD". Kept as text: VND and USD both appear. */
function formatAmount(amount: unknown, currency: unknown): string | null {
  if (amount === null || amount === undefined || amount === '') return null;
  return currency ? `${amount} ${currency}` : String(amount);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required to seed. Set it in .env — seed passwords are never hard-coded.`,
    );
  }
  return value;
}

async function main() {
  const corpusPath = path.join(__dirname, 'seed-data', 'v1-corpus.json');
  const records: V1Record[] = JSON.parse(readFileSync(corpusPath, 'utf8'));

  // ---- Users -------------------------------------------------------------
  // One account per role. The viewer needs a real login like the others: the
  // API refuses every route without a token, so there is no anonymous
  // read-only mode standing in for that role.
  const [adminHash, userHash, viewerHash] = await Promise.all([
    bcrypt.hash(requireEnv('SEED_ADMIN_PASSWORD'), 10),
    bcrypt.hash(requireEnv('SEED_USER_PASSWORD'), 10),
    bcrypt.hash(requireEnv('SEED_VIEWER_PASSWORD'), 10),
  ]);

  const admin = await prisma.user.upsert({
    where: { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@ecloudvalley.demo' },
    update: { passwordHash: adminHash, role: 'admin' },
    create: {
      email: process.env.SEED_ADMIN_EMAIL ?? 'admin@ecloudvalley.demo',
      passwordHash: adminHash,
      role: 'admin',
    },
  });

  await prisma.user.upsert({
    where: { email: process.env.SEED_USER_EMAIL ?? 'user@ecloudvalley.demo' },
    update: { passwordHash: userHash, role: 'user' },
    create: {
      email: process.env.SEED_USER_EMAIL ?? 'user@ecloudvalley.demo',
      passwordHash: userHash,
      role: 'user',
    },
  });

  await prisma.user.upsert({
    where: { email: process.env.SEED_VIEWER_EMAIL ?? 'viewer@ecloudvalley.demo' },
    update: { passwordHash: viewerHash, role: 'viewer' },
    create: {
      email: process.env.SEED_VIEWER_EMAIL ?? 'viewer@ecloudvalley.demo',
      passwordHash: viewerHash,
      role: 'viewer',
    },
  });

  // ---- Documents ---------------------------------------------------------
  let entityLinks = 0;

  for (const record of records) {
    const analysis = record.analysis;
    const metadata: Prisma.InputJsonValue = {
      parties: analysis?.metadata.parties ?? [],
      date: analysis?.metadata.documentDate ?? null,
      amount: formatAmount(analysis?.metadata.amount, analysis?.metadata.currency),
      keywords: analysis?.metadata.keywords ?? [],
      tags: analysis?.tags ?? [],
    };

    await prisma.document.upsert({
      where: { id: record.id },
      update: {},
      create: {
        id: record.id,
        filename: record.fileName,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
        storagePath: path.posix.join('storage', `${record.id}.md`),
        ownerId: admin.id,
        status: 'completed',
        documentType: analysis?.type ?? null,
        typeConfidence: analysis?.typeConfidence ?? null,
        language: analysis?.metadata.language ?? null,
        title: analysis?.metadata.title ?? null,
        summary: analysis?.summary ?? null,
        textContent: record.text,
        textSource: toTextSource(record.textSource),
        metadata,
        uploadedAt: new Date(record.uploadedAt),
        processedAt: new Date(record.uploadedAt),
      },
    });

    // Same routine the ingestion pipeline runs on a freshly uploaded file, so
    // seeded and uploaded documents carry identical entity data.
    const { linked } = await linkDocumentEntities(
      prisma,
      record.id,
      record.text,
      (analysis?.entities ?? []).map((raw) => ({
        type: raw.kind,
        value: raw.value,
        confidence: raw.confidence,
      })),
    );
    entityLinks += linked;
  }

  // ---- One document that genuinely failed extraction ---------------------
  // seed/fixtures/corrupt.pdf from v1 is a real broken PDF, not a row flipped
  // to 'failed' by hand. The dashboard needs a red counter and the library
  // needs an error state, and both should reflect something true.
  await prisma.document.upsert({
    where: { id: 'seed-failed-corrupt-pdf' },
    update: {},
    create: {
      id: 'seed-failed-corrupt-pdf',
      filename: 'corrupt.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      storagePath: path.posix.join('storage', 'corrupt.pdf'),
      ownerId: admin.id,
      status: 'failed',
      error: 'PDF parse failed: file is not a valid PDF document',
      uploadedAt: new Date(),
    },
  });

  const [users, documents, entities, links, withOffsets, typed] = await Promise.all([
    prisma.user.count(),
    prisma.document.count(),
    prisma.entity.count(),
    prisma.documentEntity.count(),
    prisma.documentEntity.count({ where: { charStart: { not: null } } }),
    prisma.document.count({ where: { documentType: { not: null } } }),
  ]);

  console.log(
    [
      `users            ${users}`,
      `documents        ${documents} (${typed} typed, ${documents - typed} untyped/failed)`,
      `entities         ${entities} distinct (from ${entityLinks} mentions)`,
      `document-entity  ${links} links, ${withOffsets} with char offsets`,
    ].join('\n'),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
