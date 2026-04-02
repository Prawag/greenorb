-- Add data tiering columns to companies
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS data_tier TEXT DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS data_tier_locked BOOLEAN DEFAULT false;

-- Add bbox_hash to facilities for caching
ALTER TABLE facilities
  ADD COLUMN IF NOT EXISTS bbox_hash TEXT;

-- Create index for bbox_hash
CREATE INDEX IF NOT EXISTS idx_facilities_bbox_hash ON facilities(bbox_hash);
