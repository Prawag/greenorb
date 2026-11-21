const TIER_RANK = { GOLD: 0, SILVER: 1, BRONZE: 2, UNKNOWN: 3 };

/**
 * Safely updates a company record based on data tier priority.
 * 
 * @param {Function} sql - Neon SQL instance.
 * @param {string} name - Company name.
 * @param {Object} fields - Fields to update.
 * @param {string} incoming_tier - Tier of the incoming data (GOLD, SILVER, BRONZE, UNKNOWN).
 */
export async function safeCompanyUpdate(sql, name, fields, incoming_tier) {
  const existing = await sql`SELECT data_tier, data_tier_locked FROM companies WHERE name = ${name}`;
  
  if (!existing.length) {
    // New company, insert with tier
    const keys = Object.keys(fields);
    if (keys.length === 0) return;
    
    const columns = ['name', 'data_tier', ...keys];
    const values = [name, incoming_tier, ...Object.values(fields)];
    
    // Constructing raw insert for dynamic fields since Neon template tags are tricky with dynamic keys
    // For simplicity, we'll use a manual template for common fields or just handle simple cases
    // Here we'll just insert a basic record if it doesn't exist
    await sql`INSERT INTO companies (name, data_tier) VALUES (${name}, ${incoming_tier}) ON CONFLICT DO NOTHING`;
  } else {
    const current_tier = existing[0].data_tier || 'UNKNOWN';
    const is_locked = existing[0].data_tier_locked || false;

    if (is_locked) {
      console.log(`[tier-lock] Skipping ${name}: record is manually locked.`);
      return;
    }

    if (TIER_RANK[incoming_tier] > TIER_RANK[current_tier]) {
      console.log(`[tier-lock] Skipping ${name}: incoming ${incoming_tier} cannot overwrite ${current_tier}`);
      return;
    }
  }

  // Safe to update - build dynamic update
  // We'll use a loop to update fields to avoid complex dynamic SQL builder here
  for (const [key, value] of Object.entries(fields)) {
    // Basic protection against SQL injection on keys (though keys should be trusted from our code)
    if (!/^[a-z0-9_]+$/.test(key)) continue; 
    
    // We use a workaround for dynamic column names with Neon by using a limited set of allowed columns
    // or just updating via individual queries if performance isn't the bottleneck for these background jobs.
    await sql.query(`UPDATE companies SET ${key} = $1, data_tier = $2, updated_at = CURRENT_TIMESTAMP WHERE name = $3`, [value, incoming_tier, name]);
  }
}
