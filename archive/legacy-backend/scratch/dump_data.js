import db from '../db.js';

async function run() {
    try {
        // 1. Total count
        const { rows: countRows } = await db.query('SELECT COUNT(*) as total FROM companies');
        const total = parseInt(countRows[0]?.total || 0, 10);

        // 2. Records with actual extracted data (at least one metric non-null)
        const { rows: richRows } = await db.query(`
            SELECT COUNT(*) as rich FROM companies 
            WHERE co2 IS NOT NULL OR s1 IS NOT NULL OR s2 IS NOT NULL OR s3 IS NOT NULL 
               OR revenue IS NOT NULL OR profit IS NOT NULL 
               OR water_withdrawal IS NOT NULL OR energy_consumption IS NOT NULL
        `);
        const rich = parseInt(richRows[0]?.rich || 0, 10);

        // 3. Records with scope emissions
        const { rows: scopeRows } = await db.query(`
            SELECT COUNT(*) as cnt FROM companies WHERE s1 IS NOT NULL OR s2 IS NOT NULL OR s3 IS NOT NULL
        `);

        // 4. Records with financials
        const { rows: finRows } = await db.query(`
            SELECT COUNT(*) as cnt FROM companies WHERE revenue IS NOT NULL OR profit IS NOT NULL
        `);

        // 5. Top 50 richest records (most metrics filled)
        const { rows: top50 } = await db.query(`
            SELECT 
                name, sector, report_year, revenue, profit, co2, s1, s2, s3, 
                water_withdrawal, energy_consumption,
                (CASE WHEN co2 IS NOT NULL THEN 1 ELSE 0 END +
                 CASE WHEN s1 IS NOT NULL THEN 1 ELSE 0 END +
                 CASE WHEN s2 IS NOT NULL THEN 1 ELSE 0 END +
                 CASE WHEN s3 IS NOT NULL THEN 1 ELSE 0 END +
                 CASE WHEN revenue IS NOT NULL THEN 1 ELSE 0 END +
                 CASE WHEN profit IS NOT NULL THEN 1 ELSE 0 END +
                 CASE WHEN water_withdrawal IS NOT NULL THEN 1 ELSE 0 END +
                 CASE WHEN energy_consumption IS NOT NULL THEN 1 ELSE 0 END) as metric_count
            FROM companies
            ORDER BY metric_count DESC, created_at DESC
            LIMIT 50
        `);

        // 6. Sector breakdown
        const { rows: sectorRows } = await db.query(`
            SELECT sector, COUNT(*) as cnt FROM companies 
            WHERE sector IS NOT NULL AND sector != 'Unknown' AND sector != '-' AND sector != ''
            GROUP BY sector ORDER BY cnt DESC LIMIT 20
        `);

        // Build artifact
        let md = `# 🌍 GreenOrb ESG Extraction Dashboard\n\n`;
        md += `> Data extracted by the GreenOrb Layered Pipeline (pdfmux → PyMuPDF/OCR → Regex/Tables → Llama 3.2)\n\n`;
        md += `## 📊 Database Summary\n\n`;
        md += `| Metric | Count |\n`;
        md += `|---|---|\n`;
        md += `| Total Company Records | **${total.toLocaleString()}** |\n`;
        md += `| Records with ESG/Financial Data | **${rich.toLocaleString()}** |\n`;
        md += `| Records with Scope Emissions (S1/S2/S3) | **${parseInt(scopeRows[0]?.cnt || 0).toLocaleString()}** |\n`;
        md += `| Records with Financials (Revenue/Profit) | **${parseInt(finRows[0]?.cnt || 0).toLocaleString()}** |\n`;
        md += `| Empty/Placeholder Records | **${(total - rich).toLocaleString()}** |\n\n`;

        // Sector breakdown
        if (sectorRows.length > 0) {
            md += `## 🏭 Sector Breakdown (Top 20)\n\n`;
            md += `| Sector | Companies |\n`;
            md += `|---|---|\n`;
            for (const s of sectorRows) {
                md += `| ${s.sector} | ${s.cnt} |\n`;
            }
            md += `\n`;
        }

        // Top 50 richest records
        md += `## 🏆 Top 50 Records by Data Richness\n\n`;
        md += `These companies have the most ESG metrics successfully extracted.\n\n`;
        md += `| # | Company | Year | Sector | Revenue | Profit | CO2 | S1 | S2 | S3 | Water | Energy | Metrics |\n`;
        md += `|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
        
        const fmt = (n) => n != null ? Number(n).toLocaleString() : '-';
        
        top50.forEach((r, i) => {
            md += `| ${i+1} | ${r.name || '-'} | ${r.report_year || '-'} | ${r.sector || '-'} | ${fmt(r.revenue)} | ${fmt(r.profit)} | ${fmt(r.co2)} | ${fmt(r.s1)} | ${fmt(r.s2)} | ${fmt(r.s3)} | ${fmt(r.water_withdrawal)} | ${fmt(r.energy_consumption)} | **${r.metric_count}/8** |\n`;
        });

        // Write artifact
        const fs = await import('fs');
        const artifactPath = 'C:\\Users\\prawa\\.gemini\\antigravity\\brain\\b1327a0a-9447-453a-ad95-77d941d9d5c1\\processed_esg_data_table.md';
        fs.writeFileSync(artifactPath, md);
        console.log(`✅ Dashboard artifact written with ${top50.length} top records.`);
        console.log(`📊 Total: ${total} | Rich: ${rich} | Scopes: ${scopeRows[0]?.cnt} | Financials: ${finRows[0]?.cnt}`);

    } catch (err) {
        console.error('❌ Error:', err);
    }
}

run().then(() => process.exit(0));
