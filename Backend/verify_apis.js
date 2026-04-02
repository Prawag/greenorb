const http = require('http');

const endpoints = [
  'http://localhost:5000/api/globe/companies',
  'http://localhost:5000/api/sentinel-5p',
  'http://localhost:5000/api/water-stress',
  'http://localhost:5000/api/coral-bleaching',
  'http://localhost:5000/api/globe/assets',
  'http://localhost:5000/api/biodiversity',
  'http://localhost:5000/api/globe/air-quality'
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
