import { Router } from 'express';
import { z } from 'zod';
import { HttpError, idParam, notFound, pageQuery, parse, requireAdmin } from '../http.js';
import { METRICS } from '../metrics.js';

export async function enqueueReport(q, { reportId, companyId, reason }) {
  await q.query(`UPDATE esg.reports SET status = 'queued', error = NULL WHERE id = $1`, [reportId]);
  return q.one(
    `INSERT INTO esg.jobs (kind, payload, company_id, report_id, logs)
     VALUES ('ingest_report', $1, $2, $3, $4) RETURNING id, status, created_at`,
    [
      JSON.stringify({ report_id: reportId }),
      companyId,
      reportId,
      JSON.stringify([{ at: new Date().toISOString(), level: 'info', message: reason }]),
    ],
  );
}

/** Passages overlap by ~150 characters; stitch them back into one page of text. */
export function joinPassages(parts) {
  let out = '';
  for (const raw of parts) {
    const part = raw.trim();
    if (!out) { out = part; continue; }
    // The worker overlaps passages by at most 150 characters (less after trimming).
    let k = Math.min(160, out.length, part.length);
    let joined = false;
    for (; k >= 20; k -= 1) {
      if (out.endsWith(part.slice(0, k))) { out += part.slice(k); joined = true; break; }
    }
    if (!joined) {
      // Overlap was trimmed at whitespace: look for the passage's opening words near the end of what we have.
      const head = part.slice(0, 40);
      const at = out.lastIndexOf(head, out.length - 1);
      out = at >= 0 && at > out.length - 200 ? out.slice(0, at) + part : `${out}\n${part}`;
    }
  }
  return out;
}

export function reportsRouter({ db, config }) {
  const r = Router();

  r.get('/', async (req, res) => {
    const q = parse(pageQuery.extend({ status: z.enum(['queued', 'processing', 'processed', 'failed', 'legacy']).optional() }), req.query);
    const rows = await db.query(
      `SELECT r.id, r.title, r.fiscal_year, r.status, r.source_type, r.assurance_level, r.processed_at, r.created_at,
              c.slug AS company_slug, c.name AS company_name,
              (SELECT count(*) FROM esg.metrics m WHERE m.report_id = r.id) AS metric_count,
              (SELECT count(*) FROM esg.flags f WHERE f.report_id = r.id AND f.status = 'open') AS open_flags,
              count(*) OVER () AS total
         FROM esg.reports r JOIN esg.companies c ON c.id = r.company_id
        WHERE ($1::text IS NULL OR r.status = $1)
        ORDER BY coalesce(r.processed_at, r.created_at) DESC
        LIMIT $2 OFFSET $3`,
      [q.status || null, q.limit, (q.page - 1) * q.limit],
    );
    const total = rows[0]?.total ?? 0;
    res.json({ data: rows.map(({ total: _t, ...x }) => x), page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) });
  });

  r.get('/:id', async (req, res) => {
    const { id } = parse(idParam, req.params);
    const report = await db.one(
      `SELECT r.*, (rf.report_id IS NOT NULL) AS has_file,
              json_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'sector', c.sector, 'country', c.country) AS company
         FROM esg.reports r
         JOIN esg.companies c ON c.id = r.company_id
         LEFT JOIN esg.report_files rf ON rf.report_id = r.id
        WHERE r.id = $1`,
      [id],
    );
    if (!report) throw notFound('Report');
    const [metrics, flags, job] = await Promise.all([
      db.query(
        `SELECT id, metric, fiscal_year, period_label, value, unit, raw_value, raw_unit, boundary, page, quote,
                method, confidence, grounded, is_primary, status, notes
           FROM esg.metrics WHERE report_id = $1
          ORDER BY metric, fiscal_year DESC, is_primary DESC, confidence DESC`,
        [id],
      ),
      db.query(
        `SELECT id, metric_id, code, severity, title, detail, evidence, status, review_note, reviewed_at, created_at
           FROM esg.flags WHERE report_id = $1
          ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END, id`,
        [id],
      ),
      db.one(
        `SELECT id, status, stage, progress, error, attempts, created_at, finished_at, logs
           FROM esg.jobs WHERE report_id = $1 ORDER BY id DESC LIMIT 1`,
        [id],
      ),
    ]);
    res.json({
      report,
      metrics: metrics.map((m) => ({ ...m, label: METRICS[m.metric]?.label || m.metric })),
      flags,
      job,
    });
  });

  // Text of one page, rebuilt from the stored passages. This is the evidence view: it works for every
  // processed report, including ones read from a local folder whose PDF the server never received.
  r.get('/:id/pages/:page', async (req, res) => {
    const { id, page } = parse(z.object({ id: z.coerce.number().int().positive(), page: z.coerce.number().int().positive().max(5000) }), req.params);
    const report = await db.one(
      `SELECT r.id, r.title, r.file_name, r.fiscal_year, r.page_count, r.source_type, r.source_url, r.status,
              (rf.report_id IS NOT NULL) AS has_file,
              json_build_object('slug', c.slug, 'name', c.name) AS company
         FROM esg.reports r JOIN esg.companies c ON c.id = r.company_id
         LEFT JOIN esg.report_files rf ON rf.report_id = r.id
        WHERE r.id = $1`,
      [id],
    );
    if (!report) throw notFound('Report');
    const [chunks, pages, metrics] = await Promise.all([
      db.query(`SELECT content FROM esg.chunks WHERE report_id = $1 AND page = $2 ORDER BY ord`, [id, page]),
      db.query(`SELECT DISTINCT page FROM esg.chunks WHERE report_id = $1 ORDER BY page`, [id]),
      db.query(
        `SELECT id, metric, fiscal_year, value, unit, raw_value, quote, method, confidence, status
           FROM esg.metrics WHERE report_id = $1 AND page = $2 AND status <> 'rejected'
          ORDER BY metric, fiscal_year DESC`,
        [id, page],
      ),
    ]);
    const nums = pages.map((p) => p.page);
    res.set('cache-control', 'private, max-age=300');
    res.json({
      report,
      page,
      text: joinPassages(chunks.map((c) => c.content)),
      has_text: chunks.length > 0,
      prev_page: [...nums].reverse().find((n) => n < page) ?? null,
      next_page: nums.find((n) => n > page) ?? null,
      pages_with_text: nums.length,
      metrics: metrics.map((m) => ({ ...m, label: METRICS[m.metric]?.label || m.metric })),
    });
  });

  // Serve the stored PDF (so citations can open at #page=N) or redirect to the original URL.
  r.get('/:id/file', async (req, res) => {
    const { id } = parse(idParam, req.params);
    const file = await db.one(`SELECT content_type, content FROM esg.report_files WHERE report_id = $1`, [id]);
    if (file) {
      res.set({
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="greenorb-report-${id}.pdf"`,
        'cache-control': 'private, max-age=3600',
        'x-content-type-options': 'nosniff',
      });
      // Helmet's page CSP (object-src 'none') can stop browsers' built-in PDF viewers.
      res.removeHeader('content-security-policy');
      return res.send(file.content);
    }
    const report = await db.one(`SELECT source_url FROM esg.reports WHERE id = $1`, [id]);
    if (!report) throw notFound('Report');
    if (report.source_url && /^https?:\/\//i.test(report.source_url)) return res.redirect(302, report.source_url);
    throw new HttpError(404, 'The original PDF is not stored for this report.');
  });

  r.post('/:id/reprocess', requireAdmin(config), async (req, res) => {
    const { id } = parse(idParam, req.params);
    const report = await db.one(
      `SELECT r.id, r.company_id, r.source_url, r.status, (rf.report_id IS NOT NULL) AS has_file
         FROM esg.reports r LEFT JOIN esg.report_files rf ON rf.report_id = r.id WHERE r.id = $1`,
      [id],
    );
    if (!report) throw notFound('Report');
    if (!report.has_file && !report.source_url) throw new HttpError(409, 'Nothing to reprocess: no stored file or source URL.');
    if (['queued', 'processing'].includes(report.status)) throw new HttpError(409, 'This report is already in the queue.');
    const job = await db.tx((q) => enqueueReport(q, { reportId: id, companyId: report.company_id, reason: 'Reprocess requested by reviewer' }));
    await db.query(`INSERT INTO esg.audit_log (actor, action, entity, entity_id) VALUES ($1,'reprocess','report',$2)`, [req.actor, id]);
    res.status(202).json({ job_id: job.id });
  });

  r.delete('/:id', requireAdmin(config), async (req, res) => {
    const { id } = parse(idParam, req.params);
    const row = await db.one(`DELETE FROM esg.reports WHERE id = $1 RETURNING company_id`, [id]);
    if (!row) throw notFound('Report');
    await db.query(`SELECT esg.recompute_primary($1)`, [row.company_id]);
    await db.query(`INSERT INTO esg.audit_log (actor, action, entity, entity_id) VALUES ($1,'delete','report',$2)`, [req.actor, id]);
    res.status(204).end();
  });

  return r;
}

export function metricsRouter({ db, config }) {
  const r = Router();
  const body = z.object({
    status: z.enum(['extracted', 'verified', 'rejected']).optional(),
    value: z.number().finite().nonnegative().optional(),
    note: z.string().trim().max(1000).optional(),
  });

  // Reviewer verifies, rejects or corrects a single extracted value.
  r.patch('/:id', requireAdmin(config), async (req, res) => {
    const { id } = parse(idParam, req.params);
    const b = parse(body, req.body);
    if (b.status === undefined && b.value === undefined) throw new HttpError(400, 'Nothing to update.');
    const updated = await db.tx(async (q) => {
      const m = await q.one(`SELECT * FROM esg.metrics WHERE id = $1 FOR UPDATE`, [id]);
      if (!m) throw notFound('Metric');
      const notes = [m.notes, b.value !== undefined && b.value !== m.value ? `Corrected by reviewer from ${m.value} ${m.unit}.` : null, b.note]
        .filter(Boolean)
        .join(' ');
      const row = await q.one(
        `UPDATE esg.metrics SET status = coalesce($2, status), value = coalesce($3, value), notes = nullif($4, '')
          WHERE id = $1 RETURNING *`,
        [id, b.value !== undefined ? 'verified' : b.status ?? null, b.value ?? null, notes],
      );
      await q.query(`SELECT esg.recompute_primary($1)`, [m.company_id]);
      await q.query(`INSERT INTO esg.audit_log (actor, action, entity, entity_id, data) VALUES ($1,'review','metric',$2,$3)`, [
        req.actor, id, JSON.stringify({ before: { value: m.value, status: m.status }, after: b }),
      ]);
      return row;
    });
    res.json(updated);
  });

  return r;
}
