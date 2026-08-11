import * as path from 'node:path';
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 does not read .env on its own and does not pick up
 * `package.json#prisma.seed`. Both live here instead — without this file
 * `migrate deploy` fails on a missing datasource URL and `db seed` is a no-op.
 */
export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  migrations: {
    path: path.join(__dirname, 'prisma', 'migrations'),
    seed: 'tsx ./prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
