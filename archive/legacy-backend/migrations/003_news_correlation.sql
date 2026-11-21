CREATE TABLE IF NOT EXISTS news_articles (
    id SERIAL PRIMARY KEY,
    url TEXT UNIQUE,
    title TEXT,
    domain TEXT,
    seen_date TEXT,
    language TEXT,
    source_country TEXT,
    relevance_score INTEGER,
    sentiment_score NUMERIC,
    company_id TEXT REFERENCES companies(name) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gvi_snapshots (
    id SERIAL PRIMARY KEY,
    company_id TEXT REFERENCES companies(name) ON DELETE CASCADE,
    gvi_score INTEGER,
    risk_band TEXT,
    article_count INTEGER,
    snapshot_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_news_company ON news_articles(company_id);
CREATE INDEX IF NOT EXISTS idx_news_seen_date ON news_articles(seen_date DESC);
CREATE INDEX IF NOT EXISTS idx_news_relevance ON news_articles(relevance_score DESC);
