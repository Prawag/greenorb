import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.DATABASE_URL);

async function populateCities() {
  console.log('Loading geo_cities lookup...');
  const cities = await sql`
    SELECT name, state, country, iso2, 
           CAST(lat AS DOUBLE PRECISION) as lat, 
           CAST(lng AS DOUBLE PRECISION) as lng 
    FROM geo_cities
  `;
  
  console.log(`Loaded ${cities.length} cities.`);

  const companies = await sql`SELECT name, country FROM companies`;
  console.log(`Processing ${companies.length} companies...`);

  let updatedCount = 0;

  for (const comp of companies) {
    // Try to find city name in company string (e.g. "Tata Steel Jamshedpur")
    const match = cities.find(city => 
      comp.name.toLowerCase().includes(city.name.toLowerCase()) &&
      (city.country.toLowerCase() === comp.country.toLowerCase() || 
       city.iso2.toLowerCase() === comp.country.toLowerCase())
    );

    if (match) {
      await sql`
        UPDATE companies 
        SET city = ${match.name},
            lat = ${match.lat},
            lng = ${match.lng},
            geocoding_source = 'city_match'
        WHERE name = ${comp.name}
      `;
      updatedCount++;
    }
  }

  console.log(`Done. Updated ${updatedCount} companies to city-level geocoding.`);
  process.exit(0);
}

populateCities().catch(err => {
  console.error(err);
  process.exit(1);
});
