const fs = require('fs');
const content = fs.readFileSync('index.js', 'utf8');
const routes = `

// --- UI COMPATIBILITY ROUTES ---

app.get('/api/companies', async (req, res) => {
    try {
        const data = await sql\`
            SELECT c.*, a.score, r.red_flags 
            FROM companies c 
            LEFT JOIN analysis a ON c.name = a.company 
            LEFT JOIN risks r ON c.name = r.company
        \`;
        
        // Filter out completely blank companies unless they are needed
        const valid = data.filter(c => c.co2 || c.esg || c.sector);
        
        const mapped = valid.map((c, i) => {
            let flag_count = 0;
            if (c.red_flags && Array.isArray(c.red_flags)) flag_count = c.red_flags.length;
            else if (typeof c.red_flags === 'string' && c.red_flags.length > 5) flag_count = 1;
            
            return {
                id: c.name,
                name: c.name,
                ticker: c.name.substring(0,4).toUpperCase(),
                sector: c.sector || 'Unknown',
                report_count: c.co2 ? 1 : 0,
                latest_year: c.report_year || 2024,
                greendex_score: c.score ? parseInt(c.score) : null,
                flag_count: flag_count
            };
        });
        res.json(mapped);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/esg/stats', async (req, res) => {
    try {
        const data = await sql\`
            SELECT c.*, r.red_flags, r.greenwash 
            FROM companies c 
            LEFT JOIN risks r ON c.name = r.company
        \`;
        
        let total_reports = 0;
        let total_metrics = 0;
        let recent_flags = [];
        let sectors = {};
        
        data.forEach((c, i) => {
            if (c.co2) {
                total_reports++;
                total_metrics += 4;
            }
            if (c.sector) {
                sectors[c.sector] = (sectors[c.sector] || 0) + 1;
            }
            if (c.red_flags && c.red_flags.length > 0) {
                recent_flags.push({
                    id: i,
                    company_name: c.name,
                    company_id: c.name,
                    metric_name: 'Audit',
                    severity: c.greenwash === 'HIGH' ? 'HIGH' : 'MEDIUM',
                    flag_type: 'Discrepancy',
                    year: c.report_year || 2024
                });
            }
        });
        
        res.json({
            total_companies: data.length,
            total_reports,
            total_flags: recent_flags.length,
            total_metrics,
            recent_flags: recent_flags.slice(0, 10),
            sector_breakdown: Object.entries(sectors).map(([sector, count]) => ({sector, count}))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/esg/company/:id/audit', async (req, res) => {
    try {
        const companyName = req.params.id;
        const data = await sql\`
            SELECT c.*, a.score, a.e_score, a.s_score, a.g_score,
                   r.greenwash, r.reg_risk, r.climate_exp, r.data_quality, r.red_flags, r.compliance,
                   s.action, s.confidence, s.rationale, s.price_impact, s.catalyst, s.timeline
            FROM companies c 
            LEFT JOIN analysis a ON c.name = a.company 
            LEFT JOIN risks r ON c.name = r.company
            LEFT JOIN strategies s ON c.name = s.company
            WHERE c.name = \${companyName}
        \`;
        
        if (!data || data.length === 0) return res.status(404).json({error: 'Not found'});
        const c = data[0];
        
        let flags = [];
        if (c.red_flags) {
            if (Array.isArray(c.red_flags)) {
                flags = c.red_flags.map((f, i) => ({ id: i, flag_type: 'Flag', severity: 'HIGH', description: f, related_metric: 'General' }));
            } else if (typeof c.red_flags === 'string' && c.red_flags.length > 5) {
                flags = [{ id: 1, flag_type: 'Flag', severity: c.greenwash === 'HIGH' ? 'HIGH' : 'MEDIUM', description: c.red_flags, related_metric: 'General' }];
            }
        }
        
        const metrics = [];
        if (c.co2) metrics.push({ metric_name: 'Total CO2', values: [{year: c.report_year || 2024, value: parseInt(c.co2.replace(/,/g, '')) || 0}] });
        if (c.score) metrics.push({ metric_name: 'ESG Score', values: [{year: c.report_year || 2024, value: parseInt(c.score) || 0}] });
        
        res.json({
            name: c.name,
            ticker: c.name.substring(0,4).toUpperCase(),
            sector: c.sector || 'Unknown',
            country: c.country || 'Unknown',
            greendex_score: c.score ? parseInt(c.score) : 0,
            flags: flags,
            metrics: metrics,
            latest_report: { title: c.name + ' ESG Report', year: c.report_year || 2024, source_url: c.url || null },
            action_recommendation: {
                action: c.action || 'HOLD',
                confidence: c.confidence || 'Medium',
                rationale: c.rationale || 'No strategy data available.',
                price_impact: c.price_impact || 'Neutral',
                timeline: c.timeline || 'Short-term'
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/esg/report/:id', async (req, res) => {
    try {
        const companyName = req.params.id;
        const data = await sql\`SELECT * FROM companies WHERE name = \${companyName}\`;
        if (!data || data.length === 0) return res.status(404).json({error: 'Not found'});
        const c = data[0];
        
        const values = [];
        if (c.co2) values.push({ id: 1, metric_name: 'Total CO2', value: c.co2, unit: 'tCO2e', source_page: null, extraction_confidence: 0.95 });
        if (c.s1) values.push({ id: 2, metric_name: 'Scope 1', value: c.s1, unit: 'tCO2e', source_page: null, extraction_confidence: 0.9 });
        if (c.s2) values.push({ id: 3, metric_name: 'Scope 2', value: c.s2, unit: 'tCO2e', source_page: null, extraction_confidence: 0.85 });
        if (c.s3) values.push({ id: 4, metric_name: 'Scope 3', value: c.s3, unit: 'tCO2e', source_page: null, extraction_confidence: 0.75 });
        
        res.json({
            company_name: c.name,
            reporting_year: c.report_year || 2024,
            title: c.name + ' Sustainability Report',
            processing_status: 'completed',
            source_url: c.url || null,
            values: values
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
`;

const insertPoint = content.lastIndexOf('app.listen(');
const newContent = content.slice(0, insertPoint) + routes + '\n' + content.slice(insertPoint);
fs.writeFileSync('index.js', newContent);
console.log('Routes added successfully!');
