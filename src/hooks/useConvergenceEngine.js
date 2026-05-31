import { useState, useEffect, useRef, useCallback } from 'react';

export function useConvergenceEngine({ companies, fires, airQuality, disasters = [] }) {
  const [alerts, setAlerts]     = useState([]);
  const [running, setRunning]   = useState(false);
  const workerRef               = useRef(null);

  useEffect(() => {
    workerRef.current = new Worker('/workers/convergence.worker.js');

    workerRef.current.onmessage = ({ data }) => {
      if (data.type === 'CONVERGENCE_ALERTS') {
        setAlerts(data.alerts);
        setRunning(false);
        // Dispatch to backend to persist physical proximity alerts to DB
        const physicalAlerts = data.alerts.filter(a => a.signals.some(s => s.type === 'PHYSICAL_PROXIMITY_ALERT'));
        if (physicalAlerts.length > 0) {
            fetch('http://localhost:5000/api/disasters-proximity', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ alerts: physicalAlerts })
            }).catch(console.error);
        }
      }
    };

    return () => workerRef.current?.terminate();
  }, []);

  const runCheck = useCallback(() => {
    if (!companies.length || !workerRef.current) return;
    setRunning(true);
    
    // Safely extract only the properties the Web Worker needs to prevent DataCloneError and out-of-memory crashes
    const safeCompanies = companies.map(c => ({
      id: c.id, name: c.name, lat: c.lat, lng: c.lng, 
      has_discrepancy: c.has_discrepancy, absence_signals_count: c.absence_signals_count
    }));
    
    const safeFires = fires.map(f => ({
      lat: f.lat, lng: f.lng, brightness: f.brightness, frp: f.frp
    }));
    
    const safeAQ = airQuality.map(aq => ({
      lat: aq.lat, lng: aq.lng, avg_pm25: aq.avg_pm25, exceeds_who: aq.exceeds_who
    }));
    
    const safeDisasters = disasters.map(d => ({
      lat: d.lat, lng: d.lng, severity: d.severity, mag: d.mag, 
      type: d.type, disaster_type: d.disaster_type, source: d.source
    }));

    workerRef.current.postMessage({
      type: 'CHECK_CONVERGENCE',
      companies: safeCompanies,
      fires: safeFires,
      airQuality: safeAQ,
      disasters: safeDisasters,
    });
  }, [companies, fires, airQuality, disasters]);

  // Run immediately when data changes, then every 5 minutes
  useEffect(() => {
    if (companies.length) {
      runCheck();
      const interval = setInterval(runCheck, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [companies, fires, airQuality, disasters, runCheck]);

  return { alerts, running };
}
