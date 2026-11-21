import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

// ─── Circuit Breaker ────────────────────────────────────────
// After 3 consecutive failures, stop hitting ImportYeti for 24h
// to avoid spamming logs and getting IP-banned harder.
const breaker = {
  failures: 0,
  maxFailures: 3,
  cooldownMs: 24 * 60 * 60 * 1000, // 24 hours
  lastFailure: 0,
  isOpen() {
    if (this.failures < this.maxFailures) return false;
    if (Date.now() - this.lastFailure > this.cooldownMs) {
      // Cooldown expired, reset and allow one retry
      this.failures = 0;
      return false;
    }
    return true;
  },
  recordFailure() {
    this.failures++;
    this.lastFailure = Date.now();
  },
  recordSuccess() {
    this.failures = 0;
  }
};

export default function mountImportYeti(app, sql) {
  app.get('/api/company/:name/suppliers', async (req, res) => {
    const { name } = req.params;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    try {
      // 1. Check DB cache first (7 day TTL)
      const cached = await sql`
        SELECT * FROM company_suppliers 
        WHERE buyer_company = ${name} 
        AND fetched_at > NOW() - INTERVAL '7 days'
      `;

      if (cached.length > 0) {
        console.log(`[ImportYeti] Cache hit for ${name}`);
        return res.json({
          suppliers: cached,
          total_shipments: cached.reduce((sum, s) => sum + (s.shipment_count || 0), 0),
          source: 'importyeti (cached)',
          fetched_at: cached[0].fetched_at
        });
      }

      // 2. Check circuit breaker before attempting live fetch
      if (breaker.isOpen()) {
        console.log(`[ImportYeti] Circuit breaker OPEN — skipping live fetch for ${name} (${breaker.failures} consecutive failures)`);
        return res.json({
          suppliers: [],
          total_shipments: 0,
          source: 'importyeti (circuit_breaker_open)',
          message: 'ImportYeti is temporarily unavailable. Supply chain data will refresh automatically when the service recovers.'
        });
      }

      // 3. Fetch from ImportYeti with timeout and proper headers
      console.log(`[ImportYeti] Fetching ${slug}...`);
      const response = await fetch(`https://www.importyeti.com/company/${slug}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.importyeti.com/',
          'Cache-Control': 'no-cache'
        },
        signal: AbortSignal.timeout(15000) // 15s timeout
      });

      if (!response.ok) {
        if (response.status === 404) {
          return res.json({ suppliers: [], message: 'Company not found on ImportYeti' });
        }
        if (response.status === 403) {
          breaker.recordFailure();
          console.warn(`[ImportYeti] 403 Forbidden for ${slug} — Cloudflare blocked (failure ${breaker.failures}/${breaker.maxFailures})`);
          return res.json({
            suppliers: [],
            total_shipments: 0,
            source: 'importyeti (blocked)',
            message: 'ImportYeti is protected by Cloudflare and is currently blocking automated requests.'
          });
        }
        throw new Error(`ImportYeti responded with ${response.status}`);
      }

      // Success — reset circuit breaker
      breaker.recordSuccess();

      const html = await response.text();
      const $ = cheerio.load(html);
      const suppliers = [];

      // Parse supplier table
      $('table.table-hover tbody tr').each((i, el) => {
        if (i >= 20) return; // Top 20 only

        const cols = $(el).find('td');
        if (cols.length < 3) return;

        const supplierName = $(cols[0]).text().trim();
        const country = $(cols[1]).text().trim();
        const shipments = parseInt($(cols[2]).text().replace(/[^0-9]/g, '')) || 0;

        if (supplierName) {
          suppliers.push({
            buyer_company: name,
            supplier_name: supplierName,
            supplier_country: country,
            shipment_count: shipments,
            total_weight_kg: 0,
            hs_codes: [],
            top_ports: [],
            data_source: 'importyeti'
          });
        }
      });

      // 4. Store in DB and attempt link matching
      if (suppliers.length > 0) {
        await sql`DELETE FROM company_suppliers WHERE buyer_company = ${name}`;
        
        for (const s of suppliers) {
          await sql`
            INSERT INTO company_suppliers (
              buyer_company, supplier_name, supplier_country, shipment_count, data_source
            ) VALUES (
              ${s.buyer_company}, ${s.supplier_name}, ${s.supplier_country}, ${s.shipment_count}, ${s.data_source}
            )
          `;

          const match = await sql`SELECT name FROM companies WHERE name ILIKE ${s.supplier_name} LIMIT 1`;
          if (match.length > 0) {
            await sql`
              INSERT INTO supply_chain_links (buyer_company, supplier_company, source)
              VALUES (${name}, ${match[0].name}, 'importyeti')
              ON CONFLICT DO NOTHING
            `;
          }
        }
      }

      res.json({
        suppliers,
        total_shipments: suppliers.reduce((sum, s) => sum + s.shipment_count, 0),
        source: 'importyeti (live)',
        fetched_at: new Date().toISOString()
      });

    } catch (err) {
      breaker.recordFailure();
      console.error(`[ImportYeti] Error for ${name}: ${err.message}`);
      res.status(502).json({ 
        suppliers: [],
        error: err.message,
        message: 'ImportYeti is temporarily unreachable. Cached data may still be available.'
      });
    }
  });
}
