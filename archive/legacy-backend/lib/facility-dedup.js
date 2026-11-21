import stringSimilarity from 'string-similarity';

/**
 * Calculates the Haversine distance between two points in kilometers.
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const TIER_ORDER = {
  'brsr_pdf': 0, 
  'climate_trace': 1, 
  'gem_2026': 2,
  'osh_api': 3, 
  'wikidata': 4, 
  'osm': 5, 
  'estimated': 6,
  'unknown': 7
};

/**
 * Deduplicates a list of facilities based on spatial proximity and name similarity.
 */
export function deduplicateFacilities(facilities) {
  const merged = [];
  const used = new Set();
  
  for (let i = 0; i < facilities.length; i++) {
    if (used.has(i)) continue;
    const cluster = [facilities[i]];
    
    for (let j = i + 1; j < facilities.length; j++) {
      if (used.has(j)) continue;
      const dist = haversineKm(facilities[i].lat, facilities[i].lng,
                               facilities[j].lat, facilities[j].lng);
      if (dist > 0.5) continue; // 500m threshold
      
      const nameSim = stringSimilarity.compareTwoStrings(
        facilities[i].facility_name.toLowerCase(),
        facilities[j].facility_name.toLowerCase()
      );
      if (nameSim < 0.60) continue;
      
      cluster.push(facilities[j]);
      used.add(j);
    }
    
    // Resolve cluster: pick highest tier, average coordinates
    const winner = { ...cluster.sort((a, b) => {
        const tierA = TIER_ORDER[a.source_tier] ?? 7;
        const tierB = TIER_ORDER[b.source_tier] ?? 7;
        return tierA - tierB;
      })[0] 
    };
    
    winner.lat = cluster.reduce((s, f) => s + parseFloat(f.lat), 0) / cluster.length;
    winner.lng = cluster.reduce((s, f) => s + parseFloat(f.lng), 0) / cluster.length;
    winner.merged_from = cluster.length;
    merged.push(winner);
    used.add(i);
  }
  return merged;
}
