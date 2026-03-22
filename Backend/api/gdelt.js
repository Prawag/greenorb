import NodeCache from 'node-cache';
// GDELT API route for GreenOrb
// Polls GDELT GKG v2, scores ESG relevance, matches companies, and neg-caches.

const cache = new NodeCache({ stdTTL: 900 }); // 15 min TTL

export default function mountGdelt(sql) {
    return async (req, res) => {
        const cached = cache.get('gdelt');
        if (cached) return res.json(cached);

        try {
            // Target ESG, greenwashing, and climate keywords
            const gdeltUrl = 'https://api.gdeltproject.org/api/v2/doc/doc?query=(climate OR ESG OR greenwashing OR emissions OR "carbon footprint")&mode=artlist&maxrecords=50&format=json';
            const response = await fetch(gdeltUrl);
            const json = await response.json();
            const articles = json.articles || [];

            const companies = await sql`SELECT name FROM companies`;
            const processed = [];

            for (const article of articles) {
                // Score ESG relevance 0-100
                const text = ((article.title || "") + " " + (article.seendate || "")).toLowerCase();
                let relevance = 0;
                if (text.includes("climate")) relevance += 30;
                if (text.includes("esg")) relevance += 30;
                if (text.includes("greenwash")) relevance += 40;
                if (text.includes("emission")) relevance += 20;
                if (text.includes("carbon")) relevance += 20;
                relevance = Math.min(100, relevance);

                // Match articles to companies by string name (very naive match for MVP)
                let matchedCompany = null;
                for (const c of companies) {
                    if (c.name && text.includes(c.name.toLowerCase())) {
                        matchedCompany = c.name;
                        break;
                    }
                }

                // Keyword-based sentiment heuristic
                let sentiment = 0;
                if (text.match(/fraud|penalty|greenwash|lawsuit|investigate|fine/)) {
                    sentiment = -0.8;
                } else if (text.match(/award|leader|offset|commit/)) {
                    sentiment = 0.5;
                }

                if (matchedCompany) {
                    try {
                        await sql`
                            INSERT INTO news_articles (url, title, domain, seen_date, language, source_country, relevance_score, sentiment_score, company_id)
                            VALUES (${article.url}, ${article.title}, ${article.domain}, ${article.seendate}, ${article.language}, ${article.sourcecountry}, ${relevance}, ${sentiment}, ${matchedCompany})
                            ON CONFLICT (url) DO NOTHING
                        `;
                    } catch (e) { console.error("gdelt DB insert error:", e); }
                }

                processed.push({ ...article, relevance_score: relevance, matchedCompany, sentiment_score: sentiment });
            }

            const responsePayload = {
                data: processed,
                cached_at: new Date().toISOString(),
                stale: false,
                source: 'GDELT GKG v2',
                ttl: 900
            };
            
            cache.set('gdelt', responsePayload);
            // Backup for negative caching
            cache.set('gdelt_fallback', { ...responsePayload, stale: true });
            
            res.json(responsePayload);
        } catch (error) {
            console.error("GDELT API Error:", error.message);
            const fallback = cache.get('gdelt_fallback') || { data: [] };
            res.json({
                ...fallback,
                cached_at: new Date().toISOString(),
                stale: true,
                error: error.message,
                source: 'GDELT GKG v2',
                ttl: 900
            });
        }
    };
}
