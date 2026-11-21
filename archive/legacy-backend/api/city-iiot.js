import fetch from 'node-fetch';
import NodeCache from 'node-cache';
import fs from 'fs';
import path from 'path';

const cache = new NodeCache({ stdTTL: 900 }); // 15 mins
let citiesConfig = [];

// Load config
try {
  const dataPath = path.join(process.cwd(), 'data', 'cities-iiot.json');
  if (fs.existsSync(dataPath)) {
    citiesConfig = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  }
} catch(e) {
  console.error("Cities seed failed to load:", e);
}

export default function mountCityIiot(app) {
  // Return the master config to the frontend (used by config files or components)
  app.get('/api/city/config', (req, res) => {
     res.json(citiesConfig);
  });

  app.get('/api/city/:city_id/sensors', async (req, res) => {
    const { city_id } = req.params;
    const city = citiesConfig.find(c => c.id === city_id);

    if (!city) {
      return res.status(404).json({ error: "City not found in IIoT config" });
    }

    const cacheKey = `iiot_${city_id}`;
    if (cache.has(cacheKey)) {
      return res.json(cache.get(cacheKey));
    }

    let payload = {
      city: city.id,
      sensors: {
        aqi_pm25: null,
        aqi_pm10: null,
        no2_ppb: null,
        co2_ppm: null,
        noise_db: null
      },
      source: city.iiot_platform,
      cached_at: new Date().toISOString(),
      stale: false,
      ttl: 900
    };

    try {
      if (city.iiot_platform === 'opensensemap') {
        const url = `https://api.opensensemap.org/boxes?near=${city.lng},${city.lat}&maxDistance=50000`;
        const r = await fetch(url);
        if (r.ok) {
           const json = await r.json();
           // Find a box with PM2.5 or PM10
           const box = json.find(b => b.sensors && b.sensors.some(s => s.title.includes('PM2')));
           if (box) {
             const pm25Sensor = box.sensors.find(s => s.title.includes('PM2.5'));
             const pm10Sensor = box.sensors.find(s => s.title.includes('PM10'));
             if (pm25Sensor && pm25Sensor.lastMeasurement) payload.sensors.aqi_pm25 = parseFloat(pm25Sensor.lastMeasurement.value);
             if (pm10Sensor && pm10Sensor.lastMeasurement) payload.sensors.aqi_pm10 = parseFloat(pm10Sensor.lastMeasurement.value);
           }
        }
      } else if (city.iiot_platform === 'smartcitizen') {
        const url = `https://api.smartcitizen.me/v0/devices?near=${city.lat},${city.lng}`;
        const r = await fetch(url);
        if (r.ok) {
           const json = await r.json();
           const dev = json[0]; // first nearby device
           if (dev && dev.data && dev.data.sensors) {
             const pm25 = dev.data.sensors.find(s => s.name === 'PM 2.5');
             const noise = dev.data.sensors.find(s => s.name === 'Noise');
             if (pm25) payload.sensors.aqi_pm25 = pm25.value;
             if (noise) payload.sensors.noise_db = noise.value;
           }
        }
      } else if (city.iiot_platform === 'iudx' || city.iiot_platform === 'openaq') {
        // Mocking IUDX & OpenAQ for safety if unauthenticated, fallback to public OpenAQ
        const url = `https://api.openaq.org/v2/latest?coordinates=${city.lat},${city.lng}&radius=25000`;
        const r = await fetch(url);
        if (r.ok) {
           const json = await r.json();
           const result = json.results?.[0];
           if (result && result.measurements) {
             const pm25 = result.measurements.find(m => m.parameter === 'pm25');
             const pm10 = result.measurements.find(m => m.parameter === 'pm10');
             const no2 = result.measurements.find(m => m.parameter === 'no2');
             if (pm25) payload.sensors.aqi_pm25 = pm25.value;
             if (pm10) payload.sensors.aqi_pm10 = pm10.value;
             if (no2) payload.sensors.no2_ppb = no2.value;
           }
           payload.source = city.iiot_platform === 'iudx' ? 'iudx via openaq fallback' : 'openaq';
        }
      }

    } catch (e) {
       console.error(`City IIoT Error - ${city.id}:`, e.message);
    }

    cache.set(cacheKey, payload);
    res.json(payload);
  });
}
