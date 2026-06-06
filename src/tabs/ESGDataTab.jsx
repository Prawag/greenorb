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
      .then(data => {
         setCompanies(data || []);
         if (data?.length > 0) {
            setSelectedCompany(data[0]);
         }
      })
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
    (c.sector && c.sector.toLowerCase().includes(search.toLowerCase()))
  );

  // Safely parse methodology JSONB
  const getMethodologyInfo = (comp) => {
    if (!comp) return { standard: 'Unknown', gwp_version: 'Unknown', boundary: 'Unknown' };
    let meth = {};
    try {
      meth = typeof comp.methodology === 'string' 
        ? JSON.parse(comp.methodology) 
        : (comp.methodology || {});
    } catch (e) {
      meth = { standard: comp.methodology };
    }
    return {
      standard: meth.standard || comp.methodology || 'Unknown',
      gwp_version: comp.gwp_version || meth.gwp_version || 'Unknown',
      boundary: comp.boundary_approach || meth.boundary || 'Unknown'
    };
  };

  const selectedMeth = getMethodologyInfo(selectedCompany);

  return (
    <div style={{ padding: '24px', color: 'var(--body-text)', height: '100%', overflowY: 'auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.5px' }}>ESG Metrics & Diagnostics</h2>
          <p style={{ color: 'var(--muted)', marginTop: '4px', fontSize: '14px' }}>Deep dive into Scope 1-3, Methodology, and Risk Flags</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            style={{ 
              padding: '8px 16px', 
              background: compareMode ? 'var(--primary)' : 'var(--sf2)', 
              border: 'none',
              borderRadius: 'var(--radius-pill)',
              color: compareMode ? '#white' : 'var(--ink)', 
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '14px',
              transition: 'background 0.2s'
            }}
            onClick={() => setCompareMode(!compareMode)}
          >
            {compareMode ? 'Exit Compare' : 'Compare Mode'}
          </button>
        </div>
      </header>

      {compareMode && (
         <div style={{ background: 'var(--bg2)', padding: '24px', borderRadius: 'var(--radius)', border: '1px solid var(--bd)', marginBottom: '32px' }}>
            <h3 style={{ marginBottom: '16px', color: 'var(--ink)', fontSize: '18px', fontWeight: 600 }}>Compare Organizations</h3>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
               <select value={compA} onChange={(e) => setCompA(e.target.value)} style={{ padding: '10px 16px', background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--bd)', borderRadius: 'var(--radius-pill)', fontSize: '14px' }}>
                 <option value="">Select Company A</option>
                 {companies.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
               </select>
               <span style={{ color: 'var(--muted)' }}>vs</span>
               <select value={compB} onChange={(e) => setCompB(e.target.value)} style={{ padding: '10px 16px', background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--bd)', borderRadius: 'var(--radius-pill)', fontSize: '14px' }}>
                 <option value="">Select Company B</option>
                 {companies.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
               </select>
               <button 
                 onClick={handleCompare} 
                 style={{ 
                   padding: '10px 20px', 
                   background: 'var(--primary)', 
                   color: '#white', 
                   border: 'none', 
                   borderRadius: 'var(--radius-pill)',
                   cursor: 'pointer',
                   fontWeight: 600,
                   fontSize: '14px'
                 }}
               >
                 Analyze Delta
               </button>
            </div>
            
            {compareDelta && (
               <div style={{ marginTop: '24px', padding: '24px', background: 'var(--bg)', borderRadius: 'var(--radius)', border: '1px solid var(--bd)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                  <div>
                     <p style={{ marginBottom: '8px' }}><strong style={{ color: 'var(--ink)' }}>Methodology Flag: </strong> {compareDelta.methodology_compatibility_flag ? <span style={{color: 'var(--semantic-down)'}}>Incompatible</span> : <span style={{color: 'var(--semantic-up)'}}>OK</span>}</p>
                     <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '16px' }}>{compareDelta.methodology_note}</p>
                     
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <p><strong style={{ color: 'var(--ink)' }}>Emissions Gap (S1+S2): </strong> <span style={{ fontFamily: 'var(--mono)' }}>{(compareDelta.emission_gap_mt / 1e6).toFixed(2)} Mt</span></p>
                        <p><strong style={{ color: 'var(--ink)' }}>EU CBAM Liability Gap: </strong> <span style={{ fontFamily: 'var(--mono)' }}>€{(compareDelta.cbam_liability_gap / 1e6).toFixed(2)}M</span></p>
                     </div>
                  </div>
                  <div>
                     <h4 style={{ color: 'var(--accent-yellow)', marginBottom: '12px', fontSize: '16px', fontWeight: 600 }}>Greenwash Signals</h4>
                     {compareDelta.greenwash_signals.length === 0 ? <p style={{ color: 'var(--semantic-up)' }}>No anomalies detected</p> : (
                        <ul style={{ paddingLeft: '20px', color: 'var(--semantic-down)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
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
      <div style={{ marginBottom: '32px' }}>
         <input 
           type="text" 
           placeholder="Search companies or sectors..." 
           value={search} onChange={e => setSearch(e.target.value)}
           style={{ 
             width: '100%', 
             padding: '14px 20px', 
             background: 'var(--bg2)', 
             border: '1px solid var(--bd)', 
             borderRadius: 'var(--radius-pill)',
             color: 'var(--ink)', 
             fontSize: '14px',
             marginBottom: '20px',
             outline: 'none',
             transition: 'border-color 0.2s'
           }}
           onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
           onBlur={(e) => e.target.style.borderColor = 'var(--bd)'}
         />
         
         <div style={{ overflowX: 'auto', border: '1px solid var(--bd)', borderRadius: 'var(--radius)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead style={{ background: 'var(--bg2)' }}>
                <tr>
                  <th style={{ padding: '16px 20px', borderBottom: '1px solid var(--bd)', color: 'var(--ink)', fontWeight: 600 }}>Company</th>
                  <th style={{ padding: '16px 20px', borderBottom: '1px solid var(--bd)', color: 'var(--ink)', fontWeight: 600 }}>Sector</th>
                  <th style={{ padding: '16px 20px', borderBottom: '1px solid var(--bd)', color: 'var(--ink)', fontWeight: 600 }}>Country</th>
                  <th style={{ padding: '16px 20px', borderBottom: '1px solid var(--bd)', color: 'var(--ink)', fontWeight: 600 }}>Scope 1 (Mt)</th>
                  <th style={{ padding: '16px 20px', borderBottom: '1px solid var(--bd)', color: 'var(--ink)', fontWeight: 600 }}>Scope 2 Loc (Mt)</th>
                  <th style={{ padding: '16px 20px', borderBottom: '1px solid var(--bd)', color: 'var(--ink)', fontWeight: 600 }}>Scope 2 Mkt (Mt)</th>
                  <th style={{ padding: '16px 20px', borderBottom: '1px solid var(--bd)', color: 'var(--ink)', fontWeight: 600 }}>Scope 3 (Mt)</th>
                  <th style={{ padding: '16px 20px', borderBottom: '1px solid var(--bd)', color: 'var(--ink)', fontWeight: 600 }}>Net Zero</th>
                  <th style={{ padding: '16px 20px', borderBottom: '1px solid var(--bd)', color: 'var(--ink)', fontWeight: 600 }}>Assurance</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map(c => (
                  <tr 
                    key={c.name} 
                    onClick={() => setSelectedCompany(c)} 
                    style={{ 
                      borderBottom: '1px solid var(--bd)', 
                      cursor: 'pointer', 
                      background: selectedCompany?.name === c.name ? 'var(--bg2)' : 'transparent',
                      transition: 'background 0.2s'
                    }}
                  >
                     <td style={{ padding: '16px 20px', color: 'var(--primary)', fontWeight: 600 }}>{c.name}</td>
                     <td style={{ padding: '16px 20px', color: 'var(--body-text)' }}>{c.sector || '-'}</td>
                     <td style={{ padding: '16px 20px', color: 'var(--body-text)' }}>{c.country || '-'}</td>
                     <td style={{ padding: '16px 20px', fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{c.s1 ? (parseFloat(c.s1) / 1e6).toFixed(2) : '-'}</td>
                     <td style={{ padding: '16px 20px', fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{c.scope2_location ? (parseFloat(c.scope2_location) / 1e6).toFixed(2) : '-'}</td>
                     <td style={{ padding: '16px 20px', fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{c.scope2_market ? (parseFloat(c.scope2_market) / 1e6).toFixed(2) : '-'}</td>
                     <td style={{ padding: '16px 20px', fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{c.s3 ? (parseFloat(c.s3) / 1e6).toFixed(2) : '-'}</td>
                     <td style={{ padding: '16px 20px', color: 'var(--body-text)' }}>{c.net_zero_year || '-'}</td>
                     <td style={{ padding: '16px 20px', color: 'var(--body-text)' }}>{c.verification_body || 'Unverified'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
         </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
         {/* Details Drawer */}
         {selectedCompany && (
            <div style={{ background: 'var(--bg2)', padding: '24px', borderRadius: 'var(--radius)', border: '1px solid var(--bd)' }}>
               <h3 style={{ color: 'var(--ink)', marginBottom: '16px', fontSize: '18px', fontWeight: 600 }}>{selectedCompany.name} - Calculation Breakdown</h3>
               
               <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <p><strong style={{ color: 'var(--ink)' }}>Method:</strong> {selectedMeth.standard}</p>
                  <p><strong style={{ color: 'var(--ink)' }}>GWP Version:</strong> {selectedMeth.gwp_version}</p>
                  <p><strong style={{ color: 'var(--ink)' }}>Boundary:</strong> {selectedMeth.boundary}</p>
               </div>

               {selectedCompany.scope2_location && selectedCompany.scope2_market && (
                 <div style={{ marginBottom: '20px' }}>
                    <p style={{ marginBottom: '8px', color: 'var(--ink)', fontWeight: 600 }}>Dual Scope 2 Variance</p>
                    <div style={{ height: '24px', background: '#3b82f6', width: '100%', marginBottom: '6px', borderRadius: '4px', position: 'relative' }}>
                       <span style={{ position: 'absolute', left: '8px', color: 'white', lineHeight: '24px', fontSize: '12px', fontWeight: 600 }}>Location Based: {(parseFloat(selectedCompany.scope2_location) / 1e6).toFixed(2)} Mt</span>
                    </div>
                    <div style={{ height: '24px', background: 'var(--primary)', width: `${Math.min((parseFloat(selectedCompany.scope2_market) / parseFloat(selectedCompany.scope2_location)) * 100, 100)}%`, borderRadius: '4px', position: 'relative' }}>
                       <span style={{ position: 'absolute', left: '8px', color: 'white', lineHeight: '24px', fontSize: '12px', fontWeight: 600 }}>Market Based: {(parseFloat(selectedCompany.scope2_market) / 1e6).toFixed(2)} Mt</span>
                    </div>
                 </div>
               )}

               {(() => {
                  const pdfUrl = selectedCompany.report_url || selectedCompany.url;
                  const hasPdf = pdfUrl && pdfUrl !== 'N/A' && (pdfUrl.startsWith('http://') || pdfUrl.startsWith('https://'));
                  if (!hasPdf) return null;
                  return (
                     <a 
                       href={pdfUrl} 
                       target="_blank" 
                       rel="noreferrer" 
                       style={{ 
                         display: 'inline-block', 
                         padding: '10px 20px', 
                         background: 'var(--bg)', 
                         color: 'var(--primary)', 
                         textDecoration: 'none', 
                         borderRadius: 'var(--radius-pill)',
                         border: '1px solid var(--bd)',
                         fontWeight: 600,
                         fontSize: '14px',
                         transition: 'background 0.2s'
                       }}
                       onMouseEnter={(e) => e.target.style.background = 'var(--bg2)'}
                       onMouseLeave={(e) => e.target.style.background = 'var(--bg)'}
                     >
                       View Source PDF
                     </a>
                  );
               })()}
            </div>
         )}

         {/* Product LCA Block */}
         <div style={{ background: 'var(--bg2)', padding: '24px', borderRadius: 'var(--radius)', border: '1px solid var(--bd)' }}>
            <h3 style={{ marginBottom: '16px', color: 'var(--ink)', fontSize: '18px', fontWeight: 600 }}>Product Lifecycle Carbon (LCA)</h3>
            <select value={selectedLca} onChange={(e) => handleSelectLca(e.target.value)} style={{ width: '100%', padding: '10px 16px', background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--bd)', borderRadius: 'var(--radius-pill)', marginBottom: '20px', fontSize: '14px' }}>
               {lcaProducts.map(p => <option key={p.product} value={p.product}>{p.product} ({p.manufacturer})</option>)}
            </select>

            {lcaData && lcaData.stages && (
               <div>
                  <p style={{ fontSize: '1rem', color: 'var(--ink)', marginBottom: '16px' }}>Total Footprint: <strong>{lcaData.carbon_kgco2e} kgCO2e</strong> / {lcaData.functional_unit || 'unit'}</p>
                  
                  <div style={{ display: 'flex', height: '24px', width: '100%', background: 'var(--sf2)', borderRadius: '12px', overflow: 'hidden' }}>
                     <div style={{ width: `${lcaData.stages.raw_materials_pct}%`, background: '#ef4444' }} title={`Raw Materials: ${lcaData.stages.raw_materials_pct}%`} />
                     <div style={{ width: `${lcaData.stages.manufacturing_pct}%`, background: '#f59e0b' }} title={`Manufacturing: ${lcaData.stages.manufacturing_pct}%`} />
                     <div style={{ width: `${lcaData.stages.transport_pct}%`, background: '#3b82f6' }} title={`Transport: ${lcaData.stages.transport_pct}%`} />
                     <div style={{ width: `${lcaData.stages.use_phase_pct}%`, background: '#05b169' }} title={`Use Phase: ${lcaData.stages.use_phase_pct}%`} />
                     <div style={{ width: `${lcaData.stages.end_of_life_pct}%`, background: '#8b5cf6' }} title={`End of Life: ${lcaData.stages.end_of_life_pct}%`} />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '16px', fontSize: '0.85rem', color: 'var(--muted)' }}>
                     <span style={{ display: 'flex', alignItems: 'center' }}><div style={{ width: 10, height: 10, background: '#ef4444', marginRight: 6, borderRadius: '2px' }}></div> Raw Materials</span>
                     <span style={{ display: 'flex', alignItems: 'center' }}><div style={{ width: 10, height: 10, background: '#f59e0b', marginRight: 6, borderRadius: '2px' }}></div> Manufacturing</span>
                     <span style={{ display: 'flex', alignItems: 'center' }}><div style={{ width: 10, height: 10, background: '#3b82f6', marginRight: 6, borderRadius: '2px' }}></div> Transport</span>
                     <span style={{ display: 'flex', alignItems: 'center' }}><div style={{ width: 10, height: 10, background: '#05b169', marginRight: 6, borderRadius: '2px' }}></div> Use Phase</span>
                     <span style={{ display: 'flex', alignItems: 'center' }}><div style={{ width: 10, height: 10, background: '#8b5cf6', marginRight: 6, borderRadius: '2px' }}></div> End of Life</span>
                  </div>

                  {lcaData.source_url && (
                    <a 
                      href={lcaData.source_url} 
                      target="_blank" 
                      rel="noreferrer" 
                      style={{ 
                        display: 'inline-block', 
                        marginTop: '20px', 
                        color: 'var(--primary)', 
                        textDecoration: 'none',
                        fontWeight: 600,
                        fontSize: '14px'
                      }}
                      onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
                      onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
                    >
                      Source Documentation
                    </a>
                  )}
               </div>
            )}
         </div>
      </div>
    </div>
  );
}

