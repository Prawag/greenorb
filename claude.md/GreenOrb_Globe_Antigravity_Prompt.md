# GreenOrb Globe — WorldMonitor-Style Real-Time Data Layer
## Single Antigravity Prompt — Globe Overhaul Mission

---

> **HOW TO USE:**
> Manager View → paste this entire document.
> Set autonomy to **"Approve Writes"**.
> Generate **implementation plan artifact** before touching files.
> Do not split into phases.

---

## 1. WHAT WE ARE BUILDING

We are rebuilding GreenOrb's globe from a static 3D mesh into a
WorldMonitor-style live intelligence layer with real data on it.

WorldMonitor (worldmonitor.app) achieves its real-time feel through:
1. Vercel/edge-style functions with TTL-based stale cache per source
2. Four globe.gl primitive types: POINTS / ARCS / POLYGONS / HTML MARKERS
3. Client-side animation between server updates (interpolation)
4. Per-source circuit breakers — one source fails, rest keep updating
5. URL state encoding — every globe view is a shareable link

GreenOrb will use the same patterns, applied to ESG intelligence data.

---

## 2. ABSOLUTE RULES (enforce on every file)

- NEVER use external UI libraries (no MUI, Tailwind, Chakra)
- ALL CSS via CSS variables: var(--color-background-primary) etc.
- NEVER hardcode company names, coordinates, or emission values
- All data served from API routes — no direct DB calls from React
- Globe primitive data props must ALWAYS fall back to [] when loading
- snake_case Python, camelCase JS/JSX, kebab-case CSS classes
- Every API route must return: { data, cached_at, stale, source, ttl }

---

## 3. CURRENT FILE LOCATIONS

```
frontend/src/
  components/GlobeTab.jsx     ← main file to rewrite
  hooks/useEmissionsData.js   ← to extend with multi-source hooks
  config/layers.config.js     ← CREATE THIS — layer registry
backend/
  api/                        ← Express routes (extend here)
  cache/pdf_cache.py          ← existing cache (keep as-is)
```

---

## 4. GENERATE IMPLEMENTATION PLAN ARTIFACT FIRST

Before writing any code, output an artifact listing:
- Every file created or modified
- What changes, line-by-line for small files
- Dependency order (which must be done before which)
- Estimated DOM/React component tree after completion

Wait for approval. Then execute in dependency order below.

---

## 5. TASK 1 — Data API routes (backend — do first)

### 5a. Create `backend/api/globe-points.js` (Express route)

This serves company emission points for the globe.
- Route: `GET /api/globe/companies`
- Query DB for all companies with non-null lat/lng
- For each company compute: greendex_score (from strategy_agent output),
  audit_status (COMPLETED / EXTRACTING / FAILED / PENDING),
  scope_total (scope_1 + scope_2, null-safe)
- If lat/lng missing: geocode from country centroid using this map:
  ```js
  const COUNTRY_CENTROIDS = {
    "India": [20.5937, 78.9629],
    "China": [35.8617, 104.1954],
    "USA": [37.0902, -95.7129],
    "UAE": [23.4241, 53.8478],
    "Germany": [51.1657, 10.4515],
    "Brazil": [14.2350, -51.9253],
    "UK": [55.3781, -3.4360],
    "Japan": [36.2048, 138.2529],
    "Singapore": [1.3521, 103.8198],
    "Philippines": [12.8797, 121.7740],
    "South Korea": [35.9078, 127.7669],
  };
  ```
- Response shape (every field required, null-safe):
  ```json
  {
    "data": [{
      "id": "company-uuid",
      "name": "Tata Steel",
      "lat": 22.7196,
      "lng": 86.1511,
      "country": "India",
      "sector": "Manufacturing",
      "scope_total": 19800000,
      "greendex": 42.5,
      "esg_grade": "B",
      "audit_status": "COMPLETED",
      "report_year": 2024,
      "has_discrepancy": false,
      "absence_signals_count": 2
    }],
    "cached_at": "2026-03-21T10:30:00Z",
    "stale": false,
    "source": "neon_db",
    "ttl": 300,
    "total": 929
  }
  ```
- Cache this response in memory for 5 minutes (use node-cache or simple Map)
- If DB fails: return last cached response with `"stale": true`
- Log: company count, cache HIT/MISS, duration_ms

### 5b. Create `backend/api/country-choropleth.js` (Express route)

- Route: `GET /api/globe/countries`
- Aggregate companies by country: average greendex, total emissions,
  company count, disclosure_rate (% with non-null scope_1)
- Join with a hardcoded GeoJSON country boundaries file (use
  `https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json`
  as the source — fetch once, cache forever in memory)
- Response shape:
  ```json
  {
    "data": [{
      "country": "India",
      "iso3": "IND",
      "avg_greendex": 51.2,
      "total_emissions_mt": 2800,
      "company_count": 147,
      "disclosure_rate": 0.73
    }],
    "cached_at": "...",
    "ttl": 3600,
    "stale": false
  }
  ```
- Cache for 1 hour

### 5c. Create `backend/api/esg-news.js` (Express route)

- Route: `GET /api/globe/news-velocity`
- Poll these 8 free ESG RSS feeds (no auth required):
  ```
  https://www.greenbiz.com/feed
  https://feeds.feedburner.com/businessgreen
  https://www.edie.net/feed/
  https://www.environmentalleader.com/feed/
  https://feeds.reuters.com/reuters/environment
  https://rss.cnn.com/rss/edition_world.rss
  https://feeds.feedburner.com/ndtv/environmental-news
  https://timesofindia.indiatimes.com/rssfeeds/2647163.cms
  ```
- Parse RSS using `rss-parser` npm package
- For each article: extract company names mentioned using simple
  string matching against the companies table names
- Count mentions per company in last 24h → "velocity" score
- Companies with velocity > 3 are "trending" — flag them
- Response:
  ```json
  {
    "data": [{
      "company_name": "Reliance Industries",
      "velocity": 7,
      "trending": true,
      "latest_headline": "Reliance targets net-zero by 2035",
      "lat": 19.0760, "lng": 72.8777
    }],
    "cached_at": "...",
    "ttl": 900,
    "stale": false
  }
  ```
- Cache 15 minutes. If any feed fails: skip it, serve rest, mark stale=true

### 5d. Create `backend/api/climate-trace.js` (Express route)

- Route: `GET /api/globe/assets`
- Fetch top 200 highest-emission assets from Climate TRACE free API:
  `https://api.climatetrace.org/v6/assets?limit=200&sort=co2e_100yr_desc`
- Normalize to:
  ```json
  {
    "data": [{
      "asset_id": "ct-12345",
      "name": "Mundra Power Plant",
      "asset_type": "power-plant",
      "lat": 22.8, "lng": 69.7,
      "co2e_mt": 24500000,
      "country": "India",
      "sector": "electricity-generation"
    }],
    "cached_at": "...",
    "ttl": 86400,
    "stale": false
  }
  ```
- Cache 24 hours (Climate TRACE data is not truly real-time)
- If Climate TRACE is down: return empty data array, stale=true

---

## 6. TASK 2 — Layer configuration registry

Create `frontend/src/config/layers.config.js`:

```js
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
    altitude: (d) => Math.min(d.co2e_mt / 50_000_000, 0.5),
    radius: 0.4,
  },

  nasa_gibs: {
    id: 'nasa_gibs',
    label: 'NASA satellite (CO₂)',
    endpoint: null,   // tile-based, not point-based
    ttl: 86_400_000,
    primitive: 'tile',
    defaultOn: true,
    wmts_url: 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2024-03-01/250m/{z}/{y}/{x}.jpg',
  },
};

export const LAYER_IDS = Object.keys(LAYERS);
export const DEFAULT_ON = LAYER_IDS.filter(id => LAYERS[id].defaultOn);
```

---

## 7. TASK 3 — Frontend hooks for each data source

Create `frontend/src/hooks/useGlobeData.js`:

```js
import { useState, useEffect, useRef, useCallback } from 'react';
import { LAYERS } from '../config/layers.config';

// Single hook that manages all globe data sources independently.
// Each source has its own fetch cycle, TTL, stale state, and error state.
// Sources never block each other — one failing doesn't stop others.

function useDataSource(layerId) {
  const layer = LAYERS[layerId];
  const [state, setState] = useState({
    data:      [],
    loading:   true,
    stale:     false,
    error:     null,
    cached_at: null,
  });
  const timerRef = useRef(null);

  const fetch_ = useCallback(async () => {
    if (!layer?.endpoint) return;
    try {
      const res  = await fetch(layer.endpoint);
      const json = await res.json();
      setState({
        data:      json.data || [],
        loading:   false,
        stale:     json.stale || false,
        error:     null,
        cached_at: json.cached_at,
      });
    } catch (e) {
      setState(prev => ({
        ...prev,
        loading: false,
        stale:   true,
        error:   e.message,
      }));
    }
  }, [layer?.endpoint]);

  useEffect(() => {
    fetch_();
    timerRef.current = setInterval(fetch_, layer?.ttl || 300_000);
    return () => clearInterval(timerRef.current);
  }, [fetch_, layer?.ttl]);

  return state;
}

// Export one hook per layer — clean API for components
export const useCompanies   = () => useDataSource('companies');
export const useCountries   = () => useDataSource('countries');
export const useNewsVelocity = () => useDataSource('newsVelocity');
export const useClimatTrace = () => useDataSource('climateTrace');
```

---

## 8. TASK 4 — Rewrite GlobeTab.jsx

Completely rewrite `frontend/src/components/GlobeTab.jsx`.

**Architecture:**
- Import `Globe` from `react-globe.gl`
- Import all 4 hooks from `useGlobeData.js`
- Import `LAYERS` from `layers.config.js`
- Import `useState` for active layer toggles

**Layer toggle state:**
```js
const [activeLayers, setActiveLayers] = useState(DEFAULT_ON);
const toggleLayer = (id) => setActiveLayers(prev =>
  prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]
);
const isActive = (id) => activeLayers.includes(id);
```

**Globe component — implement ALL 4 primitives:**

```jsx
<Globe
  ref={globeRef}

  // === BACKGROUND ===
  globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
  atmosphereColor="#00ff88"
  atmosphereAltitude={0.15}

  // === PRIMITIVE 1: POINTS — companies ===
  pointsData={isActive('companies') ? companies.data : []}
  pointLat={d => d.lat}
  pointLng={d => d.lng}
  pointAltitude={LAYERS.companies.altitude}
  pointRadius={LAYERS.companies.radius}
  pointColor={LAYERS.companies.color}
  pointLabel={d => `
    <div class="globe-tooltip">
      <strong>${d.name}</strong><br/>
      ${d.country} · ${d.sector}<br/>
      Greendex: <span style="color:${LAYERS.companies.color(d)}">${d.greendex ?? 'N/A'}</span><br/>
      Scope 1+2: ${d.scope_total ? (d.scope_total/1e6).toFixed(2)+'Mt' : 'Not disclosed'}<br/>
      ${d.has_discrepancy ? '<span style="color:#FF3B3B">⚠ Math discrepancy detected</span><br/>' : ''}
      ${d.absence_signals_count > 0 ? `<span style="color:#FF8C00">${d.absence_signals_count} disclosure gaps</span>` : ''}
    </div>
  `}
  onPointClick={d => {
    setSelectedCompany(d);
    globeRef.current?.pointOfView({ lat: d.lat, lng: d.lng, altitude: 1.2 }, 800);
  }}

  // === PRIMITIVE 1b: POINTS — news velocity ===
  // Use a second Globe instance on the same canvas via the ringsData prop trick:
  ringsData={isActive('newsVelocity') ? newsVelocity.data.filter(d=>d.trending) : []}
  ringLat={d => d.lat}
  ringLng={d => d.lng}
  ringMaxRadius={d => d.velocity * 1.5}
  ringPropagationSpeed={2}
  ringRepeatPeriod={800}
  ringColor={() => '#A78BFA'}
  ringLabel={d => `<div class="globe-tooltip"><strong>${d.company_name}</strong><br/>${d.velocity} ESG mentions today<br/>${d.latest_headline}</div>`}

  // === PRIMITIVE 2: ARCS — supply chain routes (static for now) ===
  // Wire up when AIS ship data is available
  arcsData={[]}

  // === PRIMITIVE 3: POLYGONS — country choropleth ===
  polygonsData={isActive('countries') ? countries.data : []}
  polygonGeoJsonGeometry={d => d.geometry}
  polygonCapColor={LAYERS.countries.color}
  polygonSideColor={() => 'rgba(0,0,0,0)'}
  polygonAltitude={0.001}
  polygonLabel={d => `
    <div class="globe-tooltip">
      <strong>${d.country}</strong><br/>
      Avg Greendex: ${d.avg_greendex?.toFixed(1) ?? 'N/A'}<br/>
      ${d.company_count} companies tracked<br/>
      Disclosure rate: ${((d.disclosure_rate||0)*100).toFixed(0)}%
    </div>
  `}

  // === PRIMITIVE 1c: POINTS — Climate TRACE assets ===
  // Second pointsData is not natively supported — use custom three-object layer:
  customLayerData={isActive('climateTrace') ? climateTrace.data : []}
  customThreeObject={d => {
    const geo  = new THREE.SphereGeometry(0.3);
    const mat  = new THREE.MeshLambertMaterial({ color: LAYERS.climateTrace.color(d) });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = d;
    return mesh;
  }}
  customThreeObjectUpdate={(obj, d) => {
    Object.assign(obj.position, globeRef.current?.getCoords(d.lat, d.lng,
      LAYERS.climateTrace.altitude(d)) ?? {});
  }}
/>
```

**Initial camera — always face Asia-Pacific on load:**
```js
useEffect(() => {
  globeRef.current?.pointOfView({ lat: 22, lng: 95, altitude: 2.5 }, 1500);
}, []);
```

**URL state sync — every globe view is shareable:**
```js
// On mount: read URL params and restore state
// On state change: update URL params without page reload
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const lat   = parseFloat(params.get('lat')  || '22');
  const lng   = parseFloat(params.get('lng')  || '95');
  const zoom  = parseFloat(params.get('zoom') || '2.5');
  const layers = params.get('layers')?.split(',') || DEFAULT_ON;
  globeRef.current?.pointOfView({ lat, lng, altitude: zoom }, 0);
  setActiveLayers(layers);
}, []);

// Sync URL on pov/layer change (debounced 500ms)
const syncURL = useCallback(debounce((pov, layers) => {
  const params = new URLSearchParams();
  params.set('lat',    pov.lat.toFixed(4));
  params.set('lng',    pov.lng.toFixed(4));
  params.set('zoom',   pov.altitude.toFixed(2));
  params.set('layers', layers.join(','));
  window.history.replaceState(null, '', `?${params}`);
}, 500), []);
```

**Layer control panel — left sidebar:**

Build a collapsible panel on the left side of the globe showing:
- Each layer from LAYERS config as a toggle pill
- When layer is loading: show spinner inside the pill
- When layer is stale: show a small clock icon on the pill
- When layer has error: show red dot on the pill
- Live company count badge: "929 companies · 4 active layers"

Style using CSS variables only. Example structure:
```jsx
<div className="globe-layer-panel">
  <div className="globe-layer-panel__header">
    <span>Layers</span>
    <span className="globe-layer-panel__count">{companies.data.length} companies</span>
  </div>
  {LAYER_IDS.map(id => (
    <button
      key={id}
      className={`globe-layer-pill ${isActive(id) ? 'active' : ''}`}
      onClick={() => toggleLayer(id)}
    >
      <span className="globe-layer-pill__dot"
        style={{ background: typeof LAYERS[id].color === 'function'
          ? LAYERS[id].color({ greendex: 60 }) : LAYERS[id].color }}
      />
      {LAYERS[id].label}
      {getLayerState(id).stale && <span className="stale-icon" title="Stale data">↻</span>}
      {getLayerState(id).loading && <span className="loading-dot" />}
    </button>
  ))}
</div>
```

**Source health row — bottom of globe:**

Show a one-line status bar at the bottom of the globe:
```
● Companies (5m ago)  ● Countries (1h ago)  ● Climate TRACE (24h ago)  ○ RSS (stale)
```
Green dot = fresh. Grey dot = stale but serving. Red dot = error.

**Selected company panel — right side:**

When a company point is clicked, slide in a panel from the right:
- Company name, country, sector, ESG grade badge
- Greendex score with sector percentile ("better than 34% of Manufacturing companies")
- Scope 1 / 2 / 3 bars (proportional width)
- Absence signal count with red/orange badges
- Has discrepancy: red warning banner
- "Open full audit →" button that navigates to AuditTab with that company selected
- Close button (X) top right

This panel must be pure CSS transitions (slide-in from right, 300ms ease).
No animation libraries.

**CSS for globe elements — add to GlobeTab.css or inline:**
```css
.globe-tooltip {
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.6;
  max-width: 220px;
  pointer-events: none;
}
.globe-layer-panel {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  background: var(--color-background-secondary);
  border: 1px solid var(--color-border-tertiary);
  border-radius: var(--border-radius-lg);
  padding: 12px;
  width: 180px;
  z-index: 10;
}
.globe-layer-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  cursor: pointer;
  margin: 3px 0;
  text-align: left;
  transition: all 0.15s;
}
.globe-layer-pill.active {
  background: var(--color-background-tertiary);
  border-color: var(--color-border-secondary);
  color: var(--color-text-primary);
}
.globe-layer-pill__dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.stale-icon { margin-left: auto; font-size: 10px; opacity: 0.5; }
```

---

## 9. TASK 5 — Client-side animation for live feel

Add to `GlobeTab.jsx` — animates the "pulsing ring" on companies
currently being audited by the agent pipeline:

```js
// Companies with status EXTRACTING get an animated pulse ring
// This makes the globe feel live even between data refreshes

const auditingCompanies = companies.data.filter(d => d.audit_status === 'EXTRACTING');

// Pass auditingCompanies as a second ring layer with different color/speed:
// ringColor={() => '#10B981'}   // green pulse = audit in progress
// ringPropagationSpeed={3}
// ringRepeatPeriod={600}

// Also: every 30s, re-fetch companies to update audit statuses
// This makes it look like the globe is "live" tracking active audits
```

Add a subtle counter in the globe header area:
```
LIVE · 4 agents active · 2 audits in progress · 929 companies tracked
```
Pull these counts from `/api/agent-status` (existing Express route or create it).

---

## 10. TASK 6 — NASA GIBS tile integration on the globe

The globe should drape NASA satellite imagery as a toggle layer.

```js
// When nasa_gibs layer is active, replace the default globe texture
// with a GIBS WMTS tile layer

const globeImageUrl = isActive('nasa_gibs')
  ? null   // disable default texture
  : '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg';

// For GIBS tiles: use react-globe.gl's tile layer feature
// WMTS endpoint:
const GIBS_MODIS = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/' +
  'MODIS_Terra_CorrectedReflectance_TrueColor/default/2024-03-01/250m/{z}/{y}/{x}.jpg';

// Set as globeImageUrl when active — react-globe.gl handles tile fetching
// Note: GIBS requires a date param — use yesterday's date dynamically:
const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
const GIBS_URL = `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${yesterday}/250m/{z}/{y}/{x}.jpg`;
```

---

## 11. VERIFICATION CHECKLIST

After all tasks complete, use browser agent to verify:

```
□ Globe loads facing Asia-Pacific (lat 22, lng 95, altitude 2.5)
□ Company emission dots visible — NOT all green (shows real score variation)
□ Clicking a dot opens right-side panel with company details
□ Right-side panel shows Greendex score, scope bars, absence count
□ "Open full audit →" button navigates to AuditTab for that company
□ Layer panel visible on left — toggles work for each layer
□ Toggling "Country Greendex" shows a colour choropleth on countries
□ Toggling "ESG news velocity" shows purple pulsing rings on trending companies
□ Companies currently being audited show green pulse rings
□ Status bar at bottom shows freshness timestamps per source
□ Copy current URL → open in new tab → same view, same layers active
□ Simulate API failure: set companies endpoint to 404 → globe shows
  stale data with stale indicator, does NOT show empty globe
□ "LIVE · X agents active" counter shows in globe header
□ NASA GIBS layer toggle replaces default texture with satellite imagery
□ All tooltips render correctly — no raw HTML visible
□ Mobile: pinch-to-zoom works, layer panel collapses to icon
```

---

## 12. NEW NPM PACKAGES NEEDED

Add these to `package.json` before starting:
```
react-globe.gl          (already installed — verify version ≥ 2.27)
rss-parser              (for ESG news feed polling in backend)
node-cache              (simple in-memory cache for Express routes)
```

Install: `npm install rss-parser node-cache`

Do NOT install: any UI framework, any chart library, any animation library.
CSS transitions only for all animations in this task.

---

## 13. DATA SOURCE REFERENCE (all free, no auth)

```
Climate TRACE:  https://api.climatetrace.org/v6/assets?limit=200
NASA GIBS WMTS: https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/...
World Atlas GeoJSON: https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json
Reuters RSS:    https://feeds.reuters.com/reuters/environment
Times of India: https://timesofindia.indiatimes.com/rssfeeds/2647163.cms
NDTV Green:     https://feeds.feedburner.com/ndtv/environmental-news
GreenBiz:       https://www.greenbiz.com/feed
```

All sources above require no API key and allow programmatic access.

---

*End of GreenOrb Globe Mission prompt.*
*6 tasks. One globe. Real data. Real time.*
