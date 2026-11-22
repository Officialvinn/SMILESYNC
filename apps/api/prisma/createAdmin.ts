/**
 * FR 8.1: create the first administrator on a fresh server.
 * The seed refuses to run in production, so a new deployment starts with no
 * accounts. This makes exactly one admin; every other account (dentists, CHWs)
 * is then created from the dashboard's Users page, which audits it (FR 8.2).
 *
 *   docker compose run --rm migrate npx tsx prisma/createAdmin.ts <username>
 *
 * The password is asked for with the input hidden, so it never lands in shell
 * history. Refuses if an administrator already exists.
 */
import { createInterface } from 'node:readline';
import { createDb } from '../src/db.js';
import { hashSecret, validateNewSecret } from '../src/auth/passwords.js';
import { recordAudit } from '../src/audit.js';

const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
const username = process.argv[2]?.trim();
if (!url) throw new Error('Set DATABASE_MIGRATION_URL (the migrate service has it)');
if (!username || !/^[a-z0-9._-]{3,40}$/i.test(username)) {
  console.error('Usage: npx tsx prisma/createAdmin.ts <username>   (3-40 letters, digits, . _ -)');
  process.exit(1);
}

/** One reader for both questions; typed characters are not echoed. */
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY ?? false });
const lines = rl[Symbol.asyncIterator]();
let muted = false;
(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
  if (!muted) process.stdout.write(s);
};
async function askHidden(question: string): Promise<string> {
  process.stdout.write(question);
  muted = true;
  const next = await lines.next();
  muted = false;
  process.stdout.write('\n');
  return next.done ? '' : String(next.value);
}

const db = createDb(url);
try {
  const existing = await db.user.count({ where: { role: 'ADMIN' } });
  if (existing > 0) {
    console.error('An administrator already exists. Create further accounts from the dashboard (Users).');
    process.exit(1);
  }
  const password = await askHidden('New admin password (at least 10 characters): ');
  const problem = validateNewSecret('ADMIN', password);
  if (problem) {
    console.error(`Password: ${problem}`);
    process.exit(1);
  }
  if ((await askHidden('Type it again: ')) !== password) {
    console.error('The two passwords do not match.');
    process.exit(1);
  }
  const user = await db.user.create({
    data: { username, role: 'ADMIN', adminLevel: 'SYSTEM', passwordHash: await hashSecret(password, Number(process.env.BCRYPT_COST ?? 12)) },
  });
  await recordAudit(db, { userId: user.id, action: 'admin:bootstrap', outcome: 'ALLOWED', resourceType: 'user', resourceId: user.id });
  console.log(`Created administrator "${username}". Log in at the dashboard and add the other accounts under Users.`);
} finally {
  rl.close();
  await db.$disconnect();
}
