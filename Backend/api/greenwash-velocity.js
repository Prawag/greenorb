import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 900 });

export default function mountGreenwashVelocity(sql) {
    return async (req, res) => {
        const cached = cache.get('gvi');
        if (cached) return res.json(cached);

        try {
            const port = process.env.PORT || 5000;
            // Calls /api/gdelt internally as specified
            const response = await fetch(`http://localhost:${port}/api/gdelt`);
            const gdeltRes = await response.json();
            const articles = gdeltRes.data || [];

            // Group articles by matched company_id
            const byCompany = {};
            for (const article of articles) {
                const c = article.matchedCompany;
                if (!c) continue;
                if (!byCompany[c]) byCompany[c] = { count: 0, sentiment: 0, latestSeen: 0, headlines: [] };
                
                byCompany[c].count++;
                byCompany[c].sentiment += (article.sentiment_score || 0);
                byCompany[c].headlines.push(article.title);
                
                // Track recency (simple string comparison for GDELT format)
                if (article.seendate && article.seendate > byCompany[c].latestSeen) {
                    byCompany[c].latestSeen = article.seendate;
                }
            }

            const results = [];
            
            for (const [company_id, stats] of Object.entries(byCompany)) {
                // article_count score -> 40% weight
                const countScore = Math.min(stats.count * 10, 100) * 0.40;
                
                // negative sentiment -> 40% weight
                // Assuming sentiment ranges from -1 to 1. Negative is riskier.
                const avgSentiment = stats.sentiment / stats.count;
                let sentimentScore = 0;
                if (avgSentiment < 0) {
                    sentimentScore = Math.abs(avgSentiment) * 100 * 0.40;
                }
                
                // recency -> 20% weight (dummy calc: 100 points for presence in recent pull)
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

                results.push({
                    company_id,
                    gvi,
                    risk_band,
                    article_count: stats.count,
                    latest_headline: stats.headlines[0],
                    // include lat/lng if we need it on frontend, but we can match by name
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
