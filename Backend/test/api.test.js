/**
 * Integration tests against a real Postgres. Set TEST_DATABASE_URL (the schema `esg` is dropped
 * and recreated). Skipped when it is not set.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db.js';
import { hasVectorColumn, migrate } from '../src/migrate.js';
import { createLlm } from '../src/services/llm.js';
import { createApp } from '../src/app.js';
import { checkPublicUrl } from '../src/routes/ingest.js';
import { nameKey, slugify } from '../src/http.js';

const url = process.env.TEST_DATABASE_URL;
const TOKEN = 'test-reviewer-token-0123456789';
const auth = { authorization: `Bearer ${TOKEN}` };
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

describe('pure helpers', () => {
  it('slugifies and normalises company names', () => {
    expect(slugify('Tata Steel Ltd.')).toBe('tata-steel-ltd');
    expect(nameKey('TATA STEEL LIMITED')).toBe(nameKey('Tata Steel Ltd.'));
    expect(slugify('Procter & Gamble')).toBe('procter-and-gamble');
  });
  it('blocks private and malformed URLs', () => {
    expect(checkPublicUrl('https://example.com/r.pdf')).toBeNull();
    for (const bad of ['http://localhost/a.pdf', 'http://127.0.0.1/a', 'http://10.0.0.5/a', 'http://169.254.169.254/latest', 'file:///etc/passwd', 'http://user:pw@example.com/', 'http://intranet/a', 'http://[::1]/a']) {
      expect(checkPublicUrl(bad)).not.toBeNull();
    }
  });
});

describe.skipIf(!url)('API (Postgres)', () => {
  let db;
  let app;
  let llmCalls = 0;

  beforeAll(async () => {
    const config = loadConfig({ DATABASE_URL: url, ADMIN_TOKEN: TOKEN, NODE_ENV: 'test', GROQ_API_KEY: 'k', RATE_LIMIT_PER_MIN: '10000', ASK_RATE_LIMIT_PER_MIN: '1000' });
    db = createDb(config);
    await db.query('DROP SCHEMA IF EXISTS esg CASCADE');
    await migrate(db, { log: () => {} });
    const fakeFetch = async () => {
      llmCalls++;
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Scope 1 was 856,434 tCO2e in FY2024 [1].' } }] }), { status: 200 });
    };
    const llm = createLlm(config, { fetchImpl: fakeFetch });
    app = createApp({ db, config, llm, features: { vector: await hasVectorColumn(db) } });
  });
  afterAll(async () => db && db.close());

  it('reports health', async () => {
    const r = await request(app).get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body.database).toBe(true);
    expect(r.body.features.reviewer_enabled).toBe(true);
  });

  it('requires a reviewer token to ingest', async () => {
    const r = await request(app).post('/api/ingest').field('company_name', 'Acme').field('url', 'https://example.com/a.pdf');
    expect(r.status).toBe(401);
  });

  it('rejects private URLs and non-PDF uploads', async () => {
    const a = await request(app).post('/api/ingest').set(auth).field('company_name', 'Acme').field('url', 'http://127.0.0.1/a.pdf');
    expect(a.status).toBe(400);
    const b = await request(app).post('/api/ingest').set(auth).field('company_name', 'Acme').attach('file', Buffer.from('hello'), 'x.pdf');
    expect(b.status).toBe(415);
  });

  let reportId;
  let companySlug;
  it('queues an uploaded PDF and de-duplicates resubmissions', async () => {
    const r = await request(app).post('/api/ingest').set(auth).field('company_name', 'Atul Ltd.').field('country', 'IN').attach('file', PDF, 'atul.pdf');
    expect(r.status).toBe(202);
    expect(r.body.company.slug).toBe('atul-ltd');
    reportId = r.body.report_id;
    companySlug = r.body.company.slug;
    const job = await request(app).get(`/api/jobs/${r.body.job_id}`);
    expect(job.body.status).toBe('queued');
    const again = await request(app).post('/api/ingest').set(auth).field('company_name', 'ATUL LIMITED').attach('file', PDF, 'again.pdf');
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    expect(again.body.report_id).toBe(reportId);
    const company = await request(app).get(`/api/companies/${companySlug}`);
    expect(company.body.company.country).toBe('India');
  });

  it('serves the stored PDF for citations', async () => {
    const r = await request(app).get(`/api/reports/${reportId}/file`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('application/pdf');
  });

  it('exposes metrics, primaries and the disclosure score', async () => {
    const c = await db.one(`SELECT id FROM esg.companies WHERE slug = $1`, [companySlug]);
    await db.query(`UPDATE esg.reports SET status = 'processed', fiscal_year = 2024, assurance_level = 'limited' WHERE id = $1`, [reportId]);
    await db.query(
      `INSERT INTO esg.metrics (company_id, report_id, metric, fiscal_year, value, unit, raw_value, page, quote, method, confidence, grounded)
       VALUES ($1,$2,'ghg_scope1',2024,856434,'tCO2e','8,56,434',17,'Total Scope 1 emissions | tCO2e | 8,56,434','table',0.87,true),
              ($1,$2,'ghg_scope1',2024,900000,'tCO2e','9,00,000',18,'alt','llm',0.6,true),
              ($1,$2,'ghg_scope2',2024,83179,'tCO2e','83,179',17,'Total Scope 2 emissions','table',0.87,true)`,
      [c.id, reportId],
    );
    await db.query(`INSERT INTO esg.chunks (report_id, company_id, page, content) VALUES ($1,$2,17,'Total Scope 1 emissions were 8,56,434 tCO2e in FY 2023-24 from fuel combustion.')`, [reportId, c.id]);
    await db.query(`SELECT esg.recompute_primary($1)`, [c.id]);
    const list = await request(app).get('/api/companies?q=atul');
    expect(list.body.total).toBe(1);
    expect(list.body.data[0].scope1).toBe(856434);
    expect(list.body.data[0].disclosure_score).toBe(20 + 20 + 10);
    const detail = await request(app).get(`/api/companies/${companySlug}`);
    const s1 = detail.body.metrics.find((m) => m.key === 'ghg_scope1');
    expect(s1.points).toHaveLength(1);
    expect(s1.points[0].page).toBe(17);
  });

  it('lets a reviewer verify a value, which then becomes primary', async () => {
    const alt = await db.one(`SELECT id FROM esg.metrics WHERE value = 900000`);
    const denied = await request(app).patch(`/api/metrics/${alt.id}`).send({ status: 'verified' });
    expect(denied.status).toBe(401);
    const ok = await request(app).patch(`/api/metrics/${alt.id}`).set(auth).send({ status: 'verified', note: 'checked p.18' });
    expect(ok.status).toBe(200);
    const list = await request(app).get('/api/companies?q=atul');
    expect(list.body.data[0].scope1).toBe(900000);
    const log = await db.one(`SELECT count(*) AS n FROM esg.audit_log WHERE entity = 'metric'`);
    expect(log.n).toBe(1);
  });

  it('reviews flags', async () => {
    const c = await db.one(`SELECT id FROM esg.companies WHERE slug = $1`, [companySlug]);
    const f = await db.one(
      `INSERT INTO esg.flags (company_id, report_id, code, severity, title) VALUES ($1,$2,'NO_ASSURANCE','medium','x') RETURNING id`,
      [c.id, reportId],
    );
    const open = await request(app).get('/api/flags');
    expect(open.body.total).toBe(1);
    const r = await request(app).post(`/api/flags/${f.id}/review`).set(auth).send({ status: 'dismissed', note: 'assurance on p.40' });
    expect(r.status).toBe(200);
    expect((await request(app).get('/api/flags')).body.total).toBe(0);
  });

  it('answers questions with cited passages', async () => {
    const r = await request(app).post('/api/ask').send({ company: companySlug, question: 'What were scope 1 emissions?' });
    expect(r.status).toBe(200);
    expect(r.body.mode).toBe('generative');
    expect(r.body.sources[0].page).toBe(17);
    expect(llmCalls).toBe(1);
  });

  it('treats hostile input as data', async () => {
    const r = await request(app).get(`/api/companies?q=${encodeURIComponent("x'; DROP SCHEMA esg CASCADE; --")}&sort=name`);
    expect(r.status).toBe(200);
    const bad = await request(app).get('/api/companies?sort=name;drop');
    expect(bad.status).toBe(400);
    expect((await request(app).get('/api/health')).body.database).toBe(true);
  });

  it('returns JSON 404s', async () => {
    const r = await request(app).get('/api/nope');
    expect(r.status).toBe(404);
    expect(r.body.error).toMatch(/No route/);
  });
});
