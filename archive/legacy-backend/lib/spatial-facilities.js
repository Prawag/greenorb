import RBush from 'rbush';
import fs from 'fs';
import path from 'path';

// RBush expects items with {minX, minY, maxX, maxY}
let facilitiesTree = new RBush();
let facilityList = [];

export function buildSpatialFacilitiesIndex(sql) {
  return async () => {
    try {
      // 1. Load GEM local seed
      const gemPath = path.join(process.cwd(), 'data', 'gem-facilities.json');
      if (fs.existsSync(gemPath)) {
        const gemData = JSON.parse(fs.readFileSync(gemPath, 'utf8'));
        facilityList.push(...gemData);
      }

      // 2. Load DB Facilities
      if (sql) {
        const dbFacilities = await sql`SELECT * FROM facilities`;
        facilityList.push(...dbFacilities.map(f => ({
           id: f.id,
           name: f.facility_name,
           company: f.company_name,
           type: f.facility_type,
           lat: f.lat,
           lng: f.lng,
           status: f.status,
           source: f.source || 'db'
        })));
      }

      // Convert to RBush format
      const items = facilityList.map((f, i) => ({
        minX: f.lng,
        minY: f.lat,
        maxX: f.lng,
        maxY: f.lat,
        index: i
      }));

      facilitiesTree.clear();
      facilitiesTree.load(items);
      console.log(`[Spatial] Built facility index with ${facilityList.length} global facilities.`);
    } catch (e) {
      console.error("[Spatial] Error building facility index:", e);
    }
  };
}

// Haversine distance in km
function getDistanceKM(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export default function mountSpatialFacilities(app, sql) {
  // Build on mount
  buildSpatialFacilitiesIndex(sql)();

  app.get('/api/facilities/global', (req, res) => {
    const { lat, lng, radius_km } = req.query;
    if (!lat || !lng || !radius_km) return res.status(400).json({ error: "lat, lng, and radius_km required" });

    const qLat = parseFloat(lat);
    const qLng = parseFloat(lng);
    const rKm = parseFloat(radius_km);

    // Approx bounding box for quick RBush filter (1 deg ~ 111km)
    const degOffset = rKm / 110;
    const searchBox = {
      minX: qLng - degOffset,
      minY: qLat - degOffset,
      maxX: qLng + degOffset,
      maxY: qLat + degOffset
    };

    const candidates = facilitiesTree.search(searchBox);
    
    // Refine with exact Haversine
    const results = [];
    for (const c of candidates) {
       const fac = facilityList[c.index];
       const dist = getDistanceKM(qLat, qLng, fac.lat, fac.lng);
       if (dist <= rKm) {
         results.push({ ...fac, distance_km: dist });
       }
    }

    res.json(results);
  });
}
