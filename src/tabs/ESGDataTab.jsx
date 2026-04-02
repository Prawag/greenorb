import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:5000/api';

export default function ESGDataTab() {
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCompany, setSelectedCompany] = useState(null);
  
  // Compare State
  const [compareMode, setCompareMode] = useState(false);
  const [compA, setCompA] = useState('');
  const [compB, setCompB] = useState('');
  const [compareDelta, setCompareDelta] = useState(null);

  // LCA State
  const [lcaProducts, setLcaProducts] = useState([]);
  const [selectedLca, setSelectedLca] = useState('');
  const [lcaData, setLcaData] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/esg/companies`)
      .then(res => res.json())
      .then(data => setCompanies(data))
      .catch(err => console.error("Failed to load ESG companies", err));

    fetch(`${API_BASE}/products/lca`)
      .then(res => res.json())
      .then(data => {
         setLcaProducts(data.data || []);
         if (data.data?.length > 0) handleSelectLca(data.data[0].product);
      });
  }, []);

  const handleSelectLca = (productName) => {
    setSelectedLca(productName);
    const prod = lcaProducts.find(p => p.product === productName);
    if(prod) setLcaData(prod);
  };

  const handleCompare = async () => {
    if(!compA || !compB) return;
    try {
       const res = await fetch(`${API_BASE}/esg/compare`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyA: compA, companyB: compB })
       });
       const json = await res.json();
       setCompareDelta(json.data);
    } catch(e) {
       console.error(e);
    }
  };

  const filteredCompanies = companies.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.sector.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: 'var(--sp-l)', color: 'var(--tx)', height: '100%', overflowY: 'auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-l)' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--sf)' }}>ESG Metrics & Diagnostics</h2>
          <p style={{ color: 'var(--tx2)', marginTop: '4px' }}>Deep dive into Scope 1-3, Methodology, and Risk Flags</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-s)' }}>
          <button 
            style={{ padding: 'var(--sp-s) var(--sp-m)', background: compareMode ? 'var(--jade)' : 'var(--dp)', border: '1px solid var(--bd)', color: 'white', cursor: 'pointer' }}
            onClick={() => setCompareMode(!compareMode)}
          >
            {compareMode ? 'Exit Compare' : 'Compare Mode'}
          </button>
        </div>
      </header>

      {compareMode && (
         <div style={{ background: 'var(--dp)', padding: 'var(--sp-m)', border: '1px solid var(--bd)', marginBottom: 'var(--sp-l)' }}>
            <h3 style={{ marginBottom: 'var(--sp-s)' }}>Compare Organizations</h3>
            <div style={{ display: 'flex', gap: 'var(--sp-s)', alignItems: 'center' }}>
               <select value={compA} onChange={(e) => setCompA(e.target.value)} style={{ padding: '8px', background: 'var(--bg)', color: 'white', border: '1px solid var(--bd)' }}>
                 <option value="">Select Company A</option>
                 {companies.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
               </select>
               <span>vs</span>
               <select value={compB} onChange={(e) => setCompB(e.target.value)} style={{ padding: '8px', background: 'var(--bg)', color: 'white', border: '1px solid var(--bd)' }}>
                 <option value="">Select Company B</option>
                 {companies.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
               </select>
               <button onClick={handleCompare} style={{ padding: '8px 16px', background: 'var(--sf)', color: 'black', border: 'none', cursor: 'pointer' }}>Analyze Delta</button>
            </div>
            
            {compareDelta && (
               <div style={{ marginTop: 'var(--sp-m)', padding: 'var(--sp-m)', background: 'var(--bg)', border: '1px solid var(--bd)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-m)' }}>
                  <div>
                     <p><strong>Methodology Flag: </strong> {compareDelta.methodology_compatibility_flag ? <span style={{color: '#ef4444'}}>Incompatible</span> : <span style={{color: 'var(--jade)'}}>OK</span>}</p>
                     <p style={{ color: 'var(--tx2)', fontSize: '0.9rem' }}>{compareDelta.methodology_note}</p>
                     
                     <div style={{ marginTop: 'var(--sp-s)' }}>
                        <p><strong>Emissions Gap (S1+S2): </strong> {(compareDelta.emission_gap_mt / 1e6).toFixed(2)} Mt</p>
                        <p><strong>EU CBAM Liability Gap: </strong> €{(compareDelta.cbam_liability_gap / 1e6).toFixed(2)}M</p>
                     </div>
                  </div>
                  <div>
                     <h4 style={{ color: '#f59e0b', marginBottom: '8px' }}>Greenwash Signals</h4>
                     {compareDelta.greenwash_signals.length === 0 ? <p style={{ color: 'var(--jade)' }}>No anomalies detected</p> : (
                        <ul style={{ paddingLeft: '20px', color: '#ef4444' }}>
                           {compareDelta.greenwash_signals.map((s, i) => (
                             <li key={i}><strong>{s.company}:</strong> {s.signal} - {s.description}</li>
                           ))}
                        </ul>
                     )}
                  </div>
               </div>
            )}
         </div>
      )}

      {/* Main Table */}
      <div style={{ marginBottom: 'var(--sp-l)' }}>
         <input 
           type="text" 
           placeholder="Search companies or sectors..." 
           value={search} onChange={e => setSearch(e.target.value)}
           style={{ width: '100%', padding: '12px', background: 'var(--dp)', border: '1px solid var(--bd)', color: 'white', marginBottom: 'var(--sp-m)' }}
         />
         
         <div style={{ overflowX: 'auto', border: '1px solid var(--bd)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead style={{ background: 'var(--dp)' }}>
                <tr>
                  <th style={{ padding: '12px', borderBottom: '1px solid var(--bd)' }}>Company</th>
                  <th style={{ padding: '12px', borderBottom: '1px solid var(--bd)' }}>Sector</th>
                  <th style={{ padding: '12px', borderBottom: '1px solid var(--bd)' }}>Country</th>
                  <th style={{ padding: '12px', borderBottom: '1px solid var(--bd)' }}>Scope 1 (Mt)</th>
                  <th style={{ padding: '12px', borderBottom: '1px solid var(--bd)' }}>Scope 2 Loc (Mt)</th>
                  <th style={{ padding: '12px', borderBottom: '1px solid var(--bd)' }}>Scope 2 Mkt (Mt)</th>
                  <th style={{ padding: '12px', borderBottom: '1px solid var(--bd)' }}>Scope 3 (Mt)</th>
                  <th style={{ padding: '12px', borderBottom: '1px solid var(--bd)' }}>Net Zero</th>
                  <th style={{ padding: '12px', borderBottom: '1px solid var(--bd)' }}>Assurance</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map(c => (
                  <tr key={c.name} onClick={() => setSelectedCompany(c)} style={{ borderBottom: '1px solid var(--bd)', cursor: 'pointer', background: selectedCompany?.name === c.name ? 'rgba(255,255,255,0.05)' : 'transparent' }}>
                     <td style={{ padding: '12px', color: 'var(--sf)' }}>{c.name}</td>
                     <td style={{ padding: '12px' }}>{c.sector}</td>
                     <td style={{ padding: '12px' }}>{c.country}</td>
                     <td style={{ padding: '12px' }}>{c.scope1_mt ? (c.scope1_mt / 1e6).toFixed(2) : '-'}</td>
                     <td style={{ padding: '12px' }}>{c.scope2_location_mt ? (c.scope2_location_mt / 1e6).toFixed(2) : '-'}</td>
                     <td style={{ padding: '12px' }}>{c.scope2_market_mt ? (c.scope2_market_mt / 1e6).toFixed(2) : '-'}</td>
                     <td style={{ padding: '12px' }}>{c.scope3_mt ? (c.scope3_mt / 1e6).toFixed(2) : '-'}</td>
                     <td style={{ padding: '12px' }}>{c.net_zero_target_year || '-'}</td>
                     <td style={{ padding: '12px' }}>{c.verification_body || 'Unverified'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
         </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-l)' }}>
         {/* Details Drawer */}
         {selectedCompany && (
            <div style={{ background: 'var(--dp)', padding: 'var(--sp-l)', border: '1px solid var(--bd)' }}>
               <h3 style={{ color: 'var(--sf)', marginBottom: 'var(--sp-m)' }}>{selectedCompany.name} - Calculation Breakdown</h3>
               
               <div style={{ marginBottom: 'var(--sp-m)' }}>
                  <p><strong>Method:</strong> {selectedCompany.methodology?.standard || 'Unknown'}</p>
                  <p><strong>GWP Version:</strong> {selectedCompany.methodology?.gwp_version || 'Unknown'}</p>
                  <p><strong>Boundary:</strong> {selectedCompany.methodology?.boundary || 'Unknown'}</p>
               </div>

               {selectedCompany.scope2_location_mt && selectedCompany.scope2_market_mt && (
                 <div style={{ marginBottom: 'var(--sp-m)' }}>
                    <p style={{ marginBottom: '4px' }}><strong>Dual Scope 2 Variance</strong></p>
                    <div style={{ height: '24px', background: '#3b82f6', width: '100%', marginBottom: '4px', position: 'relative' }}>
                       <span style={{ position: 'absolute', left: '8px', color: 'white', lineHeight: '24px', fontSize: '12px' }}>Location Based: {(selectedCompany.scope2_location_mt / 1e6).toFixed(2)} Mt</span>
                    </div>
                    <div style={{ height: '24px', background: 'var(--jade)', width: `${(selectedCompany.scope2_market_mt / selectedCompany.scope2_location_mt) * 100}%`, position: 'relative' }}>
                       <span style={{ position: 'absolute', left: '8px', color: 'black', lineHeight: '24px', fontSize: '12px' }}>Market Based: {(selectedCompany.scope2_market_mt / 1e6).toFixed(2)} Mt</span>
                    </div>
                 </div>
               )}

               {selectedCompany.report_url && (
                  <a href={selectedCompany.report_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', padding: '8px 16px', background: 'rgba(255,255,255,0.1)', color: 'white', textDecoration: 'none', border: '1px solid var(--bd)' }}>View Source PDF</a>
               )}
            </div>
         )}

         {/* Product LCA Block */}
         <div style={{ background: 'var(--dp)', padding: 'var(--sp-l)', border: '1px solid var(--bd)' }}>
            <h3 style={{ marginBottom: 'var(--sp-m)' }}>Product Lifecycle Carbon (LCA)</h3>
            <select value={selectedLca} onChange={(e) => handleSelectLca(e.target.value)} style={{ width: '100%', padding: '12px', background: 'var(--bg)', color: 'white', border: '1px solid var(--bd)', marginBottom: 'var(--sp-m)' }}>
               {lcaProducts.map(p => <option key={p.product} value={p.product}>{p.product} ({p.manufacturer})</option>)}
            </select>

            {lcaData && lcaData.stages && (
               <div>
                  <p style={{ fontSize: '1.2rem', marginBottom: 'var(--sp-m)' }}>Total Footprint: <strong>{lcaData.carbon_kgco2e} kgCO2e</strong> / {lcaData.functional_unit || 'unit'}</p>
                  
                  <div style={{ display: 'flex', height: '30px', width: '100%', background: '#333' }}>
                     <div style={{ width: `${lcaData.stages.raw_materials_pct}%`, background: '#ef4444' }} title={`Raw Materials: ${lcaData.stages.raw_materials_pct}%`} />
                     <div style={{ width: `${lcaData.stages.manufacturing_pct}%`, background: '#f59e0b' }} title={`Manufacturing: ${lcaData.stages.manufacturing_pct}%`} />
                     <div style={{ width: `${lcaData.stages.transport_pct}%`, background: '#3b82f6' }} title={`Transport: ${lcaData.stages.transport_pct}%`} />
                     <div style={{ width: `${lcaData.stages.use_phase_pct}%`, background: '#10b981' }} title={`Use Phase: ${lcaData.stages.use_phase_pct}%`} />
                     <div style={{ width: `${lcaData.stages.end_of_life_pct}%`, background: '#8b5cf6' }} title={`End of Life: ${lcaData.stages.end_of_life_pct}%`} />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '12px', fontSize: '0.85rem', color: 'var(--tx2)' }}>
                     <span style={{ display: 'flex', alignItems: 'center' }}><div style={{ width: 10, height: 10, background: '#ef4444', marginRight: 6 }}></div> Raw Materials</span>
                     <span style={{ display: 'flex', alignItems: 'center' }}><div style={{ width: 10, height: 10, background: '#f59e0b', marginRight: 6 }}></div> Manufacturing</span>
                     <span style={{ display: 'flex', alignItems: 'center' }}><div style={{ width: 10, height: 10, background: '#3b82f6', marginRight: 6 }}></div> Transport</span>
                     <span style={{ display: 'flex', alignItems: 'center' }}><div style={{ width: 10, height: 10, background: '#10b981', marginRight: 6 }}></div> Use Phase</span>
                     <span style={{ display: 'flex', alignItems: 'center' }}><div style={{ width: 10, height: 10, background: '#8b5cf6', marginRight: 6 }}></div> End of Life</span>
                  </div>

                  {lcaData.source_url && (
                    <a href={lcaData.source_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '16px', color: 'var(--sf)' }}>Source Documentation</a>
                  )}
               </div>
            )}
         </div>
      </div>
    </div>
  );
}
