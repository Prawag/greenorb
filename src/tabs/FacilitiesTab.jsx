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
  };

  const calculateCbamExp = (capacity_mt) => {
    if (!capacity_mt) return 'N/A';
    const liability = (capacity_mt * 1000000) * 2.1 * 80;
    return `€${(liability / 1000000).toFixed(1)}M / year`;
  };

  return (
    <div style={{ padding: '24px', color: 'var(--body-text)', height: '100%', overflowY: 'auto' }}>
      <header style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.5px' }}>Global Industrial Facility Intelligence</h2>
        <p style={{ color: 'var(--muted)', marginTop: '4px', fontSize: '14px' }}>Asset-level resolution leveraging GEM, OSM Overpass, and Satellite imagery.</p>
        
        <div style={{ background: 'rgba(207, 32, 47, 0.05)', border: '1px solid rgba(207, 32, 47, 0.2)', borderRadius: 'var(--radius)', padding: '16px', marginTop: '16px', color: 'var(--semantic-down)' }}>
           <strong>Note on India Coverage:</strong> India presently lacks a public national Pollutant Release and Transfer Register (PRTR) API. GreenOrb fuses unstructured BRSR PDFs, Wikidata SPARQL, GEM datasets, and Overpass API to reconstruct the industrial map.
        </div>
      </header>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--radius)', padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
           <div>
             <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink)', marginBottom: '6px' }}>Company or Sector Match</label>
             <input type="text" value={companySearch} onChange={e=>setCompanySearch(e.target.value)} placeholder="e.g. Tata" style={{ padding: '10px 16px', background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--bd)', borderRadius: 'var(--radius-pill)', fontSize: '14px' }} />
           </div>
           <div>
             <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink)', marginBottom: '6px' }}>Latitude Focus</label>
             <input type="number" step="0.1" value={lat} onChange={e=>setLat(e.target.value)} style={{ padding: '10px 16px', background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--bd)', borderRadius: 'var(--radius-pill)', width: '120px', fontSize: '14px' }} />
           </div>
           <div>
             <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink)', marginBottom: '6px' }}>Longitude Focus</label>
             <input type="number" step="0.1" value={lng} onChange={e=>setLng(e.target.value)} style={{ padding: '10px 16px', background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--bd)', borderRadius: 'var(--radius-pill)', width: '120px', fontSize: '14px' }} />
           </div>
           <div>
             <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink)', marginBottom: '6px' }}>Radius ({radius} km)</label>
             <input type="range" min="10" max="1000" value={radius} onChange={e=>setRadius(e.target.value)} style={{ width: '120px' }} />
           </div>
           <div style={{ alignSelf: 'flex-end' }}>
             <button 
               onClick={loadFacilities} 
               style={{ 
                 padding: '10px 20px', 
                 background: 'var(--primary)', 
                 color: 'white', 
                 border: 'none', 
                 borderRadius: 'var(--radius-pill)', 
                 cursor: 'pointer',
                 fontWeight: 600,
                 fontSize: '14px',
                 transition: 'background 0.2s'
               }}
               onMouseEnter={(e) => e.target.style.background = 'var(--primary-active)'}
               onMouseLeave={(e) => e.target.style.background = 'var(--primary)'}
             >
                {loading ? 'Scanning...' : 'Scan Region'}
             </button>
           </div>
        </div>
        <div style={{ marginTop: '16px', display: 'flex', gap: '16px', fontSize: '0.85rem', color: 'var(--muted)' }}>
           <span><strong>Hits:</strong> {facilities.length} nodes</span>
           <span><span style={{color:'var(--ink)', fontWeight: 600}}>GEM:</span> {counts.gem}</span>
           <span><span style={{color:'var(--primary)', fontWeight: 600}}>OSM:</span> {counts.osm}</span>
           <span><span style={{color:'#3b82f6', fontWeight: 600}}>Wikidata:</span> {counts.wikidata}</span>
           <span><span style={{color:'#f59e0b', fontWeight: 600}}>DB Native:</span> {counts.db}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
         
         <div style={{ height: '500px', background: 'var(--bg2)', borderRadius: 'var(--radius)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ color: 'var(--muted)', textAlign: 'center', padding: '24px' }}>
               <p style={{ marginBottom: '8px' }}>Map visualization anchors here.</p>
               <p style={{ fontSize: '13px' }}>Currently routing assets to the main GlobeTab viewer context.</p>
               {selectedFacility && (
                  <div style={{ background: 'var(--bg)', padding: '24px', borderRadius: 'var(--radius)', marginTop: '24px', border: '1px solid var(--bd)', color: 'var(--ink)', textAlign: 'left' }}>
                     <h4 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>{selectedFacility.name}</h4>
                     <p style={{ fontSize: '14px', marginBottom: '4px' }}>Lat: {selectedFacility.lat}, Lng: {selectedFacility.lng}</p>
                     <p style={{ fontSize: '14px' }}>Source: <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{selectedFacility.source}</span></p>
                  </div>
               )}
            </div>
         </div>

         <div style={{ height: '500px', overflowY: 'auto', border: '1px solid var(--bd)', borderRadius: 'var(--radius)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead style={{ background: 'var(--bg2)', position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th style={{ padding: '16px 20px', borderBottom: '1px solid var(--bd)', color: 'var(--ink)', fontWeight: 600 }}>Facility</th>
                  <th style={{ padding: '16px 20px', borderBottom: '1px solid var(--bd)', color: 'var(--ink)', fontWeight: 600 }}>Company</th>
                  <th style={{ padding: '16px 20px', borderBottom: '1px solid var(--bd)', color: 'var(--ink)', fontWeight: 600 }}>CBAM Risk (est)</th>
                  <th style={{ padding: '16px 20px', borderBottom: '1px solid var(--bd)', color: 'var(--ink)', fontWeight: 600 }}>Satellite</th>
                  <th style={{ padding: '16px 20px', borderBottom: '1px solid var(--bd)', color: 'var(--ink)', fontWeight: 600 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {facilities.map((f, i) => (
                  <tr 
                    key={i} 
                    onClick={() => setSelectedFacility(f)} 
                    style={{ 
                      borderBottom: '1px solid var(--bd)', 
                      cursor: 'pointer', 
                      background: selectedFacility === f ? 'var(--bg2)' : 'transparent',
                      transition: 'background 0.2s'
                    }}
                  >
                     <td style={{ padding: '16px 20px', color: 'var(--primary)', fontWeight: 600 }}>
                       {f.name} 
                       <div style={{fontSize:'12px', color:'var(--muted)', fontWeight: 400}}>{f.type || 'industrial'}</div>
                     </td>
                     <td style={{ padding: '16px 20px', color: 'var(--body-text)' }}>{f.company || 'Unknown'}</td>
                     <td style={{ padding: '16px 20px', color: 'var(--body-text)' }}>{f.type?.includes('steel') ? calculateCbamExp(f.capacity_mt_yr) : '-'}</td>
                     <td style={{ padding: '16px 20px' }}>
                        <span style={{ padding: '4px 8px', background: 'var(--sf2)', color: 'var(--ink)', borderRadius: 'var(--radius-pill)', fontSize: '11px', fontWeight: 600 }}>UNVERIFIED</span>
                     </td>
                     <td style={{ padding: '16px 20px' }}>
                        <button 
                          onClick={(e) => { e.stopPropagation(); triggerVerification(f); }} 
                          style={{ 
                            padding: '6px 12px', 
                            background: 'var(--bg)', 
                            border: '1px solid var(--bd)', 
                            borderRadius: 'var(--radius-pill)',
                            color: 'var(--ink)', 
                            cursor: 'pointer', 
                            fontSize: '12px',
                            fontWeight: 600,
                            transition: 'background 0.2s'
                          }}
                          onMouseEnter={(e) => e.target.style.background = 'var(--bg2)'}
                          onMouseLeave={(e) => e.target.style.background = 'var(--bg)'}
                        >
                          Verify Now
                        </button>
                     </td>
                  </tr>
                ))}
                {facilities.length === 0 && (
                  <tr><td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>No facilities matched nearby.</td></tr>
                )}
              </tbody>
            </table>
         </div>

      </div>

    </div>
  );
}

