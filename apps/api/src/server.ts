import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db.js';

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
const app = createApp({ db, config });

const server = app.listen(config.PORT, () => {
  console.log(`SmileSync API listening on port ${config.PORT}`);
});

const shutdown = () => {
  server.close(() => void db.$disconnect().finally(() => process.exit(0)));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
