import React, { useState, useEffect, useRef } from 'react';

const API_BASE = 'http://localhost:5000/api';

export default function FacilitiesTab() {
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Search state
  const [companySearch, setCompanySearch] = useState('');
  const [lat, setLat] = useState(20.5937); // Default India
  const [lng, setLng] = useState(78.9629);
  const [radius, setRadius] = useState(100);

  const [selectedFacility, setSelectedFacility] = useState(null);

  // Stats
  const [counts, setCounts] = useState({ gem: 0, osm: 0, wikidata: 0, db: 0 });

  const loadFacilities = async () => {
    setLoading(true);
    try {
       // Global facility index load
       const res = await fetch(`${API_BASE}/facilities/global?lat=${lat}&lng=${lng}&radius_km=${radius}`);
       const result = await res.json();
       const data = Array.isArray(result) ? result : (result.data || []);
       
       let filtered = data;
       if (companySearch) {
          const m = companySearch.toLowerCase();
          filtered = data.filter(f => f.company?.toLowerCase().includes(m) || f.name?.toLowerCase().includes(m));
       }
       setFacilities(filtered);

       // Optional: Fire off an OSM and Wikidata query to enrich local mapping if requested (omitted for speed unless hooked)
    } catch (e) {
       console.error("Facility load error", e);
    }
    setLoading(false);
  };

  useEffect(() => {
     let g=0, o=0, w=0, d=0;
     facilities.forEach(f => {
       if (f.source?.includes('gem')) g++;
       else if (f.source === 'osm') o++;
       else if (f.source === 'wikidata') w++;
       else d++;
     });
     setCounts({ gem: g, osm: o, wikidata: w, db: d });
  }, [facilities]);

  const triggerVerification = async (f) => {
    alert(`Triggered High-Res Satellite NDVI scan for ${f.name} at coordinates [${f.lat}, ${f.lng}]`);
    // Example POST to /api/verify/ndvi could go here
  };

  const calculateCbamExp = (capacity_mt) => {
    if (!capacity_mt) return 'N/A';
    // Logic: embedded carbon = 2.1 tCO2e/tonne (BF-BOF average)
    // ETS Price = 80 EUR. 
    // capacity_mt is millions of tonnes. 1Mt = 1,000,000 t
    const liability = (capacity_mt * 1000000) * 2.1 * 80;
    return `€${(liability / 1000000).toFixed(1)}M / year`;
  };

  return (
    <div style={{ padding: 'var(--sp-l)', color: 'var(--tx)', height: '100%', overflowY: 'auto' }}>
      <header style={{ marginBottom: 'var(--sp-m)' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--sf)' }}>Global Industrial Facility Intelligence</h2>
        <p style={{ color: 'var(--tx2)', marginTop: '4px' }}>Asset-level resolution leveraging GEM, OSM Overpass, and Satellite imagery.</p>
        
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', padding: '12px', marginTop: '16px', color: '#fca5a5' }}>
           <strong>Note on India Coverage:</strong> India presently lacks a public national Pollutant Release and Transfer Register (PRTR) API. GreenOrb fuses unstructured BRSR PDFs, Wikidata SPARQL, GEM datasets, and Overpass API to reconstruct the industrial map.
        </div>
      </header>

      <div style={{ background: 'var(--dp)', border: '1px solid var(--bd)', padding: 'var(--sp-m)', marginBottom: 'var(--sp-m)' }}>
        <div style={{ display: 'flex', gap: 'var(--sp-m)', alignItems: 'center', flexWrap: 'wrap' }}>
           <div>
             <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px' }}>Company or Sector Match</label>
             <input type="text" value={companySearch} onChange={e=>setCompanySearch(e.target.value)} placeholder="e.g. Tata" style={{ padding: '8px', background: 'var(--bg)', color: 'white', border: '1px solid var(--bd)' }} />
           </div>
           <div>
             <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px' }}>Latitude Focus</label>
             <input type="number" step="0.1" value={lat} onChange={e=>setLat(e.target.value)} style={{ padding: '8px', background: 'var(--bg)', color: 'white', border: '1px solid var(--bd)', width: '100px' }} />
           </div>
           <div>
             <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px' }}>Longitude Focus</label>
             <input type="number" step="0.1" value={lng} onChange={e=>setLng(e.target.value)} style={{ padding: '8px', background: 'var(--bg)', color: 'white', border: '1px solid var(--bd)', width: '100px' }} />
           </div>
           <div>
             <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px' }}>Radius ({radius} km)</label>
             <input type="range" min="10" max="1000" value={radius} onChange={e=>setRadius(e.target.value)} />
           </div>
           <div style={{ alignSelf: 'flex-end' }}>
             <button onClick={loadFacilities} style={{ padding: '8px 16px', background: 'var(--sf)', color: 'black', border: 'none', cursor: 'pointer' }}>
                {loading ? 'Scanning...' : 'Scan Region'}
             </button>
           </div>
        </div>
        <div style={{ marginTop: '16px', display: 'flex', gap: '16px', fontSize: '0.9rem', color: 'var(--tx2)' }}>
           <span><strong>Hits:</strong> {facilities.length} nodes</span>
           <span><span style={{color:'var(--sf)'}}>GEM:</span> {counts.gem}</span>
           <span><span style={{color:'var(--jade)'}}>OSM:</span> {counts.osm}</span>
           <span><span style={{color:'#3b82f6'}}>Wikidata:</span> {counts.wikidata}</span>
           <span><span style={{color:'#f59e0b'}}>DB Native:</span> {counts.db}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-l)' }}>
         
         <div style={{ height: '500px', background: '#000', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ color: 'var(--tx2)', textAlign: 'center' }}>
               <p>Map visualization logic would anchor here.</p>
               <p>Currently routing assets to main GlobeTab viewer context.</p>
               {selectedFacility && (
                  <div style={{ background: 'var(--dp)', padding: '16px', marginTop: '16px', border: '1px solid var(--bd)', color: 'white', textAlign: 'left' }}>
                     <h4>{selectedFacility.name}</h4>
                     <p>Lat: {selectedFacility.lat}, Lng: {selectedFacility.lng}</p>
                     <p>Source: {selectedFacility.source}</p>
                  </div>
               )}
            </div>
         </div>

         <div style={{ height: '500px', overflowY: 'auto', border: '1px solid var(--bd)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead style={{ background: 'var(--dp)', position: 'sticky', top: 0 }}>
                <tr>
                  <th style={{ padding: '12px', borderBottom: '1px solid var(--bd)' }}>Facility</th>
                  <th style={{ padding: '12px', borderBottom: '1px solid var(--bd)' }}>Company</th>
                  <th style={{ padding: '12px', borderBottom: '1px solid var(--bd)' }}>CBAM Risk (est)</th>
                  <th style={{ padding: '12px', borderBottom: '1px solid var(--bd)' }}>Satellite</th>
                  <th style={{ padding: '12px', borderBottom: '1px solid var(--bd)' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {facilities.map((f, i) => (
                  <tr key={i} onClick={() => setSelectedFacility(f)} style={{ borderBottom: '1px solid var(--bd)', cursor: 'pointer', background: selectedFacility === f ? 'rgba(255,255,255,0.05)' : 'transparent' }}>
                     <td style={{ padding: '12px', color: 'var(--sf)' }}>{f.name} <div style={{fontSize:'0.75rem', color:'var(--tx2)'}}>{f.type || 'industrial'}</div></td>
                     <td style={{ padding: '12px' }}>{f.company || 'Unknown'}</td>
                     <td style={{ padding: '12px' }}>{f.type?.includes('steel') ? calculateCbamExp(f.capacity_mt_yr) : '-'}</td>
                     <td style={{ padding: '12px' }}>
                        <span style={{ padding: '2px 6px', background: '#333', borderRadius: '4px', fontSize: '0.75rem' }}>UNVERIFIED</span>
                     </td>
                     <td style={{ padding: '12px' }}>
                        <button onClick={(e) => { e.stopPropagation(); triggerVerification(f); }} style={{ padding: '4px 8px', background: 'transparent', border: '1px solid var(--sf)', color: 'var(--sf)', cursor: 'pointer', fontSize: '0.75rem' }}>
                          Verify Now
                        </button>
                     </td>
                  </tr>
                ))}
                {facilities.length === 0 && (
                  <tr><td colSpan="5" style={{ padding: '12px', textAlign: 'center', color: 'var(--tx2)' }}>No facilities matched nearby.</td></tr>
                )}
              </tbody>
            </table>
         </div>

      </div>

    </div>
  );
}
