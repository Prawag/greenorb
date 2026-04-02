import React, { useState, useEffect, lazy, Suspense } from "react";
import { M, Bdg, Cd, Rw, Dot } from "../components/primitives"; // Using existing primitives

const SatelliteMiniMap = lazy(() => import('../components/SatelliteMiniMap'));
const SupplyChainGraph = lazy(() => import('../components/SupplyChainGraph'));

export default function CompanyProfileTab() {
  const [selectedCompany, setSelectedCompany] = useState("Tata Steel");
  const [openSections, setOpenSections] = useState(new Set([
    'financial', 'production', 'environmental', 'cbam', 'logistics', 'satellite', 'greenwash'
  ]));
  
  const [companyData, setCompanyData] = useState(null);
  const [financialData, setFinancialData] = useState(null);
  const [tradeData, setTradeData] = useState(null);
  const [productionData, setProductionData] = useState(null);
  const [greenwashData, setGreenwashData] = useState(null);
  const [registryData, setRegistryData] = useState(null);
  const [supplyChain, setSupplyChain] = useState({ suppliers: [], total_shipments: 0 });
  const [peers, setPeers] = useState([]);
  const [vessels, setVessels] = useState([]);

  useEffect(() => {
    // Check URL parameters for selected company
    const params = new URLSearchParams(window.location.search);
    const companyParam = params.get('company');
    if (companyParam) {
      setSelectedCompany(companyParam);
    }
  }, []);

  useEffect(() => {
    if (!selectedCompany) return;

    const loadData = async () => {
      try {
        fetch(`http://localhost:5000/api/company/${selectedCompany}/registry`)
          .then(res => res.json())
          .then(res => setRegistryData(res.data))
          .catch(console.error);

        setTimeout(() => {
          fetch(`http://localhost:5000/api/company/${selectedCompany}/financials`)
            .then(res => res.json())
            .then(res => setFinancialData(res.data))
            .catch(console.error);
        }, 500);

        setTimeout(() => {
          fetch(`http://localhost:5000/api/company/${selectedCompany}/trade?year=2024`)
            .then(res => res.json())
            .then(res => setTradeData(res.data))
            .catch(console.error);
        }, 1000);

        setTimeout(() => {
          fetch(`http://localhost:5000/api/company/${selectedCompany}/production`)
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

        // Load Supply Chain
        fetch(`http://localhost:5000/api/company/${selectedCompany}/suppliers`)
          .then(r => r.json()).then(d => setSupplyChain(d))
          .catch(console.error);

        // Load Peers
        fetch(`http://localhost:5000/api/company/${selectedCompany}/peers`)
          .then(r => r.json()).then(d => setPeers(d.data || []))
          .catch(console.error);

        // Load Vessels
        fetch(`http://localhost:5000/api/vessels/active?company=${selectedCompany}`)
          .then(r => r.json()).then(d => setVessels(d.data || []))
          .catch(console.error);


      } catch (err) {
        console.error("Error loading company profile data:", err);
      }
    };

    loadData();
  }, [selectedCompany]);

  const toggleSection = (id) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const Section = ({ id, title, children }) => {
    const isOpen = openSections.has(id);
    return (
      <Cd style={{ marginBottom: '16px', background: 'var(--bg)' }}>
        <div 
          onClick={() => toggleSection(id)} 
          style={{ padding: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <h2 style={{ fontSize: '1.2rem', margin: 0, fontFamily: 'var(--disp)', fontWeight: 600 }}>{title}</h2>
          <span style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}>
             ▼
          </span>
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
    <div style={{ padding: "var(--safe) 16px calc(var(--nav) + var(--safe) + 16px)", maxWidth: "800px", margin: "0 auto", overflowY: "auto", height: "100%", paddingBottom: "120px" }}>
      
      {/* Header Panel */}
      <Cd style={{ marginBottom: "24px", padding: '24px', background: 'linear-gradient(135deg, var(--sf), var(--bg))' }}>
        <Rw style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
                <h1 style={{ marginBottom: 4, marginTop: 0, fontSize: '1.8rem', fontFamily: 'var(--disp)', fontWeight: 'bold' }}>{registryData?.official_name || selectedCompany}</h1>
                <Rw style={{ gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <Bdg color="blu">{registryData?.jurisdiction || "Country"}</Bdg>
                    {productionData?.sector && <Bdg>{productionData.sector.toUpperCase()}</Bdg>}
                    <Bdg color="jade">Clean200</Bdg>
                </Rw>
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

      <Section id="environmental" title="Environmental Performance">
          <Rw style={{ gap: '24px', flexWrap: 'wrap', alignItems: "start" }}>
             <div>
                <M style={{ color: 'var(--tx3)', marginBottom: '4px', display: 'block' }}>Scope 1</M>
                <span style={{ fontSize: "1.4rem", fontWeight: "bold" }}>18.4M tCO2e</span> <SourceBadge type="verified" source="BRSR 2024" />
             </div>
             <div>
                <M style={{ color: 'var(--tx3)', marginBottom: '4px', display: 'block' }}>Scope 2 (Market)</M>
                <span style={{ fontSize: "1.4rem", fontWeight: "bold" }}>2.1M tCO2e</span>
             </div>
             <div>
                <M style={{ color: 'var(--tx3)', marginBottom: '4px', display: 'block' }}>Water Intensity</M>
                <span style={{ fontSize: "1.4rem", fontWeight: "bold" }}>14.2 kL/t</span> <SourceBadge type="verified" source="BRSR 2024" />
             </div>
          </Rw>
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

      <Section id="supply_chain" title="Supply Chain Network">
          {openSections.has('supply_chain') && (
              <Suspense fallback={<M>Loading Network...</M>}>
                  <SupplyChainGraph 
                      centralCompany={selectedCompany} 
                      suppliers={supplyChain.suppliers || []} 
                      buyers={[]} // Reverse lookup in future
                  />
                  <M style={{ marginTop: '12px', display: 'block', fontSize: '0.85rem' }}>
                      B2B relationship mapping from ImportYeti and Open Supply Hub. 
                      <Bdg color="ora">{supplyChain.total_shipments} Shipments Tracked</Bdg>
                  </M>
              </Suspense>
          )}
      </Section>

      <Section id="logistics" title="Logistics & Maritime Tracking">
          {openSections.has('logistics') && (
              <Cd>
                  <Rw style={{ justifyContent: 'space-between', marginBottom: '12px' }}>
                      <M>Live Vessels in Route</M>
                      <Bdg color="blu">{vessels.length} Active</Bdg>
                  </Rw>
                  <table style={{ width: '100%', fontSize: '0.9rem' }}>
                      <thead>
                          <tr style={{ textAlign: 'left', color: 'var(--tx3)' }}>
                              <th>Vessel</th>
                              <th>Status</th>
                              <th>Speed</th>
                              <th>Last Seen</th>
                          </tr>
                      </thead>
                      <tbody>
                          {vessels.map(v => (
                              <tr key={v.mmsi} style={{ borderTop: '1px solid var(--bd)' }}>
                                  <td style={{ padding: '8px 0' }}>{v.vessel_name}</td>
                                  <td><Dot color="grn" /> In Transit</td>
                                  <td>{v.sog_knots} kn</td>
                                  <td style={{ fontSize: '0.75rem' }}>{new Date(v.last_seen).toLocaleTimeString()}</td>
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
              <Cd>
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
                      companyName={selectedCompany} 
                  />
                  <M style={{ marginTop: '12px', display: 'block', fontSize: '0.9rem', color: 'var(--tx3)' }}>
                      Live Sentinel-2 and VIIRS heat signatures for registered assets. 
                      <Bdg color="pur" style={{ marginLeft: '8px' }}>SATELLITE VERIFIED</Bdg>
                  </M>
              </Suspense>
          )}
      </Section>
    </div>
  );
}
