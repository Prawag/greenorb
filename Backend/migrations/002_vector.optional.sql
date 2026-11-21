-- Optional: semantic search with pgvector (Neon and the pgvector/pgvector Docker image ship it).
-- The migration runner tries `CREATE EXTENSION vector` first and skips this file if it is
-- unavailable; Ask-the-report then uses Postgres full-text search only.
-- 768 dimensions fits Gemini gemini-embedding-001 (outputDimensionality=768),
-- Ollama nomic-embed-text and OpenAI text-embedding-3-small (dimensions=768).
ALTER TABLE esg.chunks ADD COLUMN IF NOT EXISTS embedding vector(768);
CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON esg.chunks USING hnsw (embedding vector_cosine_ops);
