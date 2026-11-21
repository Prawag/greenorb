import NodeCache from 'node-cache';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const cache = new NodeCache({ stdTTL: 900 }); // 15 min TTL

// Load country centroids for geo-location fallback
let CENTROIDS = {};
try {
    CENTROIDS = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'country_centroids.json'), 'utf8'));
} catch (e) {
    console.warn('[gdelt] country_centroids.json not found, geo-location fallback disabled');
}

// Map TLD / sourcecountry strings to ISO2 codes
const COUNTRY_MAP = {
    'united states': 'US', 'india': 'IN', 'china': 'CN', 'united kingdom': 'GB',
    'germany': 'DE', 'france': 'FR', 'japan': 'JP', 'australia': 'AU',
    'brazil': 'BR', 'canada': 'CA', 'russia': 'RU', 'south africa': 'ZA',
    'south korea': 'KR', 'mexico': 'MX', 'indonesia': 'ID', 'nigeria': 'NG',
    'saudi arabia': 'SA', 'italy': 'IT', 'spain': 'ES', 'netherlands': 'NL',
    'sweden': 'SE', 'switzerland': 'CH', 'turkey': 'TR', 'thailand': 'TH',
    'pakistan': 'PK', 'bangladesh': 'BD', 'vietnam': 'VN',
};

function geolocateArticle(article) {
    // Priority 1: GDELT provides ActionGeo coordinates
    if (article.ActionGeo_Lat && article.ActionGeo_Long) {
        return { lat: parseFloat(article.ActionGeo_Lat), lng: parseFloat(article.ActionGeo_Long) };
    }

    // Priority 2: Look up country from sourcecountry or URL TLD
    let iso2 = null;
    const src = (article.sourcecountry || '').toLowerCase();
    if (src && COUNTRY_MAP[src]) {
        iso2 = COUNTRY_MAP[src];
    } else {
        // Try to extract from domain TLD
        const domain = article.domain || article.url || '';
        const tldMatch = domain.match(/\.([a-z]{2})(?:\/|$)/);
        if (tldMatch) {
            const tld = tldMatch[1].toUpperCase();
            if (CENTROIDS[tld]) iso2 = tld;
        }
    }

    if (iso2 && CENTROIDS[iso2]) {
        // Add small random offset to prevent stacking
        return {
            lat: CENTROIDS[iso2].lat + (Math.random() - 0.5) * 4,
            lng: CENTROIDS[iso2].lng + (Math.random() - 0.5) * 4,
        };
    }

    return null; // No geo-location possible
}

export default function mountGdelt(sql) {
    return async (req, res) => {
        const cached = cache.get('gdelt');
        if (cached) return res.json(cached);

        try {
            const gdeltUrl = 'https://api.gdeltproject.org/api/v2/doc/doc?query=(climate OR ESG OR greenwashing OR emissions OR "carbon footprint")&mode=artlist&maxrecords=50&format=json';
            const response = await fetch(gdeltUrl);
            const json = await response.json();
            const articles = json.articles || [];

            const companies = await sql`SELECT name FROM companies`;
            const processed = [];

            for (const article of articles) {
                const text = ((article.title || "") + " " + (article.seendate || "")).toLowerCase();
                let relevance = 0;
                if (text.includes("climate")) relevance += 30;
                if (text.includes("esg")) relevance += 30;
                if (text.includes("greenwash")) relevance += 40;
                if (text.includes("emission")) relevance += 20;
                if (text.includes("carbon")) relevance += 20;
                relevance = Math.min(100, relevance);

                let matchedCompany = null;
                for (const c of companies) {
                    if (c.name && text.includes(c.name.toLowerCase())) {
                        matchedCompany = c.name;
                        break;
                    }
                }

                let sentiment = 0;
                if (text.match(/fraud|penalty|greenwash|lawsuit|investigate|fine/)) {
                    sentiment = -0.8;
                } else if (text.match(/award|leader|offset|commit/)) {
                    sentiment = 0.5;
                }

                if (matchedCompany) {
                    try {
                        const [comp] = await sql`SELECT id FROM companies WHERE name = ${matchedCompany} LIMIT 1`;
                        if (comp?.id) {
                            await sql`
                                INSERT INTO news_articles (url, title, domain, seen_date, company_id, relevance_score, sentiment_score)
                                VALUES (${article.url}, ${article.title}, ${article.domain}, ${article.seendate}, ${comp.id}, ${relevance}, ${sentiment})
                                ON CONFLICT (url) DO NOTHING
                            `;
                        }
                    } catch (e) { /* Silent fail */ }
                }

                // Geo-locate the article
                const geo = geolocateArticle(article);

                processed.push({
                    ...article,
                    relevance_score: relevance,
                    matchedCompany,
                    sentiment_score: sentiment,
                    lat: geo?.lat || null,
                    lng: geo?.lng || null,
                });
            }

            const responsePayload = {
                data: processed,
                cached_at: new Date().toISOString(),
                stale: false,
                source: 'GDELT GKG v2',
                ttl: 900
            };
            cache.set('gdelt', responsePayload);
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
