import { Router } from 'express';
import { z } from 'zod';
import { HttpError, notFound, pageQuery, parse, requireAdmin, slugify } from '../http.js';
import { METRICS } from '../metrics.js';
import { canonicalCountryName, resolveCountry } from '../countries.js';

const SORTS = {
  name: 'c.name',
  scope1: 's.scope1',
  scope2: 's.scope2',
  scope3: 's.scope3',
  disclosure: 's.disclosure_score',
  flags: 's.open_flags',
  year: 's.latest_year',
  updated: 'c.updated_at',
};

const listQuery = pageQuery.extend({
  q: z.string().trim().max(120).optional(),
  sector: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  has_data: z.enum(['true', 'false']).optional(),
  sort: z.enum(Object.keys(SORTS)).default('name'),
  order: z.enum(['asc', 'desc']).optional(),
});

const likeEscape = (s) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export async function findCompany(db, slugOrId) {
  const isId = /^\d+$/.test(String(slugOrId));
  return db.one(`SELECT * FROM esg.companies WHERE ${isId ? 'id = $1::bigint' : 'slug = $1'}`, [String(slugOrId)]);
}

export function companiesRouter({ db, config }) {
  const r = Router();

  r.get('/', async (req, res) => {
    const q = parse(listQuery, req.query);
    const order = q.order || (['name'].includes(q.sort) ? 'asc' : 'desc');
    const offset = (q.page - 1) * q.limit;
    const rows = await db.query(
      `SELECT c.id, c.slug, c.name, c.ticker, c.sector, c.country,
              s.latest_year, s.scope1, s.scope2, s.scope3, s.disclosure_score, s.data_confidence,
              s.open_flags, s.open_material_flags, s.report_count, s.assurance_level, s.has_legacy_data,
              count(*) OVER () AS total
         FROM esg.companies c
         JOIN esg.company_summary s ON s.company_id = c.id
        WHERE ($1::text IS NULL OR c.name ILIKE '%' || $1 || '%' OR c.ticker ILIKE $1 OR EXISTS (
                SELECT 1 FROM unnest(c.aliases) a WHERE a ILIKE '%' || $1 || '%'))
          AND ($2::text IS NULL OR c.sector = $2)
          AND ($3::text IS NULL OR c.country = $3)
          AND ($4::boolean IS NULL OR (s.latest_year IS NOT NULL) = $4)
        ORDER BY ${SORTS[q.sort]} ${order} NULLS LAST, c.name ASC
        LIMIT $5 OFFSET $6`,
      [
        q.q ? likeEscape(q.q) : null,
        q.sector || null,
        q.country || null,
        q.has_data === undefined ? null : q.has_data === 'true',
        q.limit,
        offset,
      ],
    );
    const total = rows[0]?.total ?? 0;
    res.json({
      data: rows.map(({ total: _t, ...row }) => row),
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.limit)),
    });
  });

  r.get('/facets', async (_req, res) => {
    const [sectors, countries] = await Promise.all([
      db.query(`SELECT sector AS value, count(*)::int AS count FROM esg.companies WHERE sector IS NOT NULL GROUP BY sector ORDER BY count DESC, sector`),
      db.query(`SELECT country AS value, count(*)::int AS count FROM esg.companies WHERE country IS NOT NULL GROUP BY country ORDER BY count DESC, country`),
    ]);
    res.json({ sectors, countries });
  });

  // Lightweight autocomplete for the ingest form.
  r.get('/suggest', async (req, res) => {
    const { q } = parse(z.object({ q: z.string().trim().min(1).max(80) }), req.query);
    const rows = await db.query(
      `SELECT id, slug, name, country FROM esg.companies
        WHERE name ILIKE $1 || '%' OR name ILIKE '% ' || $1 || '%'
        ORDER BY (name ILIKE $1 || '%') DESC, length(name) LIMIT 8`,
      [likeEscape(q)],
    );
    res.json(rows);
  });

  r.get('/:slug', async (req, res) => {
    const company = await findCompany(db, req.params.slug);
    if (!company) throw notFound('Company');
    const [summary, reports, flags, series] = await Promise.all([
      db.one(`SELECT * FROM esg.company_summary WHERE company_id = $1`, [company.id]),
      db.query(
        `SELECT id, title, file_name, fiscal_year, period_label, source_type, source_url, status, assurance_level,
                assurance_provider, page_count, frameworks, processed_at, created_at, error,
                (SELECT count(*) FROM esg.metrics m WHERE m.report_id = r.id) AS metric_count,
                (SELECT count(*) FROM esg.flags f WHERE f.report_id = r.id AND f.status = 'open') AS open_flags
           FROM esg.reports r WHERE company_id = $1
          ORDER BY fiscal_year DESC NULLS LAST, created_at DESC`,
        [company.id],
      ),
      db.query(
        `SELECT id, report_id, metric_id, code, severity, title, detail, evidence, status, review_note, reviewed_at, created_at
           FROM esg.flags WHERE company_id = $1
          ORDER BY (status = 'open') DESC,
                   CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END, created_at DESC`,
        [company.id],
      ),
      db.query(
        `SELECT m.id, m.metric, m.fiscal_year, m.period_label, m.value, m.unit, m.raw_value, m.raw_unit,
                m.boundary, m.page, m.quote, m.method, m.confidence, m.grounded, m.status, m.report_id
           FROM esg.metrics m
          WHERE m.company_id = $1 AND m.status <> 'rejected'
            AND (m.is_primary OR (m.value IS NULL AND NOT EXISTS (
                  SELECT 1 FROM esg.metrics p WHERE p.company_id = m.company_id AND p.metric = m.metric
                     AND p.fiscal_year = m.fiscal_year AND p.is_primary)))
          ORDER BY m.metric, m.fiscal_year, m.id`,
        [company.id],
      ),
    ]);
    const metrics = {};
    for (const row of series) {
      (metrics[row.metric] ||= { key: row.metric, ...METRICS[row.metric], points: [] }).points.push(row);
    }
    res.json({ company, summary, reports, flags, metrics: Object.values(metrics) });
  });

  const companyBody = z.object({
    name: z.string().trim().min(2).max(200),
    ticker: z.string().trim().max(20).nullish(),
    sector: z.string().trim().max(120).nullish(),
    industry: z.string().trim().max(120).nullish(),
    country: z.string().trim().max(120).nullish(),
    hq_city: z.string().trim().max(120).nullish(),
    lat: z.number().min(-90).max(90).nullish(),
    lng: z.number().min(-180).max(180).nullish(),
    website: z.string().trim().url().max(300).nullish(),
    description: z.string().trim().max(2000).nullish(),
  });

  r.post('/', requireAdmin(config), async (req, res) => {
    const b = parse(companyBody, req.body);
    const slug = slugify(b.name);
    const exists = await db.one(`SELECT id FROM esg.companies WHERE slug = $1`, [slug]);
    if (exists) throw new HttpError(409, 'A company with this name already exists.');
    const row = await db.one(
      `INSERT INTO esg.companies (slug, name, ticker, sector, industry, country, hq_city, lat, lng, location_precision, website, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        slug, b.name, b.ticker ?? null, b.sector ?? null, b.industry ?? null,
        canonicalCountryName(b.country) || b.country || null, b.hq_city ?? null,
        b.lat ?? null, b.lng ?? null, b.lat != null && b.lng != null ? 'exact' : null,
        b.website ?? null, b.description ?? null,
      ],
    );
    res.status(201).json(row);
  });

  r.patch('/:slug', requireAdmin(config), async (req, res) => {
    const company = await findCompany(db, req.params.slug);
    if (!company) throw notFound('Company');
    const b = parse(companyBody.partial(), req.body);
    if (b.country) b.country = canonicalCountryName(b.country) || b.country;
    if ((b.lat == null) !== (b.lng == null)) throw new HttpError(400, 'Provide both lat and lng.');
    if (b.lat != null) b.location_precision = 'exact';
    const fields = Object.entries(b).filter(([k]) => k !== 'name' || b.name);
    if (!fields.length) return res.json(company);
    const sets = fields.map(([k], i) => `${k} = $${i + 2}`).join(', ');
    const row = await db.one(`UPDATE esg.companies SET ${sets} WHERE id = $1 RETURNING *`, [company.id, ...fields.map(([, v]) => v)]);
    await db.query(`INSERT INTO esg.audit_log (actor, action, entity, entity_id, data) VALUES ($1,'update','company',$2,$3)`, [
      req.actor, company.id, JSON.stringify(b),
    ]);
    res.json(row);
  });

  return r;
}

export function globeRouter({ db }) {
  const r = Router();
  r.get('/', async (_req, res) => {
    const rows = await db.query(
      `SELECT c.slug, c.name, c.sector, c.country, c.lat, c.lng, c.location_precision,
              s.latest_year, s.scope1, s.scope2, s.scope3, s.open_flags, s.open_material_flags, s.disclosure_score
         FROM esg.companies c JOIN esg.company_summary s ON s.company_id = c.id
        WHERE s.latest_year IS NOT NULL`,
    );
    const points = [];
    for (const row of rows) {
      let { lat, lng } = row;
      let precision = row.location_precision;
      if (lat == null || lng == null) {
        const country = resolveCountry(row.country);
        if (!country) continue;
        ({ lat, lng } = country);
        precision = 'country';
      }
      points.push({ ...row, lat, lng, location_precision: precision });
    }
    res.json({ points, unplaced: rows.length - points.length });
  });
  return r;
}
