// GET /api/globe/news-velocity
// Polls 8 free ESG RSS feeds, matches company names, computes mention velocity.

import NodeCache from 'node-cache';
import Parser from 'rss-parser';

const cache = new NodeCache({ stdTTL: 900, checkperiod: 60 });
const CACHE_KEY = 'globe_news_velocity';
const parser = new Parser({ timeout: 10000 });

const COUNTRY_CENTROIDS = {
  "India":   [20.5937, 78.9629],
  "China":   [35.8617, 104.1954],
  "USA":     [37.0902, -95.7129],
  "UAE":     [23.4241, 53.8478],
  "Germany": [51.1657, 10.4515],
  "UK":      [55.3781, -3.4360],
  "Japan":   [36.2048, 138.2529],
};

const RSS_FEEDS = [
  'https://www.greenbiz.com/feed',
  'https://feeds.feedburner.com/businessgreen',
  'https://www.edie.net/feed/',
  'https://www.environmentalleader.com/feed/',
  'https://feeds.reuters.com/reuters/environment',
  'https://rss.cnn.com/rss/edition_world.rss',
  'https://feeds.feedburner.com/ndtv/environmental-news',
  'https://timesofindia.indiatimes.com/rssfeeds/2647163.cms',
];

async function fetchFeed(url) {
  try {
    const feed = await parser.parseURL(url);
    return { items: feed.items || [], error: null };
  } catch (e) {
    console.warn(`[esg-news] Feed failed: ${url} — ${e.message}`);
    return { items: [], error: e.message };
  }
}

export default function mountEsgNews(app, sql) {
  app.get('/api/globe/news-velocity', async (req, res) => {
    const cached = cache.get(CACHE_KEY);
    if (cached) return res.json({ ...cached, stale: false });

    try {
      // Get company names from DB for matching
      let companyNames = [];
      try {
        const rows = await sql`SELECT name, country FROM companies`;
        companyNames = rows.map(r => ({ name: r.name, country: r.country }));
      } catch (e) {
        console.warn('[esg-news] DB unavailable for company matching:', e.message);
      }

      // Fetch all feeds in parallel with circuit breakers
      const feedResults = await Promise.allSettled(
        RSS_FEEDS.map(url => fetchFeed(url))
      );

      let anyFailed = false;
      const allArticles = [];
      const oneDayAgo = Date.now() - 86_400_000;

      for (const result of feedResults) {
        if (result.status === 'rejected' || result.value?.error) {
          anyFailed = true;
          continue;
        }
        for (const item of result.value.items) {
          const pubDate = item.pubDate ? new Date(item.pubDate).getTime() : 0;
          if (pubDate > oneDayAgo || !item.pubDate) {
            allArticles.push({
              title: item.title || '',
              content: (item.contentSnippet || item.content || '').substring(0, 500),
              pubDate: item.pubDate,
            });
          }
        }
      }

      // Match company names against articles
      const velocity = {};
      for (const company of companyNames) {
        const nameWords = company.name.toLowerCase();
        let count = 0;
        let latestHeadline = '';
        for (const article of allArticles) {
          const text = `${article.title} ${article.content}`.toLowerCase();
          if (text.includes(nameWords) || (nameWords.length > 5 && text.includes(nameWords.split(' ')[0]))) {
            count++;
            if (!latestHeadline) latestHeadline = article.title;
          }
        }
        if (count > 0) {
          const centroid = COUNTRY_CENTROIDS[company.country] || [0, 0];
          velocity[company.name] = {
            company_name: company.name,
            velocity: count,
            trending: count > 3,
            latest_headline: latestHeadline,
            lat: centroid[0] + (Math.random() - 0.5),
            lng: centroid[1] + (Math.random() - 0.5),
          };
        }
      }

      const data = Object.values(velocity).sort((a, b) => b.velocity - a.velocity);

      const response = {
        data,
        cached_at: new Date().toISOString(),
        stale: anyFailed,
        source: 'rss_feeds',
        ttl: 900,
        total: data.length,
        feeds_polled: RSS_FEEDS.length,
        articles_scanned: allArticles.length,
      };

      cache.set(CACHE_KEY, response);
      console.log(`[esg-news] ${allArticles.length} articles → ${data.length} matched · stale=${anyFailed}`);
      res.json(response);
    } catch (err) {
      console.error('[esg-news] Error:', err.message);
      const staleData = cache.get(CACHE_KEY);
      if (staleData) return res.json({ ...staleData, stale: true });
      res.json({
        data: [],
        cached_at: new Date().toISOString(),
        stale: true,
        source: 'rss_feeds',
        ttl: 900,
        total: 0,
        error: err.message,
      });
    }
  });
}
