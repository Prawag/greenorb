-- Merge companies that are the same organisation under different spellings
-- ("3I Group" / "3I Group Plc", "360 ONE WAM Ltd." / "360 ONE WAM LIMITED (formerly …)").
-- The function is also called by the worker after bulk imports, so it must stay idempotent.

-- Matching key: drop parenthetical notes, fold case and punctuation, strip legal-form suffixes.
CREATE OR REPLACE FUNCTION esg.company_key(p_name TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(
           regexp_replace(
             trim(BOTH '-' FROM regexp_replace(
               lower(replace(regexp_replace(coalesce(p_name, ''), '\([^)]*\)?', ' ', 'g'), '&', ' and ')),
               '[^a-z0-9]+', '-', 'g')),
             '-(ltd|limited|inc|incorporated|corp|corporation|plc|llc|ag|sa|nv|co|company|group|holdings?)$', ''),
           '-(ltd|limited|inc|incorporated|corp|corporation|plc|llc|ag|sa|nv|co|company|group|holdings?)$', '')
$$;

CREATE OR REPLACE FUNCTION esg.slugify(p TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT coalesce(nullif(left(trim(BOTH '-' FROM regexp_replace(lower(replace(coalesce(p, ''), '&', ' and ')), '[^a-z0-9]+', '-', 'g')), 80), ''), 'company')
$$;

CREATE INDEX IF NOT EXISTS companies_key_idx ON esg.companies (esg.company_key(name));

CREATE OR REPLACE FUNCTION esg.merge_duplicate_companies() RETURNS INT AS $$
DECLARE
  g     RECORD;
  keep  BIGINT;
  dup   BIGINT;
  best  TEXT;
  n     INT := 0;
BEGIN
  FOR g IN
    SELECT esg.company_key(c.name) AS k,
           array_agg(c.id ORDER BY
             (SELECT count(*) FROM esg.metrics m WHERE m.company_id = c.id AND m.method <> 'legacy') DESC,
             (SELECT count(*) FROM esg.reports r WHERE r.company_id = c.id) DESC,
             (c.sector IS NOT NULL) DESC,
             (c.lat IS NOT NULL) DESC,
             length(c.name),
             c.id) AS ids
      FROM esg.companies c
     WHERE length(esg.company_key(c.name)) >= 2
     GROUP BY 1
    HAVING count(*) > 1
       -- never merge two organisations that say they are in different countries
       AND count(DISTINCT nullif(nullif(lower(trim(c.country)), ''), 'unknown')) <= 1
  LOOP
    keep := g.ids[1];
    -- Display name: the plainest spelling in the group (no notes in brackets, shortest, not all caps).
    SELECT c.name INTO best FROM esg.companies c WHERE c.id = ANY(g.ids)
     ORDER BY (c.name LIKE '%(%') ASC, (c.name = upper(c.name)) ASC, length(c.name), c.id LIMIT 1;
    FOREACH dup IN ARRAY g.ids[2:array_length(g.ids, 1)] LOOP
      UPDATE esg.companies k
         SET sector   = coalesce(k.sector, d.sector),
             industry = coalesce(k.industry, d.industry),
             country  = coalesce(nullif(k.country, 'Unknown'), d.country, k.country),
             ticker   = coalesce(k.ticker, d.ticker),
             isin     = coalesce(k.isin, d.isin),
             website  = coalesce(k.website, d.website),
             hq_city  = coalesce(k.hq_city, d.hq_city),
             lat      = coalesce(k.lat, d.lat),
             lng      = coalesce(k.lng, d.lng),
             location_precision = coalesce(k.location_precision, d.location_precision),
             aliases  = (SELECT coalesce(array_agg(DISTINCT a), '{}') FROM unnest(k.aliases || d.aliases || ARRAY[d.name]) a WHERE a <> k.name)
        FROM esg.companies d
       WHERE k.id = keep AND d.id = dup;

      -- The same PDF filed under both spellings: keep one copy.
      DELETE FROM esg.reports r
       WHERE r.company_id = dup AND r.file_sha256 IS NOT NULL
         AND EXISTS (SELECT 1 FROM esg.reports x WHERE x.company_id = keep AND x.file_sha256 = r.file_sha256);

      UPDATE esg.metrics SET is_primary = false WHERE company_id = dup AND is_primary;
      UPDATE esg.reports SET company_id = keep WHERE company_id = dup;
      UPDATE esg.metrics SET company_id = keep WHERE company_id = dup;
      UPDATE esg.flags   SET company_id = keep WHERE company_id = dup;
      UPDATE esg.chunks  SET company_id = keep WHERE company_id = dup;
      UPDATE esg.jobs    SET company_id = keep WHERE company_id = dup;
      INSERT INTO esg.audit_log (actor, action, entity, entity_id, data)
        VALUES ('system', 'merge_company', 'company', keep, jsonb_build_object('merged_id', dup));
      DELETE FROM esg.companies WHERE id = dup;
      n := n + 1;
    END LOOP;
    UPDATE esg.companies k
       SET aliases = (SELECT coalesce(array_agg(DISTINCT a), '{}') FROM unnest(k.aliases || ARRAY[k.name]) a WHERE a <> best),
           name = best,
           slug = CASE WHEN EXISTS (SELECT 1 FROM esg.companies o WHERE o.slug = esg.slugify(best) AND o.id <> keep)
                       THEN k.slug ELSE esg.slugify(best) END
     WHERE k.id = keep AND k.name <> best;
    PERFORM esg.recompute_primary(keep);
  END LOOP;

  RETURN n;
END;
$$ LANGUAGE plpgsql;

SELECT esg.merge_duplicate_companies();
