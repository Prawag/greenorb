import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

export default function mountImportYeti(app, sql) {
  app.get('/api/company/:name/suppliers', async (req, res) => {
    const { name } = req.params;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const cacheKey = `${name}_suppliers`;

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

      // 2. Fetch from ImportYeti
      console.log(`[ImportYeti] Fetching ${slug}...`);
      const response = await fetch(`https://www.importyeti.com/company/${slug}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          return res.json({ suppliers: [], message: 'Company not found on ImportYeti' });
        }
        throw new Error(`ImportYeti responded with ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const suppliers = [];

      // Parse supplier table - based on ImportYeti's typical structure
      // Note: Scrapers are fragile, using best-guess selectors for this demo/sprint
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
            total_weight_kg: 0, // Not always readily available in basic table
            hs_codes: [],
            top_ports: [],
            data_source: 'importyeti'
          });
        }
      });

      // 3. Store in DB and attempt link matching
      if (suppliers.length > 0) {
        // Clear old cache
        await sql`DELETE FROM company_suppliers WHERE buyer_company = ${name}`;
        
        for (const s of suppliers) {
          await sql`
            INSERT INTO company_suppliers (
              buyer_company, supplier_name, supplier_country, shipment_count, data_source
            ) VALUES (
              ${s.buyer_company}, ${s.supplier_name}, ${s.supplier_country}, ${s.shipment_count}, ${s.data_source}
            )
          `;

          // Attempt to match with existing company for network link
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
      console.error("[ImportYeti API Error]:", err.message);
      res.status(500).json({ error: err.message });
    }
  });
}
