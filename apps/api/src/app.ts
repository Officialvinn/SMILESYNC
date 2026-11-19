import express from 'express';
import helmet from 'helmet';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { errorHandler } from './http/errors.js';
import { authRouter } from './routes/auth.js';
import { plannedRouter } from './routes/planned.js';

export interface AppDeps {
  db: Db;
  config: Config;
  now?: () => Date;
}

export function createApp({ db, config, now = () => new Date() }: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (_req, res) => {
    await db.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  });

  app.use('/auth', authRouter(db, config, now));
  app.use(plannedRouter(db, config.JWT_SECRET, now));
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use(errorHandler(config.NODE_ENV === 'production'));
  return app;
}
