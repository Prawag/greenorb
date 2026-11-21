import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.DATABASE_URL);

/**
 * Compatibility helper for pg-style db.query(text, params)
 * using the Neon serverless driver.
 * Neon's sql.query() returns rows directly as an array.
 */
export default {
  query: async (text, params = []) => {
    try {
      const result = await sql.query(text, params);
      // Neon returns rows as a plain array
      const rows = Array.isArray(result) ? result : (result?.rows || []);
      return { rows };
    } catch (err) {
      console.error('[db] Query error:', err.message);
      throw err;
    }
  }
};
