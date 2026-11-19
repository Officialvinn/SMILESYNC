import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { FieldCrypto } from './security/fieldCrypto.js';
import { ImageStore } from './storage/imageStore.js';

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
const app = createApp({ db, config });

const server = app.listen(config.PORT, () => {
  console.log(`SmileSync API listening on port ${config.PORT}`);
});

// NFR 6: remove photos from uploads that never became a case. At start, then every 6 hours.
const images = new ImageStore(config.IMAGE_STORAGE_DIR, new FieldCrypto(config.PATIENT_DATA_KEY));
const purge = () =>
  images
    .purgeIncoming(config.INCOMING_RETENTION_DAYS * 86_400_000, new Date())
    .then((n) => n > 0 && console.log(`Deleted ${n} abandoned uploaded photo(s) older than ${config.INCOMING_RETENTION_DAYS} days`))
    .catch((e: unknown) => console.error('Upload clean-up failed', e));
void purge();
const purgeTimer = setInterval(() => void purge(), 6 * 3600_000);
purgeTimer.unref();

const shutdown = () => {
  clearInterval(purgeTimer);
  server.close(() => void db.$disconnect().finally(() => process.exit(0)));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
