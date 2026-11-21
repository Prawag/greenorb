/**
 * Import companies (and their unverified Scope 1/2/3 figures) from the GreenOrb v3 database.
 *
 *   node scripts/import-legacy.js --from-db                 # reads public.companies in DATABASE_URL
 *   node scripts/import-legacy.js --from-json ../archive/data/legacy_companies_dump.json
 *   add --dry-run to preview
 *
 * Nothing in the legacy tables is modified. Legacy figures were produced by a pipeline with known
 * unit bugs, so they are stored with method='legacy', confidence 0.3, never outrank newly extracted
 * values, and each affected company gets a LEGACY_UNVERIFIED flag asking for re-processing.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { nameKey, slugify } from '../src/http.js';
import { canonicalCountryName } from '../src/countries.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const value = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const DRY = flag('--dry-run');

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};
const clean = (s) => {
  const t = typeof s === 'string' ? s.trim() : '';
  return !t || ['unknown', 'n/a', 'na', 'none', 'null', '-'].includes(t.toLowerCase()) ? null : t;
};
const isPublicUrl = (u) => typeof u === 'string' && /^https?:\/\//i.test(u) && !/localhost|127\.0\.0\.1/i.test(u);

async function loadRows(db) {
  if (value('--from-json')) return JSON.parse(readFileSync(value('--from-json'), 'utf8'));
  if (flag('--from-db')) {
    const exists = await db.one(`SELECT to_regclass('public.companies') AS t`);
    if (!exists?.t) throw new Error('public.companies does not exist in this database.');
    return db.query(`SELECT * FROM public.companies`);
  }
  throw new Error('Use --from-db or --from-json <file>.');
}

async function main() {
  const config = loadConfig();
  const db = createDb(config);
  try {
    await migrate(db, { log: () => {} });
    const rows = await loadRows(db);
    const stats = { rows: rows.length, companies_created: 0, companies_matched: 0, skipped_names: 0, legacy_metrics: 0, rejected_values: 0, flagged_companies: 0 };

    const existing = await db.query(`SELECT id, slug, name FROM esg.companies`);
    const byKey = new Map(existing.map((c) => [nameKey(c.name), c]));

    for (const r of rows) {
      const name = clean(r.name);
      if (!name || name.length < 2 || name.length > 200 || /^\d+$/.test(name)) {
        stats.skipped_names++;
        continue;
      }
      const key = nameKey(name);
      let company = byKey.get(key);
      const sector = clean(r.sector);
      const country = canonicalCountryName(clean(r.country)) || clean(r.country);
      if (company) {
        stats.companies_matched++;
        if (!DRY) {
          await db.query(
            `UPDATE esg.companies SET sector = coalesce(sector, $2), country = coalesce(country, $3) WHERE id = $1`,
            [company.id, sector, country],
          );
        }
      } else {
        stats.companies_created++;
        if (DRY) {
          company = { id: -1, name };
        } else {
          let slug = slugify(name);
          for (let i = 2; await db.one(`SELECT 1 FROM esg.companies WHERE slug = $1`, [slug]); i++) slug = `${slugify(name)}-${i}`;
          const lat = num(r.lat);
          const lng = num(r.lng);
          company = await db.one(
            `INSERT INTO esg.companies (slug, name, sector, country, hq_city, lat, lng, location_precision)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, slug, name`,
            [slug, name, sector, country, clean(r.city), lat, lng, lat != null && lng != null ? 'city' : null],
          );
        }
        byKey.set(key, company);
      }

      const year = num(r.report_year);
      const figures = [
        ['ghg_scope1', num(r.s1)],
        ['ghg_scope2', num(r.s2)],
        ['ghg_scope2_location', num(r.scope2_location)],
        ['ghg_scope2_market', num(r.scope2_market)],
        ['ghg_scope3', num(r.s3)],
      ].filter(([, v]) => v !== null);
      if (!year || year < 2000 || year > 2030 || !figures.length || DRY || company.id < 0) {
        stats.legacy_metrics += year ? figures.length : 0;
        continue;
      }
      const good = figures.filter(([, v]) => v > 0 && v < 2e9);
      stats.rejected_values += figures.length - good.length;
      if (!good.length) continue;

      await db.tx(async (q) => {
        const sourceUrl = isPublicUrl(r.report_url) ? r.report_url : isPublicUrl(r.url) ? r.url : null;
        let report = await q.one(`SELECT id FROM esg.reports WHERE company_id = $1 AND source_type = 'legacy' AND fiscal_year = $2`, [company.id, year]);
        if (!report) {
          report = await q.one(
            `INSERT INTO esg.reports (company_id, title, source_url, source_type, fiscal_year, status, assurance_level)
             VALUES ($1, $2, $3, 'legacy', $4, 'legacy', 'unknown') RETURNING id`,
            [company.id, `Imported from GreenOrb v3 (FY${year})`, sourceUrl, year],
          );
        }
        await q.query(`DELETE FROM esg.metrics WHERE report_id = $1 AND method = 'legacy'`, [report.id]);
        for (const [metric, v] of good) {
          await q.query(
            `INSERT INTO esg.metrics (company_id, report_id, metric, fiscal_year, value, unit, raw_value, method, confidence, grounded, notes)
             VALUES ($1,$2,$3,$4,$5,'tCO2e',$6,'legacy',0.3,false,$7)`,
            [company.id, report.id, metric, year, v, String(v),
              'Imported from the GreenOrb v3 database. Not verified against the source document; the old pipeline had unit-conversion bugs.'],
          );
          stats.legacy_metrics++;
        }
        const hasFlag = await q.one(`SELECT 1 FROM esg.flags WHERE company_id = $1 AND code = 'LEGACY_UNVERIFIED'`, [company.id]);
        if (!hasFlag) {
          await q.query(
            `INSERT INTO esg.flags (company_id, report_id, code, severity, title, detail, evidence)
             VALUES ($1,$2,'LEGACY_UNVERIFIED','info','Figures imported from GreenOrb v3 are unverified',
             'These numbers came from the previous extraction pipeline, which could inflate values by 1,000x or 1,000,000x. Ingest the source report to replace them with cited figures.', $3)`,
            [company.id, report.id, JSON.stringify({ legacy_values: Object.fromEntries(good) })],
          );
          stats.flagged_companies++;
        }
        await q.query(`SELECT esg.recompute_primary($1)`, [company.id]);
      });
    }
    console.log(`[import-legacy] ${DRY ? '(dry run) ' : ''}${JSON.stringify(stats, null, 2)}`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error('[import-legacy] failed:', err.message);
  process.exit(1);
});
