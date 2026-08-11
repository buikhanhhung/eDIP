import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';
import { FalkorDB } from 'falkordb';
import { coerceEntityType, normalizeEntityName } from '../src/features/graph/entity-normalizer';

/**
 * Seeds the demo corpus carried over from eDIP v1, including the analysis v1
 * already produced: document type, metadata, summary and 59 entities.
 *
 * Re-deriving that analysis with Bedrock would cost nine LLM round trips to
 * reproduce data already on disk, and would leave the dashboard, the knowledge
 * graph and source highlighting empty until the ingestion pipeline runs. Seeded
 * this way, those three features work from `db seed` alone — no AWS required.
 *
 * Documents go to Postgres, entities and mentions go to FalkorDB. They have no
 * Postgres table, so **FalkorDB must be running** for this script to finish:
 *
 *   docker compose -f docker-compose.dev.yml up -d falkordb
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

  // ---- Graph ---------------------------------------------------------------
  // Dropped and rebuilt: the graph holds no fact Postgres does not, so a full
  // rebuild costs nothing and removes every kind of drift at once.
  const falkor = await FalkorDB.connect({
    socket: {
      host: process.env.FALKORDB_HOST ?? 'localhost',
      port: Number(process.env.FALKORDB_PORT ?? 6384),
    },
  });
  const graph = falkor.selectGraph(process.env.FALKORDB_GRAPH ?? 'edip');
  try {
    await graph.delete();
  } catch {
    // Nothing to drop on a first run; that is the desired end state.
  }
  for (const statement of [
    'CREATE INDEX FOR (e:Entity) ON (e.id)',
    'CREATE INDEX FOR (e:Entity) ON (e.normalized_name)',
    'CREATE INDEX FOR (e:Entity) ON (e.type)',
    'CREATE INDEX FOR (d:Document) ON (d.id)',
    `CREATE VECTOR INDEX FOR (e:Entity) ON (e.name_embedding) OPTIONS {dimension: 1024, similarityFunction: 'cosine'}`,
  ]) {
    try {
      await graph.query(statement);
    } catch (error) {
      if (!/already (?:indexed|exists)/i.test((error as Error).message)) throw error;
    }
  }

  // ---- Documents ---------------------------------------------------------
  let entityLinks = 0;
  let locatedMentions = 0;

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

    // Document node in the graph, so mentions have something to attach to.
    await graph.query(
      `MERGE (d:Document {id: $id})
       SET d.label = $label, d.title = $title, d.filename = $filename,
           d.document_type = $documentType, d.status = 'completed'`,
      {
        params: {
          id: record.id,
          label: analysis?.metadata.title ?? record.fileName,
          title: analysis?.metadata.title ?? null,
          filename: record.fileName,
          documentType: analysis?.type ?? null,
        },
      },
    );

    for (const raw of analysis?.entities ?? []) {
      const normalizedName = normalizeEntityName(raw.value);
      if (!normalizedName) continue;

      const type = coerceEntityType(raw.kind);
      // No embeddings here: seeding must work without AWS. Dedup falls back to
      // the exact-name path, which is what folds `Ecloudvalley Vietnam Ltd`
      // and `ECLOUDVALLEY VIETNAM` into one node.
      await graph.query(
        `MERGE (e:Entity {normalized_name: $normalizedName, type: $type})
         ON CREATE SET e.id = $id, e.entity_name = $entityName, e.aliases = []`,
        {
          params: { normalizedName, type, id: randomUUID(), entityName: raw.value },
        },
      );

      // Verbatim mention, so indexOf either finds the exact span or the
      // mention honestly carries no offset. Never guessed.
      const charStart = record.text.indexOf(raw.value);
      await graph.query(
        `MATCH (d:Document {id: $documentId}),
               (e:Entity {normalized_name: $normalizedName, type: $type})
         MERGE (d)-[m:MENTIONS {mention_text: $mentionText}]->(e)
         SET m.char_start = $charStart, m.char_end = $charEnd, m.confidence = $confidence`,
        {
          params: {
            documentId: record.id,
            normalizedName,
            type,
            mentionText: raw.value,
            charStart: charStart >= 0 ? charStart : null,
            charEnd: charStart >= 0 ? charStart + raw.value.length : null,
            confidence: raw.confidence ?? null,
          },
        },
      );
      entityLinks += 1;
      if (charStart >= 0) locatedMentions += 1;
    }
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

  const [users, documents, typed] = await Promise.all([
    prisma.user.count(),
    prisma.document.count(),
    prisma.document.count({ where: { documentType: { not: null } } }),
  ]);

  const entityCount = await graph.query<{ count: number }>(
    'MATCH (e:Entity) RETURN count(e) AS count',
  );
  const mentionCount = await graph.query<{ count: number }>(
    'MATCH (:Document)-[m:MENTIONS]->(:Entity) RETURN count(m) AS count',
  );
  await falkor.close();

  console.log(
    [
      `users            ${users}`,
      `documents        ${documents} (${typed} typed, ${documents - typed} untyped/failed)`,
      `entities         ${entityCount.data?.[0]?.count ?? 0} distinct in FalkorDB (from ${entityLinks} mentions)`,
      `mentions         ${mentionCount.data?.[0]?.count ?? 0} edges, ${locatedMentions} with char offsets`,
    ].join('\n'),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
