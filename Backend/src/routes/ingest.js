import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { HttpError, idParam, isAdmin, nameKey, notFound, pageQuery, parse, slugify } from '../http.js';
import { canonicalCountryName } from '../countries.js';
import { enqueueReport } from './reports.js';

const PRIVATE_V4 = [/^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

/** Cheap syntactic SSRF guard. The worker re-checks every resolved IP before fetching. */
export function checkPublicUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return 'Not a valid URL.';
  }
  if (!['http:', 'https:'].includes(u.protocol)) return 'Only http(s) URLs are allowed.';
  if (u.username || u.password) return 'URLs with credentials are not allowed.';
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host.includes('.') && !isIP(host)) return 'Host must be a public domain.';
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return 'Private hosts are not allowed.';
  if (isIP(host) === 4 && PRIVATE_V4.some((re) => re.test(host))) return 'Private IP addresses are not allowed.';
  if (isIP(host) === 6 && (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80') || host.startsWith('::ffff:'))) {
    return 'Private IP addresses are not allowed.';
  }
  return null;
}

const ingestBody = z
  .object({
    url: z.string().trim().max(2000).optional(),
    company_name: z.string().trim().min(2).max(200).optional(),
    company_slug: z.string().trim().max(120).optional(),
    country: z.string().trim().max(120).optional(),
    sector: z.string().trim().max(120).optional(),
    fiscal_year: z.coerce.number().int().min(1990).max(2100).optional(),
    title: z.string().trim().max(300).optional(),
    force: z.enum(['true', 'false']).optional(),
  })
  .refine((b) => b.company_name || b.company_slug, { message: 'company_name or company_slug is required', path: ['company_name'] });

async function resolveCompany(q, b) {
  if (b.company_slug) {
    const c = await q.one(`SELECT * FROM esg.companies WHERE slug = $1`, [b.company_slug]);
    if (!c) throw new HttpError(404, 'Company not found.');
    return { company: c, created: false };
  }
  const name = b.company_name;
  const slug = slugify(name);
  const key = nameKey(name);
  const candidates = await q.query(
    `SELECT * FROM esg.companies WHERE slug = $1 OR lower(name) = lower($2) OR slug LIKE $3 || '%' LIMIT 20`,
    [slug, name, key],
  );
  const match = candidates.find((c) => c.slug === slug || c.name.toLowerCase() === name.toLowerCase()) ||
    candidates.find((c) => nameKey(c.name) === key);
  if (match) return { company: match, created: false };
  let finalSlug = slug;
  for (let i = 2; await q.one(`SELECT 1 FROM esg.companies WHERE slug = $1`, [finalSlug]); i++) finalSlug = `${slug}-${i}`;
  const company = await q.one(
    `INSERT INTO esg.companies (slug, name, sector, country) VALUES ($1, $2, $3, $4) RETURNING *`,
    [finalSlug, name, b.sector || null, canonicalCountryName(b.country) || b.country || null],
  );
  return { company, created: true };
}

export function ingestRouter({ db, config }) {
  const r = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 20 },
  });
  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: config.INGEST_RATE_LIMIT_PER_HOUR,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => isAdmin(req, config),
    message: { error: 'Ingestion rate limit reached. Try again later.' },
  });

  const gate = (req, _res, next) => {
    if (config.PUBLIC_INGEST || isAdmin(req, config)) {
      req.actor = isAdmin(req, config) ? 'reviewer' : `public:${req.ip}`;
      return next();
    }
    if (!config.ADMIN_TOKEN) return next(new HttpError(503, 'Ingestion is disabled: set ADMIN_TOKEN (or PUBLIC_INGEST=true) on the API server.'));
    return next(new HttpError(401, 'A valid reviewer token is required to submit reports.'));
  };

  r.post('/', gate, limiter, upload.single('file'), async (req, res) => {
    const b = parse(ingestBody, req.body);
    const file = req.file;
    if (!file && !b.url) throw new HttpError(400, 'Provide a PDF file or a URL.');
    if (file && b.url) throw new HttpError(400, 'Provide either a file or a URL, not both.');
    if (b.url) {
      const problem = checkPublicUrl(b.url);
      if (problem) throw new HttpError(400, problem);
    }
    let sha256 = null;
    if (file) {
      if (file.buffer.subarray(0, 1024).indexOf('%PDF-') === -1) throw new HttpError(415, 'The uploaded file is not a PDF.');
      sha256 = createHash('sha256').update(file.buffer).digest('hex');
    }
    const force = b.force === 'true' && isAdmin(req, config);

    const result = await db.tx(async (q) => {
      const { company, created } = await resolveCompany(q, b);
      const dup = await q.one(
        `SELECT id, status FROM esg.reports
          WHERE company_id = $1 AND (($2::text IS NOT NULL AND file_sha256 = $2) OR ($3::text IS NOT NULL AND source_url = $3))
          ORDER BY id DESC LIMIT 1`,
        [company.id, sha256, b.url || null],
      );
      if (dup && !force && dup.status !== 'failed') {
        const job = await q.one(`SELECT id FROM esg.jobs WHERE report_id = $1 ORDER BY id DESC LIMIT 1`, [dup.id]);
        return { duplicate: true, company, report_id: dup.id, job_id: job?.id ?? null, status: dup.status };
      }
      let reportId;
      if (dup) {
        // Forced re-run, or a retry of a previously failed submission.
        reportId = dup.id;
      } else {
        const rep = await q.one(
          `INSERT INTO esg.reports (company_id, title, source_url, source_type, file_name, file_sha256, file_size, fiscal_year, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'queued') RETURNING id`,
          [
            company.id,
            b.title || null,
            b.url || null,
            file ? 'upload' : 'url',
            file ? file.originalname?.slice(0, 250) : null,
            sha256,
            file ? file.size : null,
            b.fiscal_year || null,
          ],
        );
        reportId = rep.id;
        if (file) {
          await q.query(`INSERT INTO esg.report_files (report_id, content) VALUES ($1, $2)`, [reportId, file.buffer]);
        }
      }
      const job = await enqueueReport(q, {
        reportId,
        companyId: company.id,
        reason: `Submitted ${file ? `upload "${file.originalname}"` : `URL ${b.url}`}${created ? ' (new company created)' : ''}`,
      });
      await q.query(`INSERT INTO esg.audit_log (actor, action, entity, entity_id, data) VALUES ($1,'ingest','report',$2,$3)`, [
        req.actor, reportId, JSON.stringify({ url: b.url || null, file: file?.originalname || null, sha256 }),
      ]);
      return { duplicate: false, company, report_id: reportId, job_id: job.id, status: 'queued', company_created: created };
    });

    res.status(result.duplicate ? 200 : 202).json({
      ...result,
      company: { id: result.company.id, slug: result.company.slug, name: result.company.name },
    });
  });

  return r;
}

export function jobsRouter({ db }) {
  const r = Router();

  r.get('/', async (req, res) => {
    const q = parse(pageQuery.extend({ status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled', 'active']).optional() }), req.query);
    const rows = await db.query(
      `SELECT j.id, j.status, j.stage, j.progress, j.error, j.attempts, j.created_at, j.updated_at, j.finished_at,
              j.report_id, c.slug AS company_slug, c.name AS company_name, count(*) OVER () AS total
         FROM esg.jobs j LEFT JOIN esg.companies c ON c.id = j.company_id
        WHERE ($1::text IS NULL OR j.status = $1 OR ($1 = 'active' AND j.status IN ('queued','running')))
        ORDER BY j.id DESC LIMIT $2 OFFSET $3`,
      [q.status || null, q.limit, (q.page - 1) * q.limit],
    );
    const total = rows[0]?.total ?? 0;
    const worker = await db.one(`SELECT max(locked_at) AS last_claim FROM esg.jobs WHERE locked_at IS NOT NULL`);
    res.json({ data: rows.map(({ total: _t, ...x }) => x), total, page: q.page, limit: q.limit, worker_last_seen: worker?.last_claim || null });
  });

  r.get('/:id', async (req, res) => {
    const { id } = parse(idParam, req.params);
    const job = await db.one(
      `SELECT j.id, j.status, j.stage, j.progress, j.error, j.attempts, j.max_attempts, j.logs, j.run_after,
              j.created_at, j.updated_at, j.finished_at, j.report_id,
              c.slug AS company_slug, c.name AS company_name,
              (SELECT count(*) FROM esg.jobs q WHERE q.status = 'queued' AND q.id < j.id) AS queue_position
         FROM esg.jobs j LEFT JOIN esg.companies c ON c.id = j.company_id WHERE j.id = $1`,
      [id],
    );
    if (!job) throw notFound('Job');
    res.json(job);
  });

  return r;
}
