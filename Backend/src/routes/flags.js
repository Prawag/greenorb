import { Router } from 'express';
import { z } from 'zod';
import { idParam, notFound, pageQuery, parse, requireAdmin } from '../http.js';

export function flagsRouter({ db, config }) {
  const r = Router();

  r.get('/', async (req, res) => {
    const q = parse(
      pageQuery.extend({
        status: z.enum(['open', 'confirmed', 'dismissed', 'all']).default('open'),
        severity: z.enum(['info', 'low', 'medium', 'high']).optional(),
        code: z.string().trim().max(60).optional(),
        company: z.string().trim().max(120).optional(),
      }),
      req.query,
    );
    const rows = await db.query(
      `SELECT f.id, f.code, f.severity, f.title, f.detail, f.evidence, f.status, f.review_note, f.reviewed_at,
              f.created_at, f.report_id, f.metric_id, c.slug AS company_slug, c.name AS company_name,
              r.fiscal_year, count(*) OVER () AS total
         FROM esg.flags f
         JOIN esg.companies c ON c.id = f.company_id
         LEFT JOIN esg.reports r ON r.id = f.report_id
        WHERE ($1 = 'all' OR f.status = $1)
          AND ($2::text IS NULL OR f.severity = $2)
          AND ($3::text IS NULL OR f.code = $3)
          AND ($4::text IS NULL OR c.slug = $4)
        ORDER BY CASE f.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
                 f.created_at DESC, f.id DESC
        LIMIT $5 OFFSET $6`,
      [q.status, q.severity || null, q.code || null, q.company || null, q.limit, (q.page - 1) * q.limit],
    );
    const counts = await db.query(
      `SELECT severity, count(*)::int AS n FROM esg.flags WHERE status = 'open' GROUP BY severity`,
    );
    const total = rows[0]?.total ?? 0;
    res.json({
      data: rows.map(({ total: _t, ...x }) => x),
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.limit)),
      open_by_severity: Object.fromEntries(counts.map((c) => [c.severity, c.n])),
    });
  });

  r.post('/:id/review', requireAdmin(config), async (req, res) => {
    const { id } = parse(idParam, req.params);
    const b = parse(
      z.object({
        status: z.enum(['open', 'confirmed', 'dismissed']),
        note: z.string().trim().max(2000).optional(),
        reviewer: z.string().trim().max(80).optional(),
      }),
      req.body,
    );
    const row = await db.one(
      `UPDATE esg.flags
          SET status = $2, review_note = $3,
              reviewed_by = CASE WHEN $2 = 'open' THEN NULL ELSE $4 END,
              reviewed_at = CASE WHEN $2 = 'open' THEN NULL ELSE now() END
        WHERE id = $1 RETURNING *`,
      [id, b.status, b.note || null, b.reviewer || req.actor],
    );
    if (!row) throw notFound('Flag');
    await db.query(`INSERT INTO esg.audit_log (actor, action, entity, entity_id, data) VALUES ($1,'review','flag',$2,$3)`, [
      b.reviewer || req.actor, id, JSON.stringify(b),
    ]);
    res.json(row);
  });

  return r;
}
