// Single source of truth for all globe layers.
// Adding a new layer = one entry here. Nothing else to change.

export const LAYERS = {
  companies: {
    id: 'companies',
    label: 'Company emissions',
    endpoint: '/api/globe/companies',
    ttl: 300_000,        // 5 min in ms
    primitive: 'points',
    defaultOn: true,
    color: (d) => {
      if (d.has_discrepancy)           return '#FF3B3B';  // red = fraud flag
      if (d.greendex < 30)             return '#FF8C00';  // orange = poor
      if (d.greendex < 60)             return '#FFD700';  // yellow = moderate
      return '#00FA9A';                                    // green = good
    },
    altitude: (d) => Math.min(Math.sqrt((d.scope_total || 0)) / 8000, 0.6),
    radius: 0.5,
  },

  countries: {
    id: 'countries',
    label: 'Country Greendex',
    endpoint: '/api/globe/countries',
    ttl: 3_600_000,      // 1 hour
    primitive: 'polygons',
    defaultOn: false,
    color: (d) => {
      const g = d.avg_greendex || 50;
      if (g < 25) return 'rgba(255,59,59,0.4)';
      if (g < 50) return 'rgba(255,140,0,0.35)';
      if (g < 75) return 'rgba(255,215,0,0.3)';
      return 'rgba(0,250,154,0.25)';
    },
  },

  newsVelocity: {
    id: 'newsVelocity',
    label: 'ESG news velocity',
    endpoint: '/api/globe/news-velocity',
    ttl: 900_000,        // 15 min
    primitive: 'points',
    defaultOn: false,
    color: () => '#A78BFA',   // purple = news signal
    altitude: () => 0.1,
    radius: (d) => d.velocity * 0.2,
  },

  climateTrace: {
    id: 'climateTrace',
    label: 'Climate TRACE assets',
    endpoint: '/api/globe/assets',
    ttl: 86_400_000,     // 24h
    primitive: 'points',
    defaultOn: false,
    color: (d) => {
      const t = d.asset_type;
      if (t === 'power-plant')     return '#FF6B35';
      if (t === 'steel')           return '#888780';
      if (t === 'oil-and-gas')     return '#2C2C2A';
      return '#378ADD';
    },
    altitude: (d) => Math.min(d.co2e_mt / 50_000_000, 0.3),  // capped at 0.3
    radius: 0.15,  // geometry radius 0.15 per user spec
  },

  nasa_gibs: {
    id: 'nasa_gibs',
    label: 'NASA satellite (CO₂)',
    endpoint: null,   // tile-based, not point-based
    ttl: 86_400_000,
    primitive: 'tile',
    defaultOn: true,
  },
};

export const LAYER_IDS = Object.keys(LAYERS);
export const DEFAULT_ON = LAYER_IDS.filter(id => LAYERS[id].defaultOn);
