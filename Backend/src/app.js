import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { HttpError, errorHandler } from './http.js';
import { companiesRouter, globeRouter } from './routes/companies.js';
import { metricsRouter, reportsRouter } from './routes/reports.js';
import { flagsRouter } from './routes/flags.js';
import { ingestRouter, jobsRouter } from './routes/ingest.js';
import { askRouter, authRouter, healthRouter, statsRouter } from './routes/misc.js';

export function createApp({ db, config, llm, features = { vector: false } }) {
  const app = express();
  const deps = { db, config, llm, features };

  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  const devOrigin = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true); // same-origin / curl / server-to-server
        if (config.ALLOWED_ORIGINS.includes('*') || config.ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        if (!config.isProd && devOrigin.test(origin)) return cb(null, true);
        return cb(null, false);
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['content-type', 'authorization'],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: '256kb' }));
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: config.RATE_LIMIT_PER_MIN,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Too many requests. Please slow down.' },
    }),
  );

  app.use('/api/health', healthRouter(deps));
  app.use('/api/auth', authRouter(deps));
  app.use('/api/stats', statsRouter(deps));
  app.use('/api/companies', companiesRouter(deps));
  app.use('/api/globe', globeRouter(deps));
  app.use('/api/reports', reportsRouter(deps));
  app.use('/api/metrics', metricsRouter(deps));
  app.use('/api/flags', flagsRouter(deps));
  app.use('/api/ingest', ingestRouter(deps));
  app.use('/api/jobs', jobsRouter(deps));
  app.use('/api/ask', askRouter(deps));

  app.get('/', (_req, res) => res.json({ name: 'GreenOrb API', version: '4.0.0', health: '/api/health' }));
  app.use((req, _res, next) => next(new HttpError(404, `No route for ${req.method} ${req.path}`)));
  app.use(errorHandler(config));
  return app;
}
