import express from 'express';
import NodeCache from 'node-cache';
import pool from '../db.js';

const router = express.Router();
const cache = new NodeCache({ stdTTL: 3600 }); // 1 hour

router.get('/:name/news', async (req, res) => {
  const { name } = req.params;
  const limit = parseInt(req.query.limit) || 10;
  const cacheKey = `news_${name}_${limit}`;

  if (cache.has(cacheKey)) {
    return res.json({ data: cache.get(cacheKey) });
  }

  try {
    // 1. In a real app we'd fetch from GDELT or Google News via RSS here
    // We'll simulate this by returning dummy articles flavored for the company
    
    // Fallback: check our own database if we have an esg_news table
    let dbArticles = [];
    try {
        const client = await pool.connect();
        const result = await client.query(
            "SELECT * FROM pga_stat_activity limit 0;" // Fake query to test DB
        );
        client.release();
    } catch(e) {
        // ignore
    }

    const positive_keywords = ["renewable", "net zero", "carbon neutral", "sustainability award", "green"];
    const negative_keywords = ["greenwashing", "fine", "violation", "penalty", "pollution", "controversy"];

    const mockTitles = [
      `${name} announces new net zero commitment for 2050`,
      `Environmental groups allege greenwashing in ${name}'s latest sustainability report`,
      `${name} invests $100M in renewable energy transition`,
      `Regulatory probe into ${name} pollution violations continues`,
      `Analysis: ${name}'s Scope 3 emissions remain largely unaccounted for`,
      `${name} wins sustainability award for water conservation efforts`,
      `New ESG fund drops ${name} over controversy`,
      `${name} launches green bond framework`
    ];

    const generateArticles = () => {
        const count = Math.min(limit, mockTitles.length);
        const shuffled = mockTitles.sort(() => 0.5 - Math.random()).slice(0, count);
        
        return shuffled.map(title => {
            let pCount = positive_keywords.filter(k => title.toLowerCase().includes(k)).length;
            let nCount = negative_keywords.filter(k => title.toLowerCase().includes(k)).length;
            
            // Randomize a bit more
            if (pCount === 0 && nCount === 0) {
                if (Math.random() > 0.5) pCount++;
                else nCount++;
            }

            return {
                title,
                url: `https://news.example.com/article/${Math.floor(Math.random()*10000)}`,
                source: Math.random() > 0.5 ? "Financial Times" : "Reuters ESG",
                published_at: new Date(Date.now() - Math.random() * 10000000000).toISOString(),
                sentiment_score: pCount - nCount,
                keywords_matched: [
                    ...positive_keywords.filter(k => title.toLowerCase().includes(k)),
                    ...negative_keywords.filter(k => title.toLowerCase().includes(k))
                ]
            };
        });
    };

    const articles = generateArticles();
    
    // Sort by most recent
    articles.sort((a,b) => new Date(b.published_at) - new Date(a.published_at));

    cache.set(cacheKey, articles);
    res.json({ data: articles });

  } catch (error) {
    console.error(`Error fetching news for ${name}:`, error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
