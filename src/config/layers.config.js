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
    h3: {
      enabled: true,
      globalResolution: 3,   // ~500km cells at world view
      regionalResolution: 5, // ~50km cells when zoomed in
      breakAltitude: 1.8,    // altitude threshold to switch modes
    },
    color: (d) => {
      if (d.has_discrepancy)           return '#FF3B3B';  // red = fraud flag
      if (d.greendex < 30)             return '#FF8C00';  // orange = poor
      if (d.greendex < 60)             return '#FFD700';  // yellow = moderate
      return '#00FA9A';                                    // green = good
    },
    altitude: (d) => Math.max(0.02, Math.min(Math.sqrt((d.scope_total || 0)) / 8000, 0.6)),
    radius: (d) => d.scope_total ? 0.5 : 0.35,
  },

  nasa_gibs: {
    id: 'nasa_gibs',
    label: 'NASA GIBS Global',
    color: () => '#3b82f6',
    defaultOn: false,
  },

  fires: {
    id: 'fires',
    label: 'Active fires (NASA VIIRS)',
    endpoint: '/api/globe/fires',
    ttl: 3_600_000,    // 1h
    primitive: 'points',
    defaultOn: false,
    color: (d) => {
      if (d.brightness > 380) return '#FF0000';   // extreme
      if (d.brightness > 350) return '#FF4444';   // high
      return '#FF8C00';                            // moderate
    },
    altitude: (d) => Math.min(d.frp / 500, 0.4),
    radius: (d) => Math.max(d.frp / 200, 0.3),
  },

  earthquakes: {
    id: 'earthquakes', label: 'Earthquakes (USGS)', endpoint: '/api/disasters/earthquakes', ttl: 300_000, primitive: 'points', defaultOn: true,
  },
  floods: {
    id: 'floods', label: 'Floods (GDACS)', endpoint: '/api/disasters/floods', ttl: 1800_000, primitive: 'points', defaultOn: true,
  },
  cyclones: {
    id: 'cyclones', label: 'Cyclones (GDACS)', endpoint: '/api/disasters/cyclones', ttl: 1800_000, primitive: 'points', defaultOn: true,
  },
  volcanoes: {
    id: 'volcanoes', label: 'Active Volcanoes (GVP)', endpoint: '/api/disasters/volcanoes', ttl: 1800_000, primitive: 'points', defaultOn: true,
  },
  eonet: {
    id: 'eonet', label: 'NASA EONET Fallback', endpoint: '/api/disasters/eonet', ttl: 1800_000, primitive: 'points', defaultOn: false,
  },

  gridCarbon: {
    id: 'gridCarbon',
    label: 'Grid carbon intensity',
    endpoint: '/api/globe/grid',
    ttl: 900_000,    // 15min
    primitive: 'points',
    defaultOn: false,
    color: (d) => {
      const ci = d.carbon_intensity || 0;
      if (ci > 600) return '#FF3B3B';   // very dirty (coal-heavy)
      if (ci > 400) return '#FF8C00';   // moderate
      if (ci > 200) return '#FFD700';   // mixed
      return '#00FA9A';                  // clean (mostly renewable)
    },
    altitude: () => 0.05,
    radius: 1.2,
  },

  airQuality: {
    id: 'airQuality',
    label: 'Air quality (PM2.5)',
    endpoint: '/api/globe/air-quality',
    ttl: 3_600_000,
    primitive: 'points',
    defaultOn: false,
    color: (d) => {
      const pm25 = d.avg_pm25 || 0;
      if (pm25 > 55)  return '#7E0023';   // hazardous (maroon)
      if (pm25 > 35)  return '#FF3B3B';   // unhealthy
      if (pm25 > 15)  return '#FF8C00';   // WHO threshold exceeded
      return '#00FA9A';                    // within WHO guideline
    },
    altitude: (d) => Math.min((d.avg_pm25 || 0) / 100, 0.4),
    radius: 1.5,
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

  satellites: {
    id: 'satellites',
    label: 'Satellites (SGP4)',
    icon: '🛰️',
    defaultOn: false,
    workerPowered: true,
    ttl: 180,
    source: 'CelesTrak'
  },

  gdelt: {
    id: 'gdelt',
    label: 'News Intel (GDELT)',
    color: () => '#a855f7',
    defaultOn: false,
  },

  greenwashVelocity: {
    id: 'greenwashVelocity',
    label: 'Greenwash Velocity',
    color: () => '#ef4444',
    defaultOn: false,
  },
  gpm_precipitation: {
    id: 'gpm_precipitation',
    label: 'Precipitation (GPM)',
    endpoint: '/api/gpm-imerg',
    ttl: 1800000,
    color: () => '#3b82f6',
    defaultOn: false,
  },
  sentinel_atmosphere: {
    id: 'sentinel_atmosphere',
    label: 'Atmosphere (Sentinel)',
    endpoint: '/api/sentinel-5p',
    ttl: 86400000,
    color: () => '#a78bfa',
    defaultOn: false,
  },
  biodiversity_index: {
    id: 'biodiversity_index',
    label: 'Biodiversity (GBIF)',
    endpoint: '/api/biodiversity',
    ttl: 86400000,
    color: () => '#22c55e',
    defaultOn: false,
  },
  ocean_currents: {
    id: 'ocean_currents',
    label: 'Ocean Currents',
    endpoint: '/api/ocean-currents',
    ttl: 21600000,
    color: () => '#06b6d4',
    defaultOn: false,
  },
  water_stress: {
    id: 'water_stress',
    label: 'Water Stress (WRI)',
    endpoint: '/api/water-stress',
    ttl: 86400000,
    color: () => '#f59e0b',
    defaultOn: false,
  },
  forest_loss: {
    id: 'forest_loss',
    label: 'Forest Loss (GFW)',
    endpoint: '/api/forest-loss',
    ttl: 3600000,
    color: () => '#22c55e',
    defaultOn: false,
  },
  coral_bleaching: {
    id: 'coral_bleaching',
    label: 'Coral Bleaching',
    endpoint: '/api/coral-bleaching',
    ttl: 86400000,
    color: () => '#f97316',
    defaultOn: false,
  },
  fishing_watch: {
    id: 'fishing_watch',
    label: 'Illegal Fishing (GFW)',
    endpoint: '/api/fishing-watch',
    ttl: 3600000,
    color: () => '#a855f7',
    defaultOn: false,
  }
};

export const LAYER_IDS = [
    'companies',
    'fires',
    'nasa_gibs',
    'earthquakes',
    'floods',
    'cyclones',
    'volcanoes',
    'eonet',
    'gridCarbon',
    'airQuality',
    'countries',
    'newsVelocity',
    'climateTrace',
    'satellites',
    'gdelt',
    'greenwashVelocity',
    'gpm_precipitation',
    'sentinel_atmosphere',
    'biodiversity_index',
    'ocean_currents',
    'water_stress',
    'forest_loss',
    'coral_bleaching',
    'fishing_watch'
];

export const DEFAULT_ON = LAYER_IDS.filter(id => LAYERS[id] && LAYERS[id].defaultOn && LAYERS[id].label);
