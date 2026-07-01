const http = require('http');

const INTERNAL_API_BASE = process.env.INTERNAL_API_BASE || 'http://localhost:5000';

const endpoints = [
  `${INTERNAL_API_BASE}/api/globe/companies`,
  `${INTERNAL_API_BASE}/api/sentinel-5p`,
  `${INTERNAL_API_BASE}/api/water-stress`,
  `${INTERNAL_API_BASE}/api/coral-bleaching`,
  `${INTERNAL_API_BASE}/api/globe/assets`,
  `${INTERNAL_API_BASE}/api/biodiversity`,
  `${INTERNAL_API_BASE}/api/globe/air-quality`
];

async function verify() {
  for (const url of endpoints) {
    console.log(`\n--- FETCHING: ${url} ---`);
    try {
      const data = await new Promise((resolve, reject) => {
        http.get(url, (res) => {
          let body = '';
          res.on('data', (chunk) => body += chunk);
          res.on('end', () => resolve(JSON.parse(body)));
        }).on('error', reject);
      });

      if (url.includes('companies')) {
        const slice = data.data.slice(0, 3).map(c => ({
          name: c.name,
          lat: c.lat,
          lng: c.lng,
          city: c.city,
          geocoding_source: c.geocoding_source
        }));
        console.log('Sample data (first 3):', JSON.stringify(slice, null, 2));
        console.log(`Total companies: ${data.data.length}`);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
    } catch (err) {
      console.error(`Error fetching ${url}:`, err.message);
    }
  }
}

verify();
