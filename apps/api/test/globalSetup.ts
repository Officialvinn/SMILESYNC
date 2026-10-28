/**
 * Test database: a real PostgreSQL given by TEST_DATABASE_URL.
 * Locally: `docker compose up -d db` then use the URL from .env.example.
 * In CI: the PostgreSQL service container.
 *
 * Each run drops and recreates the schema, then applies the real migrations,
 * exactly as production does. To protect real data it refuses any database
 * whose name does not end in "_test".
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TestProject } from 'vitest/node';
import pg from 'pg';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Start PostgreSQL with `docker compose up -d db` and export ' +
        'TEST_DATABASE_URL=postgresql://smilesync:smilesync@localhost:5432/smilesync_test (see README).',
    );
  }
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to reset "${dbName}": the test database name must end in "_test".`);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // DROP SCHEMA removes the append-only audit table without firing its row triggers.
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    // The runtime role the migration grants privileges to (NFR 4). Created by the
    // docker init script in dev; created here (without login) for CI.
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smilesync_app') THEN CREATE ROLE smilesync_app NOLOGIN; END IF;
    END $$;`);
  } finally {
    await client.end();
  }

  await promisify(execFile)('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_MIGRATION_URL: url },
  });

  project.provide('databaseUrl', url);
}
