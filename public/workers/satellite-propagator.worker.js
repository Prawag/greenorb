import * as satellite from 'https://unpkg.com/satellite.js/lib/index.js'; // Using unpkg for valid ESM in raw browser worker without bundler

let propagationInterval = null;
let satelliteData = [];

// Specific categories matching the color coding
const CATEGORIES = {
    'ISS': { color: '#ec4899', type: 'crewed' },        // pink
    'GPS': { color: '#14b8a6', type: 'nav' },           // teal
    'GLONASS': { color: '#14b8a6', type: 'nav' },       // teal
    'GALILEO': { color: '#14b8a6', type: 'nav' },       // teal
    'BEIDOU': { color: '#14b8a6', type: 'nav' },        // teal
    'STARLINK': { color: '#6366f1', type: 'comms-mega' }, // indigo
    'ONEWEB': { color: '#6366f1', type: 'comms-mega' }, // indigo
    'GOES': { color: '#f59e0b', type: 'weather-geo' },   // amber
    'TERRA': { color: '#3b82f6', type: 'eo' },          // blue
    'AQUA': { color: '#3b82f6', type: 'eo' },           // blue
    'SENTINEL': { color: '#3b82f6', type: 'eo' },       // blue
    'JASON': { color: '#a855f7', type: 'climate' }      // purple
};

const getCategoryColor = (name) => {
    const caps = name.toUpperCase();
    for (const [key, value] of Object.entries(CATEGORIES)) {
        if (caps.includes(key)) return value.color;
    }
    return '#9ca3af'; // gray default
};

async function fetchTLEs() {
    try {
        const responses = await Promise.all([
            fetch('https://celestrak.org/SOCRATES/query.php?CATALOG=stations').then(res => res.text()),
            fetch('https://celestrak.org/SOCRATES/query.php?CATALOG=visual').then(res => res.text()),
            fetch('https://celestrak.org/SOCRATES/query.php?CATALOG=active').then(res => res.text())
        ]);
        
        let allTles = responses.join('\n');
        parseTLEs(allTles);
    } catch (e) {
        console.error("Failed to fetch TLEs for satellite.js worker", e);
    }
}

function parseTLEs(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const parsed = [];
    
    // We only want ~40 representative satellites to save CPU and match spec
    const targetKeywords = ['ISS (ZARYA)', 'TERRA', 'AQUA', 'GOES-16', 'SENTINEL-1A', 'SENTINEL-2A', 'SENTINEL-2B', 'SENTINEL-3A', 'GPS BIIR-10', 'GPS BIIF-12', 'GLONASS-M 755', 'GSAT-31', 'WORLDVIEW-3', 'JASON-3'];
    
    // Pick first 5 starlink
    let starlinkCount = 0;
    
    for (let i = 0; i < lines.length; i += 3) {
        if (!lines[i] || !lines[i+1] || !lines[i+2]) continue;
        const name = lines[i].replace(/^0\s+/, '').trim();
        const line1 = lines[i+1];
        const line2 = lines[i+2];
        
        const isTarget = targetKeywords.some(k => name.includes(k));
        const isStarlink = name.includes('STARLINK');
        
        if (isTarget || (isStarlink && starlinkCount < 5)) {
            if (isStarlink) starlinkCount++;
            
            try {
                const satrec = satellite.twoline2satrec(line1, line2);
                parsed.push({ name, satrec, color: getCategoryColor(name), category: 'sat' });
            } catch(e) {}
        }
    }
    
    satelliteData = parsed;
    propagatePositions();
}

function propagatePositions() {
    if (!satelliteData.length) return;
    
    const now = new Date();
    const gmst = satellite.gstime(now);
    const updated = [];
    
    for (const sat of satelliteData) {
        try {
            const positionAndVelocity = satellite.propagate(sat.satrec, now);
            const positionEci = positionAndVelocity.position;
            
            if (!positionEci || typeof positionEci.x === 'undefined') continue;
            
            const positionGd = satellite.eciToGeodetic(positionEci, gmst);
            
            updated.push({
                type: 'sat',
                name: sat.name,
                lat: satellite.degreesLat(positionGd.latitude),
                lng: satellite.degreesLong(positionGd.longitude),
                alt: positionGd.height, 
                color: sat.color,
                category: sat.category
            });
        } catch(e) {
            // Silently skip unpropagatable satellites
        }
    }
    
    postMessage({ type: 'SAT_UPDATE', satellites: updated });
}

self.onmessage = (e) => {
    if (e.data.type === 'START') {
        if (!satelliteData.length) {
            fetchTLEs();
        }
        if (propagationInterval) clearInterval(propagationInterval);
        propagationInterval = setInterval(propagatePositions, 3000);
        // Refresh TLEs every 2 hours
        setInterval(fetchTLEs, 2 * 60 * 60 * 1000);
    } else if (e.data.type === 'STOP') {
        if (propagationInterval) clearInterval(propagationInterval);
        propagationInterval = null;
    }
};
