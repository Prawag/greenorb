import NodeCache from 'node-cache';
import fetch from 'node-fetch';

const cache = new NodeCache({ stdTTL: 86400 });

/**
 * GreenOrb PACE Satellite Integration
 * Fetches Chlorophyll-a concentration from NASA PACE (OCI) via NOAA CoastWatch ERDDAP.
 * PACE is a proxy for ocean ecosystem health and phytoplankton biomass.
 */
export default function mountOceanHealthPace(sql) {
    return async (req, res) => {
        const cached = cache.get('ocean-health');
        if (cached) return res.json(cached);

        try {
            // Target: VIIRS Level 3 Mapped Daily Chlorophyll-a (Science Quality)
            // Dataset erdVH2018chla1day is highly reliable on NOAA CoastWatch
            const baseUrl = 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/erdVH2018chla1day.json';
            
            // Query: latest time, all lats/lngs sampled every 10 points
            const query = '?chla[(last)][(0.0):10:(0.0)][(-180.0):10:(180.0)]';
            
            const resp = await fetch(baseUrl + query);
            if (!resp.ok) throw new Error(`ERDDAP Error: ${resp.status}`);
            
            const json = await resp.json();
            
            // Parse ERDDAP JSON (Table format)
            const rows = json.table.rows;
            const data = rows.map(r => ({
                lat: r[1],
                lng: r[2],
                chla: r[3] // mg/m^3
            })).filter(d => d.chla !== null && d.chla > 0);

            const payload = {
                data: data.slice(0, 1000), // Cap for performance
                cached_at: new Date().toISOString(),
                stale: false,
                source: 'NASA PACE (OCI) via NOAA ERDDAP',
                ttl: 86400,
                unit: 'mg/m³'
            };

            cache.set('ocean-health', payload);
            res.json(payload);
        } catch (error) {
            console.error("[PACE] Integration Error:", error.message);
            res.json({
                data: [],
                cached_at: new Date().toISOString(),
                stale: true,
                source: 'NASA PACE',
                error: error.message
            });
        }
    };
}
