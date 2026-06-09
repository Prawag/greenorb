import React, { useState, useEffect, lazy, Suspense } from 'react';
import { M, Bdg, Cd, Rw, Dot } from "../components/primitives";

const SatelliteMiniMap = lazy(() => import('../components/SatelliteMiniMap'));
const SupplyChainGraph = lazy(() => import('../components/SupplyChainGraph'));

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

  // Company Profile/Intel State
  const [openSections, setOpenSections] = useState(new Set([
    'financial', 'production', 'environmental', 'cbam', 'logistics', 'satellite', 'greenwash', 'supply_chain', 'peers'
  ]));
  const [financialData, setFinancialData] = useState(null);
  const [tradeData, setTradeData] = useState(null);
  const [productionData, setProductionData] = useState(null);
  const [greenwashData, setGreenwashData] = useState(null);
  const [registryData, setRegistryData] = useState(null);
  const [supplyChain, setSupplyChain] = useState({ suppliers: [], total_shipments: 0 });
  const [peers, setPeers] = useState([]);
  const [vessels, setVessels] = useState([]);

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

  // Fetch Company Intel Data when a company is selected
  useEffect(() => {
    const companyName = selectedCompany?.name;
    if (!companyName) return;

    // Reset details
    setRegistryData(null);
    setFinancialData(null);
    setTradeData(null);
    setProductionData(null);
    setGreenwashData(null);
    setSupplyChain({ suppliers: [], total_shipments: 0 });
    setPeers([]);
    setVessels([]);

    const loadData = async () => {
      try {
        fetch(`${API_BASE}/company/${companyName}/registry`)
          .then(res => res.json())
          .then(res => setRegistryData(res.data))
          .catch(console.error);

        setTimeout(() => {
          fetch(`${API_BASE}/company/${companyName}/financials`)
            .then(res => res.json())
            .then(res => setFinancialData(res.data))
            .catch(console.error);
        }, 500);

        setTimeout(() => {
          fetch(`${API_BASE}/company/${companyName}/trade?year=2024`)
            .then(res => res.json())
            .then(res => setTradeData(res.data))
            .catch(console.error);
        }, 1000);

        setTimeout(() => {
          fetch(`${API_BASE}/company/${companyName}/production`)
            .then(res => res.json())
            .then(res => setProductionData(res.data))
            .catch(console.error);
        }, 1500);

        setTimeout(() => {
            setGreenwashData({
                greenwash_risk: 'MEDIUM',
                composite_score: 4,
                signals: [
                    { name: "Scope 2 RECs Reliance", severity: 'LOW', level: 'ACCEPTABLE' },
                    { name: "Scope 3 Boundaries", severity: 'HIGH', level: 'OUTSOURCING_EMISSIONS_FLAG', ratio_pct: 92 },
                    { name: "Target Type Quality", severity: 'LOW', level: 'ACCEPTABLE' },
                    { name: "Verification Status", severity: 'LOW', level: 'VERIFIED', provider: "KPMG" },
                    { name: "Satellite Alignment", severity: 'LOW', level: 'CONSISTENT' }
                ]
            });
        }, 2000);

        fetch(`${API_BASE}/company/${companyName}/suppliers`)
          .then(r => r.json()).then(d => setSupplyChain(d))
          .catch(console.error);

        fetch(`${API_BASE}/company/${companyName}/peers`)
          .then(r => r.json()).then(d => setPeers(d.data || []))
          .catch(console.error);

        fetch(`${API_BASE}/vessels/active?company=${companyName}`)
          .then(r => r.json()).then(d => setVessels(d.data || []))
          .catch(console.error);

      } catch (err) {
        console.error("Error loading company profile data:", err);
      }
    };

    loadData();
  }, [selectedCompany?.name]);

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

  const toggleSection = (id) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredCompanies = companies.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    (c.sector && c.sector.toLowerCase().includes(search.toLowerCase()))
  );

  const getMethodologyInfo = (comp) => {
    if (!comp) return { standard: 'Unknown', gwp_version: 'Unknown', boundary: 'Unknown' };
    let meth = {};
    try {
      meth = typeof comp.methodology === 'string' ? JSON.parse(comp.methodology) : (comp.methodology || {});
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

  const Section = ({ id, title, children }) => {
    const isOpen = openSections.has(id);
    return (
      <Cd style={{ marginBottom: '16px', background: 'var(--bg)' }}>
        <div 
          onClick={() => toggleSection(id)} 
          style={{ padding: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <h2 style={{ fontSize: '1.2rem', margin: 0, fontFamily: 'var(--disp)', fontWeight: 600 }}>{title}</h2>
          <span style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
        </div>
        {isOpen && (
          <div style={{ padding: '0 16px 16px 16px', borderTop: '1px solid var(--bd)', paddingTop: '16px' }}>
            {children}
          </div>
        )}
      </Cd>
    );
  };

  const SourceBadge = ({ source, type }) => {
      let icon = '🟢';
      if (type === 'api') icon = '🔵';
      if (type === 'estimated') icon = '🟡';
      if (type === 'satellite') icon = '🟣';
      return (
          <span style={{ fontSize: '0.8rem', padding: '2px 6px', background: 'rgba(255,255,255,0.5)', borderRadius: '4px', border: '1px solid var(--bd)', marginLeft: '8px', verticalAlign: 'middle' }}>
             {icon} {source}
          </span>
      )
  };

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
              padding: '8px 16px', background: compareMode ? 'var(--primary)' : 'var(--sf2)', border: 'none',
              borderRadius: 'var(--radius-pill)', color: compareMode ? '#white' : 'var(--ink)', cursor: 'pointer',
              fontWeight: 600, fontSize: '14px', transition: 'background 0.2s'
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
                 style={{ padding: '10px 20px', background: 'var(--primary)', color: '#white', border: 'none', borderRadius: 'var(--radius-pill)', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}
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
           type="text" placeholder="Search companies or sectors..." value={search} onChange={e => setSearch(e.target.value)}
           style={{ width: '100%', padding: '14px 20px', background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--radius-pill)', color: 'var(--ink)', fontSize: '14px', marginBottom: '20px', outline: 'none', transition: 'border-color 0.2s' }}
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
                  <React.Fragment key={c.name}>
                  <tr 
                    onClick={() => setSelectedCompany(selectedCompany?.name === c.name ? null : c)} 
                    style={{ borderBottom: '1px solid var(--bd)', cursor: 'pointer', background: selectedCompany?.name === c.name ? 'var(--bg2)' : 'transparent', transition: 'background 0.2s' }}
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
                  {selectedCompany?.name === c.name && (
                      <tr>
                        <td colSpan="9" style={{ padding: 0 }}>
                          <div style={{ padding: '24px', background: 'var(--bg2)', borderBottom: '1px solid var(--bd)', borderLeft: '4px solid var(--primary)' }}>
                             {renderCompanyDetails()}
                          </div>
                        </td>
                      </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
         </div>
      </div>
    </div>
  );

  function renderCompanyDetails() {
    if (!selectedCompany) return null;
    return (
        <div style={{ borderTop: '1px solid var(--bd)' }}>
          {/* Header Panel from Profile Tab */}
          <Cd style={{ marginBottom: "24px", padding: '24px', background: 'linear-gradient(135deg, var(--sf), var(--bg))' }}>
            <Rw style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 style={{ marginBottom: 4, marginTop: 0, fontSize: '1.8rem', fontFamily: 'var(--disp)', fontWeight: 'bold' }}>{registryData?.official_name || selectedCompany.name}</h1>
                    <Rw style={{ gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                        <Bdg color="blu">{registryData?.jurisdiction || selectedCompany.country || "Country"}</Bdg>
                        {productionData?.sector && <Bdg>{productionData.sector.toUpperCase()}</Bdg>}
                        <Bdg color="jade">Clean200</Bdg>
                    </Rw>
                    {(() => {
                       const pdfUrl = selectedCompany.report_url || selectedCompany.url;
                       const hasPdf = pdfUrl && pdfUrl !== 'N/A' && (pdfUrl.startsWith('http://') || pdfUrl.startsWith('https://'));
                       if (!hasPdf) return null;
                       return (
                          <a href={pdfUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '12px', padding: '8px 16px', background: 'var(--sf2)', color: 'var(--primary)', textDecoration: 'none', borderRadius: 'var(--radius-pill)', border: '1px solid var(--bd)', fontWeight: 600, fontSize: '14px', transition: 'background 0.2s' }} onMouseEnter={(e) => e.target.style.background = 'var(--bg2)'} onMouseLeave={(e) => e.target.style.background = 'var(--sf2)'}>
                            📄 View ESG PDF Report
                          </a>
                       );
                    })()}
                </div>
                {financialData && (
                     <div style={{ textAlign: 'right' }}>
                         <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                             {financialData.stock_price.currency} {financialData.stock_price.current.toFixed(2)}
                         </div>
                         <div style={{ color: 'var(--tx3)', fontSize: '0.9rem' }}>
                             {financialData.exchange}:{financialData.ticker}
                         </div>
                     </div>
                )}
            </Rw>
          </Cd>

          {/* Detailed Intelligence Sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            <Section id="environmental" title="Environmental Metrics & Calculation Breakdown">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                    <div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <p><strong style={{ color: 'var(--ink)' }}>Method:</strong> {selectedMeth.standard}</p>
                            <p><strong style={{ color: 'var(--ink)' }}>GWP Version:</strong> {selectedMeth.gwp_version}</p>
                            <p><strong style={{ color: 'var(--ink)' }}>Boundary:</strong> {selectedMeth.boundary}</p>
                        </div>
                    </div>
                    <div>
                        <Rw style={{ gap: '24px', flexWrap: 'wrap', alignItems: "start" }}>
                            <div>
                                <M style={{ color: 'var(--tx3)', marginBottom: '4px', display: 'block' }}>Scope 1</M>
                                <span style={{ fontSize: "1.4rem", fontWeight: "bold" }}>{selectedCompany.s1 ? (parseFloat(selectedCompany.s1) / 1e6).toFixed(2) + "M tCO2e" : "N/A"}</span>
                            </div>
                            <div>
                                <M style={{ color: 'var(--tx3)', marginBottom: '4px', display: 'block' }}>Scope 2 (Market)</M>
                                <span style={{ fontSize: "1.4rem", fontWeight: "bold" }}>{selectedCompany.scope2_market ? (parseFloat(selectedCompany.scope2_market) / 1e6).toFixed(2) + "M tCO2e" : "N/A"}</span>
                            </div>
                        </Rw>
                    </div>
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
            </Section>

            <Section id="financial" title="Financial Context">
              {!financialData ? <M>Loading...</M> : (
                  <div>
                      <Rw style={{ gap: '24px', flexWrap: 'wrap', alignItems: "start" }}>
                          <div>
                              <M style={{ color: 'var(--tx3)', marginBottom: '4px', display: 'block' }}>Market Cap</M>
                              <span style={{ fontSize: "1.4rem", fontWeight: "bold" }}>${(financialData.market_cap_usd / 1e9).toFixed(1)}B</span> <SourceBadge type="api" source="Yahoo" />
                          </div>
                          <div>
                              <M style={{ color: 'var(--tx3)', marginBottom: '4px', display: 'block' }}>Revenue (TMM)</M>
                              <span style={{ fontSize: "1.4rem", fontWeight: "bold" }}>${(financialData.revenue_5yr[0].value_usd / 1e9).toFixed(1)}B</span> <SourceBadge type="api" source="AlphaVantage" />
                          </div>
                          <div>
                              <M style={{ color: 'var(--tx3)', marginBottom: '4px', display: 'block' }}>Revenue Growth</M>
                              <span style={{ fontSize: "1.4rem", fontWeight: "bold", color: financialData.revenue_growth_pct > 0 ? 'var(--jade)' : 'var(--red)' }}>
                                  {financialData.revenue_growth_pct > 0 ? '+' : ''}{financialData.revenue_growth_pct}%
                              </span>
                          </div>
                      </Rw>
                  </div>
              )}
            </Section>

            <Section id="production" title="Production Intelligence">
               {!productionData ? <M>Loading...</M> : (
                  <div>
                      <Rw style={{ gap: '24px', flexWrap: 'wrap', alignItems: "start" }}>
                          <div>
                              <M style={{ color: 'var(--tx3)', marginBottom: '4px', display: 'block' }}>Est. Annual Output</M>
                              <span style={{ fontSize: "1.4rem", fontWeight: "bold" }}>{(productionData.estimated_output_mt / 1e6).toFixed(1)}M tonnes</span> <SourceBadge type="estimated" source="GEM Models" />
                          </div>
                          <div>
                              <M style={{ color: 'var(--tx3)', marginBottom: '4px', display: 'block' }}>Capacity Utilization</M>
                              <span style={{ fontSize: "1.4rem", fontWeight: "bold" }}>{productionData.capacity_utilization_pct}%</span>
                          </div>
                          <div>
                              <M style={{ color: 'var(--tx3)', marginBottom: '4px', display: 'block' }}>Verified Facilities</M>
                              <span style={{ fontSize: "1.4rem", fontWeight: "bold" }}>{productionData.facility_count}</span>
                          </div>
                      </Rw>
                  </div>
               )}
            </Section>

            <Section id="cbam" title="CBAM + Trade Exposure">
                {!tradeData ? <M>Loading...</M> : (
                    <div>
                        <Rw style={{ gap: '24px', flexWrap: 'wrap', marginBottom: '16px', alignItems: "start" }}>
                          <div>
                              <M style={{ color: 'var(--tx3)', marginBottom: '4px', display: 'block' }}>Est. EU Export Vol</M>
                              <span style={{ fontSize: "1.4rem", fontWeight: "bold" }}>{tradeData.eu_export_volume_mt.toLocaleString()} tonnes</span> <SourceBadge type="api" source="UN Comtrade" />
                          </div>
                          <div>
                              <M style={{ color: 'var(--tx3)', marginBottom: '4px', display: 'block' }}>CBAM Rate Used</M>
                              <span style={{ fontSize: "1.4rem", fontWeight: "bold" }}>€{tradeData.cbam_rate_used.toFixed(2)}/t</span> <SourceBadge type="api" source="FeedOracle" />
                          </div>
                        </Rw>
                        <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                            <M style={{ color: 'var(--red)', fontWeight: 'bold' }}>Gross CBAM Liability Estimate</M>
                            <h1 style={{ color: 'var(--red)', margin: "5px 0" }}>€{(tradeData.cbam_liability_eur / 1e6).toFixed(1)}M / year</h1>
                            <M style={{ marginTop: '8px', fontSize: '0.9rem', color: "var(--red)" }}>Based on current EU ETS carbon price and estimated embedded emissions.</M>
                        </div>
                    </div>
                )}
            </Section>

            <Section id="greenwash" title="Greenwash Risk Analysis">
                {!greenwashData ? <M>Loading...</M> : (
                    <div>
                        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Risk Level:</h2>
                            <Bdg color={greenwashData.greenwash_risk === 'MEDIUM' ? 'amb' : 'red'}>
                                {greenwashData.greenwash_risk}
                            </Bdg>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {greenwashData.signals.map((s, i) => (
                                <Rw key={i} style={{ justifyContent: 'space-between', padding: '12px', background: 'var(--sf)', borderRadius: '8px', border: '1px solid var(--bd)' }}>
                                    <M>{s.name}</M>
                                    <Dot color={s.severity === 'HIGH' ? 'var(--red)' : s.severity === 'MEDIUM' ? 'var(--orange)' : 'var(--jade)'} />
                                </Rw>
                            ))}
                        </div>
                    </div>
                )}
            </Section>

            <Section id="lca" title="Product Lifecycle Carbon (LCA)">
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
                       <a href={lcaData.source_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '20px', color: 'var(--primary)', textDecoration: 'none', fontWeight: 600, fontSize: '14px' }} onMouseEnter={(e) => e.target.style.textDecoration = 'underline'} onMouseLeave={(e) => e.target.style.textDecoration = 'none'}>
                         Source Documentation
                       </a>
                     )}
                  </div>
               )}
            </Section>

            <Section id="supply_chain" title="Supply Chain Network">
                {openSections.has('supply_chain') && (
                    <Suspense fallback={<M>Loading Network...</M>}>
                        <SupplyChainGraph 
                            centralCompany={selectedCompany.name} 
                            suppliers={supplyChain.suppliers || []} 
                            buyers={[]} 
                        />
                        <M style={{ marginTop: '12px', display: 'block', fontSize: '0.85rem' }}>
                            B2B relationship mapping from ImportYeti and Open Supply Hub. 
                            <Bdg color="ora" style={{ marginLeft: '8px' }}>{supplyChain.total_shipments} Shipments Tracked</Bdg>
                        </M>
                    </Suspense>
                )}
            </Section>

            <Section id="logistics" title="Logistics & Maritime Tracking">
                {openSections.has('logistics') && (
                    <Cd>
                        <Rw style={{ justifyContent: 'space-between', marginBottom: '12px', padding: '12px' }}>
                            <M>Live Vessels in Route</M>
                            <Bdg color="blu">{vessels.length} Active</Bdg>
                        </Rw>
                        <table style={{ width: '100%', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', color: 'var(--tx3)' }}>
                                    <th style={{ padding: '8px 12px' }}>Vessel</th>
                                    <th style={{ padding: '8px 12px' }}>Status</th>
                                    <th style={{ padding: '8px 12px' }}>Speed</th>
                                    <th style={{ padding: '8px 12px' }}>Last Seen</th>
                                </tr>
                            </thead>
                            <tbody>
                                {vessels.map(v => (
                                    <tr key={v.mmsi} style={{ borderTop: '1px solid var(--bd)' }}>
                                        <td style={{ padding: '12px' }}>{v.vessel_name}</td>
                                        <td style={{ padding: '12px' }}><Dot color="grn" /> In Transit</td>
                                        <td style={{ padding: '12px' }}>{v.sog_knots} kn</td>
                                        <td style={{ fontSize: '0.75rem', padding: '12px' }}>{new Date(v.last_seen).toLocaleTimeString()}</td>
                                    </tr>
                                ))}
                                {vessels.length === 0 && <tr><td colSpan="4" style={{ padding: '12px', textAlign: 'center', color: 'var(--tx3)' }}>No vessels currently in tracked zones.</td></tr>}
                            </tbody>
                        </table>
                    </Cd>
                )}
            </Section>

            <Section id="peers" title="Sector Comparison (Intelligence)">
                {openSections.has('peers') && (
                    <Cd style={{ padding: '16px' }}>
                        <M style={{ marginBottom: '12px', fontWeight: 'bold' }}>Company vs Sector Mean</M>
                        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                            {peers.map(p => (
                                <div key={p.name} style={{ flex: '1', minWidth: '150px', padding: '10px', background: 'var(--bg2)', borderRadius: '6px' }}>
                                    <M style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{p.name}</M>
                                    <M style={{ fontSize: '0.75rem', color: 'var(--tx3)' }}>{p.country}</M>
                                    <Rw style={{ marginTop: '8px' }}>
                                        <Bdg color="red">{Math.round(p.co2)} mt</Bdg>
                                        <Bdg color="pur">{p.data_tier}</Bdg>
                                    </Rw>
                                </div>
                            ))}
                        </div>
                    </Cd>
                )}
            </Section>

            <Section id="satellite" title="Satellite Verification">
                {openSections.has('satellite') && (
                    <Suspense fallback={<Cd style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><M>Loading Satellite Engine...</M></Cd>}>
                        <SatelliteMiniMap 
                            facilities={productionData?.facilities || []} 
                            companyName={selectedCompany.name} 
                        />
                        <M style={{ marginTop: '12px', display: 'block', fontSize: '0.9rem', color: 'var(--tx3)' }}>
                            Live Sentinel-2 and VIIRS heat signatures for registered assets. 
                            <Bdg color="pur" style={{ marginLeft: '8px' }}>SATELLITE VERIFIED</Bdg>
                        </M>
                        {productionData?.facilities?.length > 0 && (
                            <div style={{ marginTop: '16px' }}>
                                <h4 style={{ marginBottom: '8px', fontSize: '1rem', color: 'var(--ink)' }}>Global Facilities Directory</h4>
                                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--bd)', borderRadius: '8px' }}>
                                    <table style={{ width: '100%', fontSize: '0.9rem', textAlign: 'left', borderCollapse: 'collapse' }}>
                                        <thead style={{ background: 'var(--sf2)', position: 'sticky', top: 0 }}>
                                            <tr>
                                                <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--bd)' }}>Facility Name</th>
                                                <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--bd)' }}>Latitude</th>
                                                <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--bd)' }}>Longitude</th>
                                                <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--bd)' }}>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {productionData.facilities.map((f, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid var(--bd)' }}>
                                                    <td style={{ padding: '8px 12px' }}>{f.name}</td>
                                                    <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)' }}>{f.lat.toFixed(4)}</td>
                                                    <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)' }}>{f.lng.toFixed(4)}</td>
                                                    <td style={{ padding: '8px 12px' }}><Dot color="grn" /> Active</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </Suspense>
                )}
            </Section>

          </div>
        </div>
    );
  }
}
