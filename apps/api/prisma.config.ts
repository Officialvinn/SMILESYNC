/**
 * Prisma 7 config. Migrations run as the database owner
 * (DATABASE_MIGRATION_URL). The running API connects as the restricted
 * smilesync_app role (DATABASE_URL), which cannot change the audit log (NFR 4).
 */
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL ?? '',
  },
});
