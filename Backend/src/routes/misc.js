import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { HttpError, isAdmin, notFound, parse } from '../http.js';
import { answerQuestion } from '../services/ask.js';
import { findCompany } from './companies.js';

export function statsRouter({ db }) {
  const r = Router();
  r.get('/', async (_req, res) => {
    const [totals, sectors, recentFlags, recentReports, flagCodes] = await Promise.all([
      db.one(`SELECT
          (SELECT count(*) FROM esg.companies) AS companies,
          (SELECT count(DISTINCT company_id) FROM esg.metrics WHERE status <> 'rejected' AND method <> 'legacy' AND value IS NOT NULL) AS companies_with_data,
          (SELECT count(*) FROM esg.reports WHERE status = 'processed') AS reports_processed,
          (SELECT count(*) FROM esg.reports WHERE status IN ('queued','processing')) AS reports_pending,
          (SELECT count(*) FROM esg.reports WHERE status = 'failed') AS reports_failed,
          (SELECT count(*) FROM esg.metrics WHERE method <> 'legacy' AND status <> 'rejected') AS metrics_extracted,
          (SELECT count(*) FROM esg.metrics WHERE method <> 'legacy' AND grounded AND status <> 'rejected') AS metrics_grounded,
          (SELECT count(*) FROM esg.metrics WHERE status = 'verified') AS metrics_verified,
          (SELECT count(*) FROM esg.metrics WHERE method = 'legacy') AS metrics_legacy,
          (SELECT count(*) FROM esg.flags WHERE status = 'open') AS open_flags,
          (SELECT count(*) FROM esg.flags WHERE status = 'open' AND severity IN ('high','medium')) AS open_material_flags`),
      db.query(`SELECT coalesce(c.sector, 'Unclassified') AS sector, count(*)::int AS companies
                  FROM esg.companies c WHERE EXISTS (SELECT 1 FROM esg.metrics m WHERE m.company_id = c.id AND m.method <> 'legacy')
                 GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 12`),
      db.query(`SELECT f.id, f.code, f.severity, f.title, f.created_at, f.report_id, c.slug AS company_slug, c.name AS company_name
                  FROM esg.flags f JOIN esg.companies c ON c.id = f.company_id
                 WHERE f.status = 'open'
                 ORDER BY CASE f.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END, f.created_at DESC
                 LIMIT 8`),
      db.query(`SELECT r.id, r.title, r.file_name, r.fiscal_year, r.status, r.processed_at, r.created_at, r.assurance_level,
                       c.slug AS company_slug, c.name AS company_name,
                       (SELECT count(*) FROM esg.metrics m WHERE m.report_id = r.id) AS metric_count
                  FROM esg.reports r JOIN esg.companies c ON c.id = r.company_id
                 WHERE r.status <> 'legacy'
                 ORDER BY coalesce(r.processed_at, r.created_at) DESC LIMIT 6`),
      db.query(`SELECT code, count(*)::int AS n FROM esg.flags WHERE status = 'open' GROUP BY code ORDER BY n DESC`),
    ]);
    res.json({ totals, sectors, recent_flags: recentFlags, recent_reports: recentReports, open_flags_by_code: flagCodes });
  });
  return r;
}

export function askRouter({ db, config, llm, features }) {
  const r = Router();
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: config.ASK_RATE_LIMIT_PER_MIN,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => isAdmin(req, config),
    message: { error: 'Too many questions. Please wait a minute.' },
  });
  r.post('/', limiter, async (req, res) => {
    const b = parse(
      z.object({
        company: z.string().trim().min(1).max(120),
        question: z.string().trim().min(3).max(500),
        report_id: z.number().int().positive().optional(),
      }),
      req.body,
    );
    const company = await findCompany(db, b.company);
    if (!company) throw notFound('Company');
    try {
      const out = await answerQuestion({ db, llm, useVector: features.vector }, { company, question: b.question, reportId: b.report_id ?? null });
      res.json(out);
    } catch (err) {
      if (/LLM provider/.test(err.message)) throw new HttpError(503, 'The answer service is temporarily unavailable. Try again shortly.');
      throw err;
    }
  });
  return r;
}

export function healthRouter({ db, config, llm, features }) {
  const r = Router();
  r.get('/', async (_req, res) => {
    let dbOk = false;
    try {
      await db.one('SELECT 1 AS ok');
      dbOk = true;
    } catch {
      dbOk = false;
    }
    let worker = null;
    let dbSizeMb = null;
    if (dbOk) {
      dbSizeMb = await db
        .one(`SELECT round(pg_database_size(current_database()) / 1048576.0)::int AS mb`)
        .then((x) => x.mb)
        .catch(() => null);
      worker = await db
        .one(`SELECT max(coalesce(locked_at, finished_at)) FILTER (WHERE attempts > 0) AS last_seen,
                     count(*) FILTER (WHERE status = 'queued') AS queued,
                     count(*) FILTER (WHERE status = 'running') AS running,
                     extract(epoch FROM now() - min(created_at) FILTER (WHERE status = 'queued' AND run_after <= now()))::int AS oldest_queued_s
                FROM esg.jobs`)
        .catch(() => null);
    }
    res.status(dbOk ? 200 : 503).json({
      status: dbOk ? 'ok' : 'degraded',
      database: dbOk,
      database_size_mb: dbSizeMb,
      version: '4.0.0',
      features: {
        llm: llm.providers,
        embeddings: llm.embeddingsProvider,
        vector_search: features.vector,
        public_ingest: config.PUBLIC_INGEST,
        reviewer_enabled: Boolean(config.ADMIN_TOKEN),
        max_upload_mb: config.MAX_UPLOAD_MB,
      },
      worker: worker && {
        ...worker,
        // Jobs have waited > 2 minutes with nothing running: the worker is probably not started.
        stalled: Boolean(worker.queued > 0 && worker.running === 0 && worker.oldest_queued_s > 120),
      },
    });
  });
  return r;
}

export function authRouter({ config }) {
  const r = Router();
  // Lets the UI check a pasted reviewer token without performing an action.
  r.get('/check', (req, res) => {
    res.json({ reviewer: isAdmin(req, config), enabled: Boolean(config.ADMIN_TOKEN) });
  });
  return r;
}
