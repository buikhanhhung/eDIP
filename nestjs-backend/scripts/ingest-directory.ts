import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import 'dotenv/config';

/**
 * Uploads every file in a directory through the running API and waits for the
 * ingest jobs to finish.
 *
 * Deliberately over HTTP rather than straight into the database: the point is
 * to build the corpus the way a user would, so classification, chunking,
 * embedding and entity extraction all actually run.
 *
 *   ts-node -r tsconfig-paths/register scripts/ingest-directory.ts <dir>
 */
const API = process.env.API_URL ?? 'http://localhost:3000';
const POLL_INTERVAL_MS = 4000;
const TERMINAL = new Set(['completed', 'failed']);

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: ingest-directory.ts <directory>');

  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@ecloudvalley.demo';
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error('SEED_ADMIN_PASSWORD is not set');

  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status} ${await login.text()}`);
  const { accessToken } = (await login.json()) as { accessToken: string };

  const files = (await readdir(dir)).filter((name) => !name.startsWith('.')).sort();
  console.log(`uploading ${files.length} files from ${dir}`);

  const queued: { id: string; filename: string }[] = [];
  for (const name of files) {
    const form = new FormData();
    // The filename travels in the multipart header, which is exactly the path
    // the encoding fix covers — so Vietnamese names are exercised here too.
    form.append('file', new Blob([await readFile(path.join(dir, name))]), name);

    const response = await fetch(`${API}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    if (!response.ok) {
      console.error(`  ✗ ${name}: ${response.status} ${await response.text()}`);
      continue;
    }
    const document = (await response.json()) as { id: string; filename: string };
    queued.push(document);
    console.log(`  → ${document.filename} (${document.id})`);
  }

  console.log(`\nwaiting for ${queued.length} ingest jobs…`);
  const done = new Map<string, { status: string; error: string | null }>();

  while (done.size < queued.length) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    for (const document of queued) {
      if (done.has(document.id)) continue;

      // The jobs live in Redis, so they outlive the API process — and in watch
      // mode it restarts whenever a file is touched. A refused connection means
      // "ask again shortly", not "give up on a run that is still going".
      let response: Response;
      try {
        response = await fetch(`${API}/documents/${document.id}/status`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch {
        break;
      }
      if (!response.ok) continue;
      const status = (await response.json()) as { status: string; error: string | null };
      if (!TERMINAL.has(status.status)) continue;

      done.set(document.id, status);
      const mark = status.status === 'completed' ? '✓' : '✗';
      console.log(
        `  ${mark} ${document.filename}: ${status.status}${status.error ? ` — ${status.error}` : ''}` +
          `  (${done.size}/${queued.length})`,
      );
    }
  }

  const failed = [...done.values()].filter((status) => status.status === 'failed').length;
  console.log(`\ndone: ${done.size - failed} completed, ${failed} failed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
