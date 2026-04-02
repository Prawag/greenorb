import { useState, useEffect } from 'react';
import { LAYERS } from '../config/layers.config';

const API_BASE = 'http://localhost:5000';

class GlobeDataStore {
  constructor() {
    this.state = {};
    this.subscribers = new Set();
    this.bootstrapped = false;
    this.isHidden = false;
    this.lastQueryParams = {};
    
    // Initialize empty state
    Object.keys(LAYERS).forEach(key => {
      this.state[key] = { data: [], loading: true, stale: false, error: null, cached_at: null };
    });

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.isHidden = document.hidden;
      });
    }
  }

  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  notify(layerId) {
    this.subscribers.forEach(fn => fn(layerId, this.state[layerId]));
  }

  async fetchLayer(layerId, queryParams = '') {
    const layer = LAYERS[layerId];
    if (!layer || !layer.endpoint) return;
    
    this.lastQueryParams[layerId] = queryParams;
    const endpoint = `${layer.endpoint}${queryParams}`;

    try {
      const res = await fetch(`${API_BASE}${endpoint}`);
      const json = await res.json();
      
      // Store current valid data safely
      this.state[layerId] = {
        data: json.data || [],
        loading: false,
        stale: json.stale || false,
        error: null,
        cached_at: json.cached_at
      };
      this.notify(layerId);
    } catch (e) {
      // Stale-on-error: retain existing data, just mark stale and store error
      this.state[layerId] = {
        ...this.state[layerId],
        loading: false,
        stale: true,
        error: e.message
      };
      this.notify(layerId);
    }
  }

  startPolling(layerId) {
    const layer = LAYERS[layerId];
    if (!layer || !layer.endpoint) return;
    
    const baseInterval = layer.ttl || 300_000;
    
    const scheduleNext = () => {
      // 15% jitter: (0.85 + Math.random() * 0.3)
      const jitter = baseInterval * (0.85 + Math.random() * 0.3);
      // Hidden tab throttle x10
      const delay = this.isHidden ? jitter * 10 : jitter;
      
      setTimeout(async () => {
        await this.fetchLayer(layerId, this.lastQueryParams[layerId] || '');
        scheduleNext();
      }, delay);
    };
    
    scheduleNext();
  }

  async bootstrap(queryParams = '') {
    if (this.bootstrapped) return;
    this.bootstrapped = true;

    // Defines priority groups
    const t1 = ['earthquakes', 'fires', 'floods', 'cyclones', 'volcanoes', 'eonet']; 
    const t2 = ['companies', 'countries', 'airQuality', 'gridCarbon'];
    const t3 = ['newsVelocity', 'climateTrace', 'gdelt', 'greenwashVelocity', 'gpm_precipitation', 'sentinel_atmosphere', 'biodiversity_index', 'ocean_currents', 'water_stress', 'forest_loss', 'coral_bleaching', 'fishing_watch'];

    const fireTier = (tierList) => {
      Promise.all(
        tierList.filter(id => LAYERS[id]).map(id => this.fetchLayer(id, id === 'companies' ? queryParams : ''))
      );
    };

    // Parallel fetch pattern
    fireTier(t1); // Instant
    setTimeout(() => fireTier(t2), 100); // 100ms
    setTimeout(() => fireTier(t3), 600); // 600ms

    // Start polling sequence for all supported layers
    Object.keys(LAYERS).forEach(id => {
      if (LAYERS[id].endpoint) {
        this.startPolling(id);
      }
    });
  }
}

const store = new GlobeDataStore();

function useDataSource(layerId, queryParams = '') {
  // Ensure we register the queryParam (e.g., date for companies) dynamically
  if (queryParams) {
    store.lastQueryParams[layerId] = queryParams;
  }

  const [state, setState] = useState(() => store.state[layerId] || { data: [], loading: true, stale: false, error: null, cached_at: null });

  useEffect(() => {
    store.bootstrap(queryParams);
    
    if (queryParams && store.bootstrapped) {
         // Re-trigger a manual fetch if the dependency params altered after mount
         store.fetchLayer(layerId, queryParams);
    }

    const unsubscribe = store.subscribe((updatedLayerId, newState) => {
      if (updatedLayerId === layerId) {
        setState({ ...newState });
      }
    });
    
    return unsubscribe;
  }, [layerId, queryParams]);

  return state;
}

// Export one hook per layer
export const useCompanies    = (date) => useDataSource('companies', date ? `?date=${date}` : '');
export const useCountries    = () => useDataSource('countries');
export const useNewsVelocity = () => useDataSource('newsVelocity');
export const useClimateTrace = () => useDataSource('climateTrace');
export const useFires        = () => useDataSource('fires');
export const useGridCarbon   = () => useDataSource('gridCarbon');
export const useAirQuality   = () => useDataSource('airQuality');
export const useEarthquakes  = () => useDataSource('earthquakes');
export const useFloods       = () => useDataSource('floods');
export const useCyclones     = () => useDataSource('cyclones');
export const useVolcanoes    = () => useDataSource('volcanoes');
export const useEonet        = () => useDataSource('eonet');
export const useGdelt = () => useDataSource('gdelt', '', 900000); // 15 mins
export const useGreenwashVelocity = () => useDataSource('greenwashVelocity', '', 900000); // 15 mins

// ─── SPRINT 3: ENVIRONMENTAL & ATMOSPHERIC LAYERS ─────────────────────────────
export const useGpmImerg = () => useDataSource('gpm_precipitation');
export const useSentinel = () => useDataSource('sentinel_atmosphere');
export const useBiodiversity = () => useDataSource('biodiversity_index');

// ─── SPRINT 4: OCEAN & LAND INTELLIGENCE ──────────────────────────────────────
export const useOceanCurrents = () => useDataSource('ocean_currents');
export const useWaterStress = () => useDataSource('water_stress');
export const useForestLoss = () => useDataSource('forest_loss');
export const useCoralBleaching = () => useDataSource('coral_bleaching');
export const useFishingWatch = () => useDataSource('fishing_watch');

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
