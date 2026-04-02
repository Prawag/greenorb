import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 900 });

export default function mountGreenwashVelocity(sql) {
    return async (req, res) => {
        const cached = cache.get('gvi');
        if (cached) return res.json(cached);

        try {
            const port = process.env.PORT || 5000;
            const response = await fetch(`http://localhost:${port}/api/gdelt`);
            const gdeltRes = await response.json();
            const articles = gdeltRes.data || [];

            // Group articles by matched company
            const byCompany = {};
            for (const article of articles) {
                const c = article.matchedCompany;
                if (!c) continue;
                if (!byCompany[c]) byCompany[c] = { count: 0, sentiment: 0, latestSeen: 0, headlines: [] };
                byCompany[c].count++;
                byCompany[c].sentiment += (article.sentiment_score || 0);
                byCompany[c].headlines.push(article.title);
                if (article.seendate && article.seendate > byCompany[c].latestSeen) {
                    byCompany[c].latestSeen = article.seendate;
                }
            }

            // Look up company coordinates from DB
            const companyNames = Object.keys(byCompany);
            let companyCoords = {};
            if (companyNames.length > 0) {
                try {
                    const rows = await sql`
                        SELECT name, latitude, longitude 
                        FROM companies 
                        WHERE name = ANY(${companyNames})
                    `;
                    for (const r of rows) {
                        if (r.latitude && r.longitude) {
                            companyCoords[r.name] = { lat: parseFloat(r.latitude), lng: parseFloat(r.longitude) };
                        }
                    }
                } catch (e) {
                    console.warn('[GVI] Company coord lookup failed:', e.message);
                }
            }

            const results = [];
            for (const [company_id, stats] of Object.entries(byCompany)) {
                const countScore = Math.min(stats.count * 10, 100) * 0.40;
                const avgSentiment = stats.sentiment / stats.count;
                let sentimentScore = 0;
                if (avgSentiment < 0) sentimentScore = Math.abs(avgSentiment) * 100 * 0.40;
                const recencyScore = 100 * 0.20;
                const gvi = Math.round(countScore + sentimentScore + recencyScore);

                let risk_band = 'LOW';
                if (gvi >= 70) risk_band = 'CRITICAL';
                else if (gvi >= 45) risk_band = 'HIGH';
                else if (gvi >= 20) risk_band = 'MEDIUM';

                try {
                    await sql`
                        INSERT INTO gvi_snapshots (company_id, gvi_score, risk_band, article_count)
                        VALUES (${company_id}, ${gvi}, ${risk_band}, ${stats.count})
                    `;
                } catch (e) {
                    console.error("GVI DB Insert Error:", e.message);
                }

                const coords = companyCoords[company_id] || {};
                results.push({
                    company_id,
                    gvi,
                    risk_band,
                    article_count: stats.count,
                    latest_headline: stats.headlines[0],
                    lat: coords.lat || null,
                    lng: coords.lng || null,
                });
            }

            const responsePayload = {
                data: results,
                cached_at: new Date().toISOString(),
                stale: false,
                source: 'GreenOrb GVI Engine v1',
                ttl: 900
            };
            cache.set('gvi', responsePayload);
            cache.set('gvi_fallback', { ...responsePayload, stale: true });
            res.json(responsePayload);
        } catch (error) {
            console.error('GVI Engine Error:', error);
            const fallback = cache.get('gvi_fallback') || { data: [] };
            res.json({
                ...fallback,
                cached_at: new Date().toISOString(),
                stale: true,
                error: error.message,
                source: 'GreenOrb GVI Engine v1',
                ttl: 900
            });
        }
    };
}
