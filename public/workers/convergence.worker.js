// Runs as a Web Worker — no DOM access, no React, pure computation
// Receives data from main thread, sends alerts back

importScripts('https://cdn.jsdelivr.net/npm/h3-js@4.1.0/dist/h3-js.umd.js');

const H3_RESOLUTION = 5;  // ~50km cells for spatial matching
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;  // 30min between same alert

let lastAlerts = {};  // cell -> timestamp

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

self.onmessage = function({ data }) {
  const { companies, fires, airQuality, disasters, type } = data;

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

    // Signal 5: Physical Proximity to Disasters (DIS Scoring)
    if (disasters && disasters.length > 0) {
      disasters.forEach(d => {
        if (!d.lat || !d.lng) return;
        const dist = getDistance(company.lat, company.lng, d.lat, d.lng);
        if (dist <= 100) { // 100km radius threshold
           // Calculate Disaster Intelligence Score (DIS)
           const baseSev = d.severity || d.mag || 1; // 1-10 mapping roughly
           const normSev = Math.min(baseSev / 10, 1) * 50; 
           const proxScore = ((100 - dist) / 100) * 50;
           const disScore = Math.round(normSev + proxScore);

           if (disScore > 40) {
             signals.push({
               type: 'PHYSICAL_PROXIMITY_ALERT',
               label: `${d.type === 'earthquake' ? 'Earthquake' : d.disaster_type || 'Disaster'} within ${dist.toFixed(1)}km`,
               value: `DIS Score: ${disScore}/100`,
               source: d.source || 'GreenOrb Threat Intel',
               severity: disScore >= 80 ? 'CRITICAL' : disScore >= 60 ? 'HIGH' : 'MEDIUM',
             });
           }
        }
      });
    }

    // Only fire alert if 2+ signals OR a critical DIS proximity hit AND not in cooldown
    if (signals.length >= 2 || signals.some(s => s.type === 'PHYSICAL_PROXIMITY_ALERT' && (s.severity === 'CRITICAL' || s.severity === 'HIGH'))) {
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
