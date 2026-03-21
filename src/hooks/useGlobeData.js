import { useState, useEffect, useRef, useCallback } from 'react';
import { LAYERS } from '../config/layers.config';

// Single hook that manages all globe data sources independently.
// Each source has its own fetch cycle, TTL, stale state, and error state.
// Sources never block each other — one failing doesn't stop others.

const API_BASE = 'http://localhost:5000';

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

  const fetchData = useCallback(async () => {
    if (!layer?.endpoint) return;
    try {
      const res  = await fetch(`${API_BASE}${layer.endpoint}`);
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
    fetchData();
    timerRef.current = setInterval(fetchData, layer?.ttl || 300_000);
    return () => clearInterval(timerRef.current);
  }, [fetchData, layer?.ttl]);

  return state;
}

// Export one hook per layer — clean API for components
export const useCompanies    = () => useDataSource('companies');
export const useCountries    = () => useDataSource('countries');
export const useNewsVelocity = () => useDataSource('newsVelocity');
export const useClimateTrace = () => useDataSource('climateTrace');

// Agent status hook — polls every 30s
export function useAgentStatus() {
  const [status, setStatus] = useState({
    active_agents: 0,
    audits_in_progress: 0,
    audits_completed_today: 0,
    total_companies: 0,
    last_audit_completed_at: null,
  });

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/agent/status`);
        const data = await res.json();
        if (alive) setStatus(data);
      } catch (e) {
        // silent fail
      }
    };
    poll();
    const timer = setInterval(poll, 30_000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  return status;
}
