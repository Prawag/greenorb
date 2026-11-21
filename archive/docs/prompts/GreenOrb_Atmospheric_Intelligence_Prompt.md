# GreenOrb — Atmospheric Intelligence Layer + Convergence Engine
## Antigravity Mission Prompt — New Data Sources from PDF Research

---

> **HOW TO USE:**
> Manager View → paste this entire document.
> Set autonomy to **"Approve Writes"**.
> This builds ON TOP of the globe architecture already implemented.
> Do not re-implement anything from the previous globe prompt.
> Generate an implementation plan artifact before touching files.

---

## 1. CONTEXT — WHAT EXISTS ALREADY

The following is already built and working. Do NOT touch these:
- `src/config/layers.config.js` — layer registry (5 layers: companies, countries, newsVelocity, climateTrace, nasa_gibs)
- `src/hooks/useGlobeData.js` — per-layer data hooks
- `src/tabs/GlobeTab.jsx` — full globe with 4 primitives + layer panel + right-side company panel
- `Backend/api/globe-points.js` — company emissions endpoint
- `Backend/api/country-choropleth.js` — country aggregation endpoint
- `Backend/api/esg-news.js` — RSS news velocity endpoint
- `Backend/api/climate-trace.js` — Climate TRACE assets endpoint
- `Backend/agents/` — Scout, Analyst, Risk, Strategy agents
- `Backend/sandbox/safe_eval.py` — AST-based formula evaluator
- `Backend/llm/router.py` — 3-provider fallback chain
- `Backend/cache/pdf_cache.py` — SHA-256 PDF result cache
- `Backend/schema/` — ESGSchema self-learning extraction mesh

---

## 2. ABSOLUTE RULES (same as always)

- NEVER use eval() anywhere — only safe_eval() from Backend/sandbox/safe_eval.py
- NEVER import external UI libraries
- ALL CSS via var(--sf), var(--tx), var(--bd), var(--tx2) — our existing tokens
- ALL globe layer additions go through layers.config.js first
- Every new backend route returns: { data, cached_at, stale, source, ttl }
- Web Workers for CPU-heavy tasks — never block the main UI thread
- snake_case Python, camelCase JS/JSX

---

## 3. GENERATE IMPLEMENTATION PLAN ARTIFACT FIRST

Before writing any code, output an artifact listing every file to be
created or modified, what changes, and dependency order.
Wait for approval before proceeding.

---

## 4. TASK 1 — H3 Hexagonal Clustering on the Globe

**What:** Replace raw scatter points with H3 zoom-adaptive clustering.
At global zoom (altitude > 1.8): show hexagonal aggregates.
At regional zoom (altitude ≤ 1.8): dissolve into individual company dots.

**Install:**
```
npm install h3-js
```

**Modify `src/config/layers.config.js`:**

Add H3 config to the `companies` layer entry:
```js
companies: {
  // ... existing config ...
  h3: {
    enabled: true,
    globalResolution: 3,   // ~500km cells at world view
    regionalResolution: 5, // ~50km cells when zoomed in
    breakAltitude: 1.8,    // altitude threshold to switch modes
  }
}
```

**Modify `src/tabs/GlobeTab.jsx`:**

Add H3 clustering logic:
```js
import { latLngToCell, cellToLatLng, cellToBoundary } from 'h3-js';

// When altitude > h3.breakAltitude: aggregate into hexagons
function buildH3Clusters(companies, resolution) {
  const cells = {};
  companies.forEach(c => {
    const cell = latLngToCell(c.lat, c.lng, resolution);
    if (!cells[cell]) {
      cells[cell] = {
        cell,
        companies: [],
        total_scope: 0,
        avg_greendex: 0,
        discrepancy_count: 0,
      };
    }
    cells[cell].companies.push(c);
    cells[cell].total_scope += c.scope_total || 0;
    cells[cell].discrepancy_count += c.has_discrepancy ? 1 : 0;
  });

  return Object.values(cells).map(cell => {
    const [lat, lng] = cellToLatLng(cell.cell);
    const greendexes = cell.companies.map(c => c.greendex).filter(Boolean);
    return {
      ...cell,
      lat, lng,
      count: cell.companies.length,
      avg_greendex: greendexes.length
        ? greendexes.reduce((a, b) => a + b, 0) / greendexes.length
        : null,
      has_any_discrepancy: cell.discrepancy_count > 0,
    };
  });
}
```

Wire into GlobeTab: read current altitude from `globeRef.current?.pointOfView()`.
If altitude > 1.8: pass `buildH3Clusters(companies.data, 3)` as pointsData.
If altitude ≤ 1.8: pass raw `companies.data`.

H3 cluster tooltip:
```js
pointLabel={d => d.count > 1 ? `
  <div class="globe-tooltip">
    <strong>${d.count} companies</strong><br/>
    Avg Greendex: ${d.avg_greendex?.toFixed(1) ?? 'N/A'}<br/>
    Total emissions: ${(d.total_scope/1e9).toFixed(2)}Gt CO₂<br/>
    ${d.has_any_discrepancy ? '<span style="color:#FF3B3B">⚠ Discrepancies in this cluster</span>' : ''}
    <br/><em>Zoom in to see individual companies</em>
  </div>
` : buildCompanyTooltip(d)}
```

**Verify:** At global zoom, see large colored hexagons. Scroll in — hexagons smoothly dissolve into individual dots. Red hexagons indicate clusters with discrepancy flags.

---

## 5. TASK 2 — NASA FIRMS Active Fire Layer

**What:** Real-time wildfire and thermal anomaly detection layer.
ESG purpose: cross-check corporate zero-deforestation claims against
satellite-detected fires on their concession lands.

**Free API — no auth required for basic access:**
`https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_SNPP_NRT/{area}/{days}`

Get a free MAP_KEY at: https://firms.modaps.eosdis.nasa.gov/api/area/

**Create `Backend/api/nasa-firms.js`:**
```js
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 3600 }); // 1h cache

const FIRMS_KEY = process.env.NASA_FIRMS_KEY || 'DEMO_KEY';
// DEMO_KEY works for testing (rate-limited to 30 requests/day)
// Real key is free, get from firms.modaps.eosdis.nasa.gov/api/area/

module.exports = async function firmsHandler(req, res) {
  const cached = cache.get('firms_data');
  if (cached) {
    return res.json({ ...cached, stale: false });
  }

  try {
    // Fetch global fire data, last 24h, VIIRS 375m resolution
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${FIRMS_KEY}/VIIRS_SNPP_NRT/world/1`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });

    if (!response.ok) throw new Error(`FIRMS API: ${response.status}`);

    const csv = await response.text();
    const lines = csv.trim().split('\n').slice(1); // skip header

    const fires = lines
      .map(line => {
        const [lat, lng, brightness, scan, track, acq_date, acq_time,
               satellite, instrument, confidence, version, bright_t31,
               frp, daynight] = line.split(',');
        return {
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          brightness: parseFloat(brightness),
          confidence: confidence?.trim(),
          frp: parseFloat(frp),         // Fire Radiative Power (MW)
          daynight: daynight?.trim(),
          acq_date: acq_date?.trim(),
        };
      })
      .filter(f =>
        !isNaN(f.lat) &&
        !isNaN(f.brightness) &&
        f.brightness > 320 &&           // filter noise
        ['nominal', 'high'].includes(f.confidence?.toLowerCase())
      );

    const result = {
      data: fires,
      cached_at: new Date().toISOString(),
      stale: false,
      source: 'nasa_firms_viirs',
      ttl: 3600,
      total: fires.length,
    };

    cache.set('firms_data', result);
    res.json(result);

  } catch (err) {
    const stale = cache.get('firms_data');
    if (stale) return res.json({ ...stale, stale: true });
    res.json({ data: [], cached_at: null, stale: true,
               source: 'nasa_firms_viirs', ttl: 3600, error: err.message });
  }
};
```

Mount in `Backend/index.js`:
```js
const firmsHandler = require('./api/nasa-firms');
app.get('/api/globe/fires', firmsHandler);
```

Add to `src/config/layers.config.js`:
```js
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
}
```

Add `useFires` export to `src/hooks/useGlobeData.js`:
```js
export const useFires = () => useDataSource('fires');
```

Wire into GlobeTab fire points alongside existing company points.
Fire tooltip: brightness (K), FRP (MW), date/time of detection.

**Verify:** Fire layer toggle shows orange/red dots across fire-prone regions (California, Amazon, Southeast Asia). Dot size scales with Fire Radiative Power.

---

## 6. TASK 3 — Electricity Maps Grid Carbon Intensity Layer

**What:** Real-time carbon intensity of power grids worldwide.
ESG purpose: auto-calculate verified Scope 2 emissions using actual
grid carbon factor instead of company-self-reported values.

**Free tier:** https://app.electricitymaps.com/docs
Free tier gives: 1 request/second, current zone data only.
Get free key at: electricitymaps.com

**Create `Backend/api/grid-carbon.js`:**
```js
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 900 }); // 15min

// Static zone-to-coordinates mapping for major grids
// (Electricity Maps uses zone codes like "IN-NO", "DE", "US-CAL-CISO")
const GRID_ZONES = [
  { zone: 'IN-NO', name: 'India North Grid', lat: 28.7, lng: 77.1 },
  { zone: 'IN-SO', name: 'India South Grid', lat: 13.1, lng: 80.3 },
  { zone: 'IN-WE', name: 'India West Grid',  lat: 19.1, lng: 72.9 },
  { zone: 'IN-EA', name: 'India East Grid',  lat: 22.6, lng: 88.4 },
  { zone: 'DE',    name: 'Germany',          lat: 51.2, lng: 10.4 },
  { zone: 'GB',    name: 'Great Britain',    lat: 52.5, lng: -1.8 },
  { zone: 'US-CAL-CISO', name: 'California', lat: 36.7, lng: -119.4 },
  { zone: 'SG',    name: 'Singapore',        lat: 1.35, lng: 103.8 },
  { zone: 'JP-TK', name: 'Japan Tokyo',      lat: 35.7, lng: 139.7 },
  { zone: 'CN-SO', name: 'China South',      lat: 23.1, lng: 113.3 },
  { zone: 'AE',    name: 'UAE',              lat: 24.5, lng: 54.4 },
  { zone: 'BR-CS', name: 'Brazil Central',   lat: -15.8, lng: -47.9 },
];

module.exports = async function gridHandler(req, res) {
  const cached = cache.get('grid_data');
  if (cached) return res.json({ ...cached, stale: false });

  const key = process.env.ELECTRICITY_MAPS_KEY;
  if (!key) {
    return res.json({
      data: [], cached_at: null, stale: true,
      source: 'electricity_maps', ttl: 900,
      error: 'ELECTRICITY_MAPS_KEY not set'
    });
  }

  try {
    const results = await Promise.allSettled(
      GRID_ZONES.map(async zone => {
        const r = await fetch(
          `https://api.electricitymap.org/v3/carbon-intensity/latest?zone=${zone.zone}`,
          { headers: { 'auth-token': key }, signal: AbortSignal.timeout(8000) }
        );
        const json = await r.json();
        return {
          ...zone,
          carbon_intensity: json.carbonIntensity,  // gCO2eq/kWh
          fossil_free_pct: json.fossilFreePercentage,
          renewable_pct:   json.renewablePercentage,
          datetime:        json.datetime,
        };
      })
    );

    const data = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(d => d.carbon_intensity != null);

    const result = {
      data,
      cached_at: new Date().toISOString(),
      stale: false, source: 'electricity_maps', ttl: 900,
    };
    cache.set('grid_data', result);
    res.json(result);

  } catch (err) {
    const stale = cache.get('grid_data');
    if (stale) return res.json({ ...stale, stale: true });
    res.json({ data: [], stale: true, source: 'electricity_maps',
               ttl: 900, error: err.message });
  }
};
```

Mount: `app.get('/api/globe/grid', gridHandler);`

Add to `layers.config.js`:
```js
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
}
```

**Critical integration — wire into Risk Agent:**

In `Backend/agents/risk_agent.py`, add Scope 2 verification:
```python
async def verify_scope2_with_grid(state: dict) -> dict:
    """
    Cross-check reported Scope 2 against Electricity Maps grid factor.
    If company uses self-reported grid factor that differs significantly
    from the actual grid carbon intensity for their country, flag it.
    """
    country = state.get("company_country")
    reported_scope2 = state.get("analyst_output", {}).get("scope_2")
    reported_energy = state.get("analyst_output", {}).get("energy_consumption")  # GJ

    if not all([country, reported_scope2, reported_energy]):
        return state

    # Fetch grid carbon intensity for company's country
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"http://localhost:5000/api/globe/grid")
            grid_data = r.json().get("data", [])

        # Find matching zone
        country_grid = next(
            (z for z in grid_data if country.lower() in z["name"].lower()),
            None
        )

        if country_grid:
            ci = country_grid["carbon_intensity"]  # gCO2eq/kWh
            energy_kwh = reported_energy * 277.778  # GJ to kWh
            calculated_scope2 = (energy_kwh * ci) / 1e6  # tonnes CO2e

            tolerance = 0.25  # 25% tolerance
            if reported_scope2 > 0:
                ratio = abs(calculated_scope2 - reported_scope2) / reported_scope2
                if ratio > tolerance:
                    state["scope2_grid_flag"] = {
                        "reported_scope2":   reported_scope2,
                        "calculated_scope2": round(calculated_scope2, 0),
                        "grid_carbon_intensity": ci,
                        "discrepancy_pct":   round(ratio * 100, 1),
                        "severity": "HIGH" if ratio > 0.5 else "MEDIUM",
                        "message": (
                            f"Reported Scope 2 ({reported_scope2:,.0f} tCO₂e) differs "
                            f"{ratio*100:.1f}% from grid-verified estimate "
                            f"({calculated_scope2:,.0f} tCO₂e) using actual grid "
                            f"intensity of {ci} gCO₂eq/kWh for {country}."
                        )
                    }
    except Exception as e:
        import logging
        logging.getLogger("risk_agent").warning(f"Grid verification failed: {e}")

    return state
```

Call `verify_scope2_with_grid(state)` inside `risk_node` after math verification.

**Verify:** Run an audit for a company in India. Risk Agent output should contain `scope2_grid_flag` if their Scope 2 differs significantly from India's grid carbon intensity.

---

## 7. TASK 4 — OpenAQ Air Quality Layer

**What:** Ground-level air quality from 30,000+ global sensors.
ESG purpose: overlay PM2.5 / NO2 against company facility locations.
Facilities reporting low emissions but sitting in high-pollution zones
are a flag — their local environment contradicts their numbers.

**Free API — no auth required:**
`https://api.openaq.org/v3/locations?coordinates={lat},{lng}&radius=50000&limit=10`

**Create `Backend/api/air-quality.js`:**
```js
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 3600 }); // 1h

// Major industrial city coordinates to sample from
const SAMPLE_LOCATIONS = [
  { name: 'Delhi NCR',     lat: 28.6, lng: 77.2 },
  { name: 'Mumbai',        lat: 19.1, lng: 72.9 },
  { name: 'Ahmedabad',     lat: 23.0, lng: 72.6 },
  { name: 'Jamshedpur',    lat: 22.8, lng: 86.2 },  // steel belt
  { name: 'Angul',         lat: 20.8, lng: 85.1 },  // aluminium
  { name: 'Rourkela',      lat: 22.2, lng: 84.8 },  // steel
  { name: 'Shanghai',      lat: 31.2, lng: 121.5 },
  { name: 'Dubai',         lat: 25.2, lng: 55.3 },
  { name: 'Singapore',     lat: 1.35, lng: 103.8 },
  { name: 'São Paulo',     lat: -23.5, lng: -46.6 },
];

const WHO_PM25_THRESHOLD = 15;  // µg/m³ 24h mean (WHO 2021 guideline)

module.exports = async function airQualityHandler(req, res) {
  const cached = cache.get('aq_data');
  if (cached) return res.json({ ...cached, stale: false });

  try {
    const results = await Promise.allSettled(
      SAMPLE_LOCATIONS.map(async loc => {
        const url = `https://api.openaq.org/v3/locations?` +
          `coordinates=${loc.lat},${loc.lng}&radius=30000&limit=5` +
          `&parameters=pm25,no2,so2&order_by=lastUpdated&sort=desc`;
        const r = await fetch(url, {
          headers: { 'X-API-Key': process.env.OPENAQ_KEY || '' },
          signal: AbortSignal.timeout(10000)
        });
        const json = await r.json();
        if (!json.results?.length) return null;

        // Average the PM2.5 readings from nearby sensors
        const pm25_readings = json.results
          .flatMap(s => s.sensors || [])
          .filter(s => s.parameter === 'pm25' && s.lastValue != null)
          .map(s => s.lastValue);

        const avg_pm25 = pm25_readings.length
          ? pm25_readings.reduce((a, b) => a + b, 0) / pm25_readings.length
          : null;

        return {
          name:     loc.name,
          lat:      loc.lat,
          lng:      loc.lng,
          avg_pm25: avg_pm25 ? Math.round(avg_pm25 * 10) / 10 : null,
          exceeds_who: avg_pm25 ? avg_pm25 > WHO_PM25_THRESHOLD : false,
          sensor_count: json.results.length,
          last_updated: json.results[0]?.datetimeLast?.local,
        };
      })
    );

    const data = results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value)
      .filter(d => d.avg_pm25 !== null);

    const result = {
      data,
      cached_at: new Date().toISOString(),
      stale: false, source: 'openaq_v3', ttl: 3600,
      who_threshold: WHO_PM25_THRESHOLD,
    };
    cache.set('aq_data', result);
    res.json(result);

  } catch (err) {
    const stale = cache.get('aq_data');
    if (stale) return res.json({ ...stale, stale: true });
    res.json({ data: [], stale: true, source: 'openaq_v3',
               ttl: 3600, error: err.message });
  }
};
```

Mount: `app.get('/api/globe/air-quality', airQualityHandler);`

Add to `layers.config.js`:
```js
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
}
```

**Verify:** Toggle Air Quality layer. Major Indian industrial cities show orange/red spheres. Singapore shows green. Tooltip shows PM2.5 value and whether it exceeds WHO guideline.

---

## 8. TASK 5 — OpenSanctions Cross-Reference in Audit Pipeline

**What:** Cross-reference every company GreenOrb audits against
OpenSanctions database (320+ global sanction lists).
ESG purpose: sanctioned entities are frequently involved in illegal
logging, blood mining, wildlife trafficking — automatic red flag.

**Free API:** `https://api.opensanctions.org/search/default?q={company_name}&schema=Company`

**Create `Backend/agents/sanctions_checker.py`:**
```python
import httpx
import logging

logger = logging.getLogger("sanctions_checker")
OPENSANCTIONS_URL = "https://api.opensanctions.org/search/default"

async def check_sanctions(company_name: str) -> dict:
    """
    Check company name against OpenSanctions database.
    Returns: {found: bool, matches: list, highest_score: float, risk_level: str}
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                OPENSANCTIONS_URL,
                params={
                    "q":      company_name,
                    "schema": "Company",
                    "limit":  5,
                }
            )
            data = r.json()

        results = data.get("results", [])
        if not results:
            return {"found": False, "matches": [], "highest_score": 0, "risk_level": "NONE"}

        # Score > 0.85: very likely match
        # Score 0.7-0.85: possible match, flag for review
        best = max(results, key=lambda x: x.get("score", 0))
        score = best.get("score", 0)

        risk_level = "NONE"
        if score > 0.85:
            risk_level = "CRITICAL"
        elif score > 0.70:
            risk_level = "HIGH"
        elif score > 0.55:
            risk_level = "MEDIUM"

        return {
            "found":         score > 0.55,
            "highest_score": round(score, 3),
            "risk_level":    risk_level,
            "matches": [{
                "name":      m.get("caption"),
                "score":     m.get("score"),
                "datasets":  m.get("datasets", []),
                "url":       f"https://www.opensanctions.org/entities/{m.get('id')}/"
            } for m in results if m.get("score", 0) > 0.55],
            "message": (
                f"Company name '{company_name}' matched OpenSanctions database "
                f"with {score:.1%} confidence. Sanctioned entities frequently "
                f"engage in illegal environmental crimes."
            ) if score > 0.55 else None
        }

    except Exception as e:
        logger.error(f"OpenSanctions check failed for {company_name}: {e}")
        return {"found": False, "matches": [], "highest_score": 0,
                "risk_level": "UNKNOWN", "error": str(e)}
```

**Wire into `Backend/agents/risk_agent.py`:**

After all other checks, call:
```python
from agents.sanctions_checker import check_sanctions

sanctions_result = await check_sanctions(state.get("company_name", ""))
state["sanctions_check"] = sanctions_result

# If CRITICAL or HIGH: add to risk flags immediately
if sanctions_result["risk_level"] in ("CRITICAL", "HIGH"):
    state["has_critical_flag"] = True
```

**Display in TrustDashboard — add to compliance view:**

If `sanctions_check.found === true`, show a RED banner at the top of
the company audit card:
```
⚠ OpenSanctions Match: [company name] appears in [dataset names]
  Confidence: 89.2%  |  View record →  |  Risk Level: CRITICAL
```

**Verify:** Search for a known sanctioned entity name (e.g., "Rosneft").
Risk Agent output should contain sanctions_check with found=true and
relevant dataset names.

---

## 9. TASK 6 — Cross-Stream Convergence Engine (Web Worker)

**What:** The killer feature from the PDF.
Continuously correlates active fires (FIRMS), air quality spikes (OpenAQ),
and company emission claims — fires an alert when satellite/sensor data
physically contradicts a company's filed ESG report.

**Why Web Worker:** This runs every 5 minutes and processes thousands
of H3 cell comparisons. Must never block the UI thread.

**Create `public/workers/convergence.worker.js`:**
```js
// Runs as a Web Worker — no DOM access, no React, pure computation
// Receives data from main thread, sends alerts back

importScripts('https://cdn.jsdelivr.net/npm/h3-js@4.1.0/dist/h3-js.umd.js');

const H3_RESOLUTION = 5;  // ~50km cells for spatial matching
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;  // 30min between same alert

let lastAlerts = {};  // cell -> timestamp

self.onmessage = function({ data }) {
  const { companies, fires, airQuality, type } = data;

  if (type !== 'CHECK_CONVERGENCE') return;

  const alerts = [];

  companies.forEach(company => {
    if (!company.lat || !company.lng) return;

    const companyCell = h3.latLngToCell(company.lat, company.lng, H3_RESOLUTION);
    const signals = [];

    // Signal 1: Active fire within company's H3 cell or neighbors
    const neighborCells = h3.gridDisk(companyCell, 1);  // company cell + 6 neighbors
    const nearbyFire = fires.find(f => {
      const fireCell = h3.latLngToCell(f.lat, f.lng, H3_RESOLUTION);
      return neighborCells.includes(fireCell) && f.brightness > 340;
    });
    if (nearbyFire) {
      signals.push({
        type:    'THERMAL_ANOMALY',
        label:   'Active fire detected near facility',
        value:   `${nearbyFire.brightness.toFixed(0)}K brightness, ${nearbyFire.frp.toFixed(0)}MW FRP`,
        source:  'NASA VIIRS',
        severity: nearbyFire.brightness > 380 ? 'HIGH' : 'MEDIUM',
      });
    }

    // Signal 2: Air quality spike at company location
    const nearbyAQ = airQuality.find(aq => {
      const aqCell = h3.latLngToCell(aq.lat, aq.lng, H3_RESOLUTION);
      return neighborCells.includes(aqCell) && aq.exceeds_who;
    });
    if (nearbyAQ) {
      signals.push({
        type:    'AIR_QUALITY_SPIKE',
        label:   'PM2.5 exceeds WHO threshold near facility',
        value:   `${nearbyAQ.avg_pm25} µg/m³ (WHO limit: 15 µg/m³)`,
        source:  'OpenAQ',
        severity: nearbyAQ.avg_pm25 > 55 ? 'HIGH' : 'MEDIUM',
      });
    }

    // Signal 3: Company has a known math discrepancy from audit
    if (company.has_discrepancy) {
      signals.push({
        type:    'MATH_DISCREPANCY',
        label:   'Reported vs calculated emissions mismatch',
        value:   'Scope 1+2 does not match reported total',
        source:  'GreenOrb Audit',
        severity: 'HIGH',
      });
    }

    // Signal 4: Missing disclosures (absence signals)
    if (company.absence_signals_count > 2) {
      signals.push({
        type:    'DISCLOSURE_GAPS',
        label:   `${company.absence_signals_count} key metrics not disclosed`,
        value:   'Missing vs sector peers',
        source:  'GreenOrb Sector Baseline',
        severity: 'MEDIUM',
      });
    }

    // Only fire alert if 2+ signals AND not in cooldown
    if (signals.length >= 2) {
      const alertKey = `${company.id}_${companyCell}`;
      const lastAlert = lastAlerts[alertKey] || 0;
      const now = Date.now();

      if (now - lastAlert > ALERT_COOLDOWN_MS) {
        lastAlerts[alertKey] = now;

        const criticalCount = signals.filter(s => s.severity === 'HIGH').length;
        const overallSeverity =
          criticalCount >= 2 ? 'CRITICAL' :
          criticalCount >= 1 ? 'HIGH' : 'MEDIUM';

        alerts.push({
          company_id:   company.id,
          company_name: company.name,
          lat:          company.lat,
          lng:          company.lng,
          h3_cell:      companyCell,
          signal_count: signals.length,
          severity:     overallSeverity,
          signals,
          generated_at: new Date().toISOString(),
          title: `Physical evidence contradicts ${company.name}'s ESG report`,
          summary: `${signals.length} independent data sources show environmental anomalies at or near this facility.`,
        });
      }
    }
  });

  self.postMessage({ type: 'CONVERGENCE_ALERTS', alerts });
};
```

**Create `src/hooks/useConvergenceEngine.js`:**
```js
import { useState, useEffect, useRef, useCallback } from 'react';

export function useConvergenceEngine({ companies, fires, airQuality }) {
  const [alerts, setAlerts]     = useState([]);
  const [running, setRunning]   = useState(false);
  const workerRef               = useRef(null);

  useEffect(() => {
    workerRef.current = new Worker('/workers/convergence.worker.js');

    workerRef.current.onmessage = ({ data }) => {
      if (data.type === 'CONVERGENCE_ALERTS') {
        setAlerts(data.alerts);
        setRunning(false);
      }
    };

    return () => workerRef.current?.terminate();
  }, []);

  const runCheck = useCallback(() => {
    if (!companies.length || !workerRef.current) return;
    setRunning(true);
    workerRef.current.postMessage({
      type: 'CHECK_CONVERGENCE',
      companies,
      fires,
      airQuality,
    });
  }, [companies, fires, airQuality]);

  // Run immediately when data changes, then every 5 minutes
  useEffect(() => {
    if (companies.length) {
      runCheck();
      const interval = setInterval(runCheck, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [companies, fires, airQuality, runCheck]);

  return { alerts, running };
}
```

**Wire into `GlobeTab.jsx`:**

```jsx
import { useConvergenceEngine } from '../hooks/useConvergenceEngine';

// In component:
const { alerts: convergenceAlerts, running: convergenceRunning } =
  useConvergenceEngine({
    companies: companies.data,
    fires:     fires.data,
    airQuality: airQuality.data,
  });

// Add convergence alerts as a special pulsing ring layer:
// ringsData — use convergenceAlerts for high-visibility "Evidence Contradiction" markers
// Ring color: #FF0040 (critical red), size scales with signal count
// Clicking opens a special "Physical Evidence Report" panel

// Add alert counter to the LIVE header:
// "LIVE · 4 agents active · 2 audits · 929 companies · 3 ⚠ evidence contradictions"
```

**Create the Convergence Alert panel:**

When a convergence alert point is clicked, open a distinct panel
(different from the standard company panel) styled like a threat report:

```
┌─────────────────────────────────────────────────────────┐
│  ⚠ PHYSICAL EVIDENCE CONTRADICTION          CRITICAL    │
│  Tata Steel — Jamshedpur, India                         │
│  3 independent signals contradict filed ESG report      │
├─────────────────────────────────────────────────────────┤
│  SIGNAL 1 · NASA VIIRS · HIGH                           │
│  Active fire detected near facility                     │
│  345K brightness, 87MW Fire Radiative Power             │
│                                                         │
│  SIGNAL 2 · OpenAQ · HIGH                               │
│  PM2.5: 67 µg/m³ (4.5× WHO threshold)                  │
│                                                         │
│  SIGNAL 3 · GreenOrb Audit · HIGH                       │
│  Scope 1+2 = 19.4Mt, reported total = 16.1Mt           │
│  Discrepancy: 3.3Mt unexplained                         │
├─────────────────────────────────────────────────────────┤
│  Generated: 2026-03-21T14:32:00Z  |  Open full audit → │
└─────────────────────────────────────────────────────────┘
```

Style this with: left border 4px solid #FF0040, background slightly
tinted red using our existing CSS variables.

**Verify:** With fires and air quality data loaded, any company whose
location overlaps with a fire AND an air quality spike AND has a
discrepancy flag should generate a convergence alert. A red pulsing
ring should appear on the globe at that location.

---

## 10. TASK 7 — Historical Playback Scrubber

**What:** Timeline control for the globe — Rewind / Play / Live.
ESG purpose: see when a company's Greendex changed, when fires were
active near their facility, temporal audit trail.

**What this requires:**
The backend needs to store timestamped snapshots of company scores.
The frontend needs a time scrubber UI.

**Modify `Backend/api/globe-points.js`:**

Add an optional `?date=YYYY-MM-DD` query param:
```js
// If date param present: query companies table with created_at filter
// If no date: return current data (existing behavior)
const date = req.query.date;
let query;
if (date) {
  // Return the state of companies as of that date
  // Requires companies table to have updated_at column (should already exist)
  query = `SELECT * FROM companies WHERE DATE(updated_at) <= $1
           ORDER BY updated_at DESC`;
  // This gives the most recent audit for each company as of that date
} else {
  query = `SELECT * FROM companies ORDER BY updated_at DESC`;
}
```

**Create `src/components/TimelineScrubber.jsx`:**
```jsx
// A compact timeline control bar:
// [|< Rewind]  [< -1d] [■ Play] [+1d >]  [● Live]
//  ───────────────●──────────────────────────
//  7d ago       5d ago      3d ago      Now

import { useState, useEffect, useCallback } from 'react';

const RANGE_DAYS = 7;

export function TimelineScrubber({ onDateChange, onLive }) {
  const [playing,  setPlaying]  = useState(false);
  const [dayOffset, setOffset]  = useState(0);   // 0 = live, -7 = 7 days ago
  const [isLive,   setIsLive]   = useState(true);

  const goLive = useCallback(() => {
    setOffset(0); setIsLive(true); setPlaying(false);
    onLive();
  }, [onLive]);

  const seek = useCallback((delta) => {
    setOffset(prev => {
      const next = Math.max(-RANGE_DAYS, Math.min(0, prev + delta));
      setIsLive(next === 0);
      const date = new Date();
      date.setDate(date.getDate() + next);
      onDateChange(date.toISOString().split('T')[0]);
      return next;
    });
  }, [onDateChange]);

  // Auto-play: advance 1 day every 2 seconds
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setOffset(prev => {
        if (prev >= 0) { setPlaying(false); setIsLive(true); return 0; }
        const next = prev + 1;
        const date = new Date();
        date.setDate(date.getDate() + next);
        onDateChange(date.toISOString().split('T')[0]);
        return next;
      });
    }, 2000);
    return () => clearInterval(t);
  }, [playing, onDateChange]);

  const displayDate = dayOffset === 0
    ? 'Live'
    : new Date(Date.now() + dayOffset * 86400000).toLocaleDateString();

  return (
    <div className="timeline-scrubber">
      <button onClick={() => seek(-7)} title="Jump to 7 days ago">|&lt;</button>
      <button onClick={() => seek(-1)}>-1d</button>
      <button onClick={() => setPlaying(p => !p)}>
        {playing ? '■' : '▶'}
      </button>
      <button onClick={() => seek(+1)}>+1d</button>
      <button
        onClick={goLive}
        className={isLive ? 'active' : ''}
      >● Live</button>
      <div className="timeline-scrubber__track">
        <input
          type="range"
          min={-RANGE_DAYS} max={0} value={dayOffset}
          onChange={e => seek(parseInt(e.target.value) - dayOffset)}
          style={{ flex: 1 }}
        />
        <span className="timeline-scrubber__date">{displayDate}</span>
      </div>
    </div>
  );
}
```

Wire into `GlobeTab.jsx`:
- When `onDateChange` fires: re-fetch `/api/globe/companies?date=YYYY-MM-DD`
- When `onLive` fires: revert to default (no date param)
- Position scrubber at bottom center of globe (above the source health bar)

CSS for scrubber:
```css
.timeline-scrubber {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--sf);
  border-top: 1px solid var(--bd);
  font-size: 12px;
}
.timeline-scrubber button {
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid var(--bd);
  background: transparent;
  color: var(--tx);
  cursor: pointer;
  font-size: 11px;
}
.timeline-scrubber button.active {
  background: var(--tx);
  color: var(--sf);
}
.timeline-scrubber__track {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}
.timeline-scrubber__date {
  min-width: 80px;
  text-align: right;
  color: var(--tx2);
  font-size: 11px;
}
```

**Verify:** Timeline scrubber visible at bottom of globe. Click -1d: globe
re-fetches data from yesterday. Click Play: globe animates forward through
7 days, each day showing that day's company scores and fire data. Live
button returns to current data.

---

## 11. ENVIRONMENT VARIABLES TO ADD

Add these to `.env`:
```
NASA_FIRMS_KEY=           # free from firms.modaps.eosdis.nasa.gov/api/area/
ELECTRICITY_MAPS_KEY=     # free tier from app.electricitymaps.com
OPENAQ_KEY=               # optional, increases rate limits (free signup)
# OpenSanctions: no key needed, API is free
```

---

## 12. FULL VERIFICATION CHECKLIST

After all 7 tasks complete, verify:

```
□ H3 clustering: global zoom shows hexagons, zoom in → individual dots
□ H3 cluster tooltip shows company count + avg Greendex + emissions
□ Fire layer (NASA FIRMS): toggle shows orange/red dots on active fires
□ Fire tooltip shows brightness (K) and FRP (MW)
□ Air quality layer (OpenAQ): toggle shows PM2.5 spheres on industrial cities
□ Air quality tooltip shows µg/m³ value + WHO threshold comparison
□ Grid carbon layer (Electricity Maps): toggle shows grid intensity by zone
□ Grid layer tooltip shows gCO₂eq/kWh and renewable %
□ Scope 2 verification: run audit for Indian company → risk output has scope2_grid_flag
□ OpenSanctions: test with known sanctioned entity name → risk output has sanctions_check.found=true
□ Convergence engine: Web Worker loads without error (check browser console)
□ With fires + AQ + discrepancy data: convergence alert appears as red ring on globe
□ Click convergence ring → Physical Evidence Contradiction panel opens
□ Panel shows all signals with source attribution
□ Timeline scrubber visible at bottom of globe
□ Click -1d → companies refetch with date param
□ Click Play → globe animates through 7 days
□ Click Live → returns to current data
□ Source health bar still shows all sources (including new ones)
□ LIVE counter includes "X ⚠ evidence contradictions"
□ All curl tests pass with correct envelope:
    curl http://localhost:5000/api/globe/fires
    curl http://localhost:5000/api/globe/grid
    curl http://localhost:5000/api/globe/air-quality
```

---

*End of GreenOrb Atmospheric Intelligence prompt.*
*7 tasks. Physical evidence layer. Cross-stream convergence. Timeline playback.*
*Everything built on top of the existing globe — nothing from the previous session is modified.*
