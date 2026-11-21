import { useState, useEffect, useCallback } from 'react';

/**
 * useEmissionsData — fetches live emission data from the Express API
 * for rendering on the react-globe.gl visualization.
 * 
 * Returns: { data: Array, loading: boolean, error: string|null, refresh: Function }
 * 
 * Each point: { lat, lng, size, color, company, scopeTotal }
 */
export function useEmissionsData() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/emissions/globe-points');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const points = await response.json();
            setData(points);
        } catch (e) {
            console.warn('[useEmissionsData] API unavailable, using static fallback:', e.message);
            setError(e.message);
            // Don't clear existing data on refresh failure
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return { data, loading, error, refresh: fetchData };
}

/**
 * useAgentStatus — polls the backend for real-time LangGraph agent status.
 * Used by TrustDashboard to show live processing updates.
 * 
 * Returns: { audits: Array, loading: boolean, error: string|null }
 */
export function useAgentStatus(pollInterval = 5000) {
    const [audits, setAudits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let alive = true;

        const poll = async () => {
            try {
                const res = await fetch('/api/agent/status');
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (alive) {
                    setAudits(data);
                    setLoading(false);
                }
            } catch (e) {
                if (alive) {
                    setError(e.message);
                    setLoading(false);
                }
            }
        };

        poll();
        const timer = setInterval(poll, pollInterval);
        return () => {
            alive = false;
            clearInterval(timer);
        };
    }, [pollInterval]);

    return { audits, loading, error };
}

/**
 * submitVerdict — POST a human-in-the-loop verdict decision to the API.
 * Called from TrustDashboard Accept/Reject buttons.
 */
export async function submitVerdict(auditId, verdict, company = '') {
    try {
        const response = await fetch('/api/verdicts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ auditId, verdict, company })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error('[submitVerdict] Failed:', e.message);
        return { success: false, error: e.message };
    }
}
