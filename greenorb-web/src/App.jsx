import { useState, useEffect } from 'react'
import GlobeViz from './components/GlobeViz'
import AuditTab from './components/AuditTab'
import { Activity, Globe, ShieldAlert, BarChart3, CloudRain, LayoutDashboard, Database, Zap, FileText, Scale, Search, CheckCircle, AlertTriangle, XCircle, Leaf } from 'lucide-react'
import axios from 'axios'
import './index.css'

const API_BASE = 'http://localhost:8000/api'

function App() {
  const [globeData, setGlobeData] = useState([])
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('smart-city') // 'smart-city', 'companies-data', 'pipeline', 'benchmark', 'actions'
  
  // Benchmark state
  const [benchmarkCompanyA, setBenchmarkCompanyA] = useState(null)
  const [benchmarkCompanyB, setBenchmarkCompanyB] = useState(null)
  
  // Actions state
  const [actionsSearch, setActionsSearch] = useState('')
  const [actionsList, setActionsList] = useState([])

  // Fetch globe data on mount
  useEffect(() => {
    async function fetchGlobeData() {
      try {
        const [companiesRes, citiesRes] = await Promise.all([
          axios.get(`${API_BASE}/metrics/globe-data`),
          axios.get(`${API_BASE}/cities`)
        ]);
        
        const companiesData = companiesRes.data.map(d => ({...d, type: 'company'}));
        const citiesData = citiesRes.data.map(d => ({...d, type: 'city'}));
        
        setGlobeData([...companiesData, ...citiesData]);
        setLoading(false);
      } catch (err) {
        console.error("Failed to fetch globe data", err)
        setLoading(false)
      }
    }
    fetchGlobeData()
  }, [])

  // Fetch Actions when tab opens or search changes
  useEffect(() => {
    if (activeTab === 'actions') {
      axios.get(`${API_BASE}/actions?query=${actionsSearch}&limit=50`)
        .then(res => setActionsList(res.data))
        .catch(err => console.error(err))
    }
  }, [activeTab, actionsSearch])

  const handlePointClick = async (point) => {
    try {
      if (point.type === 'city') {
        setSelectedCompany(point);
        setActiveTab('smart-city');
        return;
      }
      
      const response = await axios.get(`${API_BASE}/companies/${point.id}`)
      setSelectedCompany(response.data)
      
      const metricsResponse = await axios.get(`${API_BASE}/metrics/${point.id}/summary`)
      setSelectedCompany(prev => ({ ...prev, type: 'company', metrics: metricsResponse.data.Environmental || [] }))
      
      setActiveTab('smart-city')
    } catch (err) {
      console.error("Failed to fetch details", err)
    }
  }

  // --- TAB: Companies ESG Data (Rankings + Freshness) ---
  const renderCompaniesData = () => {
    const companiesOnly = globeData.filter(d => d.type === 'company');
    return (
      <div className="tab-content" style={{ padding: '3rem', width: '100%', maxWidth: '1200px', margin: '0 auto', overflowY: 'auto' }}>
        <h2 className="hero-header" style={{ fontSize: '2.5rem' }}>Companies ESG Data</h2>
        <p className="hero-subtitle" style={{ marginBottom: '2rem' }}>Comprehensive database of extracted metrics</p>
        
        <div style={{ display: 'grid', gap: '1rem' }}>
          {companiesOnly.map(d => (
            <div key={d.id} className="company-item" onClick={() => handlePointClick(d)} style={{ background: 'var(--color-data-surface)', cursor: 'pointer', padding: '1.5rem', borderRadius: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--color-whisper-outline)' }}>
              <div>
                <div className="name" style={{ fontSize: '1.25rem', fontWeight: 600 }}>{d.name}</div>
                <div className="country" style={{ color: 'var(--color-muted-metadata)' }}>{d.industry} | {d.country}</div>
              </div>
              <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.875rem', color: 'var(--color-muted-metadata)' }}>Scope 1+2 Emissions</div>
                  <div className="mono" style={{ color: 'var(--color-emerald)', fontSize: '1.125rem', fontWeight: 700 }}>
                    {Math.round(d.total_emissions).toLocaleString()} tCO2e
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // --- TAB: Sustainability Benchmark ---
  const renderBenchmark = () => {
    const companies = globeData.filter(d => d.type === 'company');
    
    const loadCompanyA = async (id) => {
      const [compRes, metRes] = await Promise.all([
        axios.get(`${API_BASE}/companies/${id}`),
        axios.get(`${API_BASE}/metrics/${id}/summary`)
      ]);
      setBenchmarkCompanyA({ ...compRes.data, metrics: metRes.data.Environmental || [] });
    }
    
    const loadCompanyB = async (id) => {
      const [compRes, metRes] = await Promise.all([
        axios.get(`${API_BASE}/companies/${id}`),
        axios.get(`${API_BASE}/metrics/${id}/summary`)
      ]);
      setBenchmarkCompanyB({ ...compRes.data, metrics: metRes.data.Environmental || [] });
    }

    const getMetricVal = (comp, namePart) => {
      if (!comp || !comp.metrics) return 'N/A';
      const m = comp.metrics.find(x => x.metric_name.toLowerCase().includes(namePart.toLowerCase()));
      return m ? `${m.value} ${m.unit || ''}` : 'N/A';
    }

    return (
      <div className="tab-content" style={{ padding: '3rem', width: '100%', maxWidth: '1200px', margin: '0 auto', overflowY: 'auto' }}>
        <h2 className="hero-header" style={{ fontSize: '2.5rem' }}>Sustainability Benchmarking</h2>
        <p className="hero-subtitle" style={{ marginBottom: '2rem' }}>Side-by-side metric comparison</p>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '3rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-muted-metadata)' }}>Select Company A</label>
            <select 
              style={{ width: '100%', padding: '1rem', background: 'var(--color-data-surface)', border: '1px solid var(--color-whisper-outline)', color: 'white', borderRadius: '0.5rem' }}
              onChange={(e) => loadCompanyA(e.target.value)}
            >
              <option value="">-- Select --</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-muted-metadata)' }}>Select Company B</label>
            <select 
              style={{ width: '100%', padding: '1rem', background: 'var(--color-data-surface)', border: '1px solid var(--color-whisper-outline)', color: 'white', borderRadius: '0.5rem' }}
              onChange={(e) => loadCompanyB(e.target.value)}
            >
              <option value="">-- Select --</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {benchmarkCompanyA && benchmarkCompanyB && (
          <div style={{ background: 'var(--color-data-surface)', border: '1px solid var(--color-whisper-outline)', borderRadius: '0.5rem', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <th style={{ padding: '1.5rem', textAlign: 'left', borderBottom: '1px solid var(--color-whisper-outline)', color: 'var(--color-muted-metadata)' }}>Metric</th>
                  <th style={{ padding: '1.5rem', textAlign: 'left', borderBottom: '1px solid var(--color-whisper-outline)', color: 'white', fontSize: '1.25rem' }}>{benchmarkCompanyA.name}</th>
                  <th style={{ padding: '1.5rem', textAlign: 'left', borderBottom: '1px solid var(--color-whisper-outline)', color: 'white', fontSize: '1.25rem' }}>{benchmarkCompanyB.name}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Scope 1 Emissions", key: "Scope 1" },
                  { label: "Scope 2 Emissions", key: "Scope 2" },
                  { label: "Scope 3 Emissions", key: "Scope 3" },
                  { label: "Renewable Energy", key: "Renewable Energy" },
                  { label: "Water Usage", key: "Water" },
                  { label: "Climate Targets", key: "Climate Targets" },
                  { label: "Sustainability Investment", key: "Sustainability Investment" },
                  { label: "Annual Revenue", key: "Revenue" }
                ].map((row, i) => (
                  <tr key={i}>
                    <td style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-whisper-outline)', fontWeight: 600 }}>{row.label}</td>
                    <td style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-whisper-outline)', fontFamily: 'var(--font-mono)', color: 'var(--color-emerald)' }}>{getMetricVal(benchmarkCompanyA, row.key)}</td>
                    <td style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-whisper-outline)', fontFamily: 'var(--font-mono)', color: 'var(--color-emerald)' }}>{getMetricVal(benchmarkCompanyB, row.key)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  // --- TAB: Actions Database ---
  const renderActions = () => (
    <div className="tab-content" style={{ padding: '3rem', width: '100%', maxWidth: '1200px', margin: '0 auto', overflowY: 'auto' }}>
      <h2 className="hero-header" style={{ fontSize: '2.5rem' }}>Sustainability Actions Database</h2>
      <p className="hero-subtitle" style={{ marginBottom: '2rem' }}>Semantic search of concrete climate initiatives extracted from reports</p>
      
      <div style={{ position: 'relative', marginBottom: '3rem' }}>
        <Search size={20} color="var(--color-muted-metadata)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
        <input 
          type="text" 
          placeholder="e.g. 'solar installations', 'water recycling'..." 
          value={actionsSearch}
          onChange={e => setActionsSearch(e.target.value)}
          style={{ width: '100%', padding: '1.25rem 1.25rem 1.25rem 3.5rem', background: 'var(--color-data-surface)', border: '1px solid var(--color-whisper-outline)', color: 'white', borderRadius: '0.5rem', fontSize: '1.125rem' }}
        />
      </div>

      <div style={{ display: 'grid', gap: '1rem' }}>
        {actionsList.length === 0 ? (
          <div style={{ color: 'var(--color-muted-metadata)', textAlign: 'center', padding: '3rem' }}>No actions found. Wait for the background scraper to extract more data!</div>
        ) : actionsList.map((action, i) => (
          <div key={action.id || i} style={{ background: 'var(--color-data-surface)', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid var(--color-whisper-outline)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <div style={{ color: 'var(--color-emerald)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Leaf size={16} /> {action.category.toUpperCase()}
              </div>
              <div style={{ color: 'var(--color-muted-metadata)', fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>{action.company_name}</div>
            </div>
            <div style={{ lineHeight: '1.6' }}>{action.description}</div>
          </div>
        ))}
      </div>
    </div>
  )

  // --- TAB: Data Pipeline Ingestion ---
  const renderPipeline = () => (
    <div className="tab-content" style={{ padding: '3rem', width: '100%', maxWidth: '1200px', margin: '0 auto', overflowY: 'auto' }}>
      <h2 className="hero-header" style={{ fontSize: '2.5rem' }}>Pipeline Ingestion</h2>
      <p className="hero-subtitle" style={{ marginBottom: '2rem' }}>Real-time status of the batch analysis engine</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="stat-card">
          <span className="label">Total Documents Processed</span>
          <span className="value">{globeData.length} / 550</span>
        </div>
        <div className="stat-card">
          <span className="label">LLM Engine</span>
          <span className="value" style={{ color: 'var(--color-emerald)' }}>llama-3.3-70b</span>
        </div>
      </div>
      
      <div style={{ padding: '2rem', border: '1px solid var(--color-whisper-outline)', borderRadius: '0.5rem', background: 'var(--color-data-surface)' }}>
        <h3 style={{ marginBottom: '1rem', color: 'var(--color-muted-metadata)'}}>Live System Logs</h3>
        <div className="mono" style={{ fontSize: '0.875rem', color: 'var(--color-emerald)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div>[INFO] Scraping S&P 500 and NIFTY 50...</div>
          <div>[SUCCESS] Found ESG PDF for Reliance Industries.</div>
          <div>[INFO] Extracting metrics and sustainability actions...</div>
          <div><span style={{ animation: 'pulse 1.5s infinite' }}>[PROCESSING] Background batch_analyze.py running...</span></div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="app-layout">
      {/* Sidebar Navigation */}
      <nav className="sidebar">
        <div className="nav-brand">
          <Globe size={28} color="var(--color-emerald)" />
        </div>
        <div className="nav-items">
          <button className={`nav-btn ${activeTab === 'smart-city' ? 'active' : ''}`} onClick={() => setActiveTab('smart-city')} title="Smart City Dashboard">
            <LayoutDashboard size={24} />
          </button>
          <button className={`nav-btn ${activeTab === 'companies-data' ? 'active' : ''}`} onClick={() => setActiveTab('companies-data')} title="Companies ESG Data">
            <Database size={24} />
          </button>
          <button className={`nav-btn ${activeTab === 'benchmark' ? 'active' : ''}`} onClick={() => setActiveTab('benchmark')} title="Benchmarking">
            <Scale size={24} />
          </button>
          <button className={`nav-btn ${activeTab === 'actions' ? 'active' : ''}`} onClick={() => setActiveTab('actions')} title="Sustainability Actions">
            <Leaf size={24} />
          </button>
          <button className={`nav-btn ${activeTab === 'pipeline' ? 'active' : ''}`} onClick={() => setActiveTab('pipeline')} title="Data Pipeline">
            <Zap size={24} />
          </button>
          <button className={`nav-btn ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')} title="BRSR Compliance Audit">
            <FileText size={24} />
          </button>
        </div>
      </nav>

      <main className="main-content">
        {activeTab === 'smart-city' && (
          <div className="app-container">
            {/* Left Data Panel */}
            <div className="left-panel">
              <div>
                <h1 className="hero-header">GreenOrb</h1>
                <p className="hero-subtitle">Real-time Global ESG Intelligence</p>
              </div>

              {/* Global Stats Overview */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="stat-card">
                  <span className="label"><Activity size={16} style={{display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px'}}/> Entities</span>
                  <span className="value">{globeData.length}</span>
                </div>
                <div className="stat-card alert">
                  <span className="label"><ShieldAlert size={16} style={{display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px'}}/> High Risk</span>
                  <span className="value">
                    {globeData.filter(d => d.color === 'red').length}
                  </span>
                </div>
              </div>

              {/* Dynamic Context Panel */}
              <div style={{ marginTop: '1rem' }}>
                {selectedCompany ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fadeIn 0.5s ease-out' }}>
                    <div style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--color-whisper-outline)'}}>
                      <h2 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', color: selectedCompany.type === 'city' ? '#8B5CF6' : 'white' }}>{selectedCompany.name}</h2>
                      
                      {selectedCompany.type === 'city' ? (
                        <div style={{ color: 'var(--color-muted-metadata)', fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                          Smart City Hub | {selectedCompany.country}
                        </div>
                      ) : (
                        <>
                          <div style={{ color: 'var(--color-muted-metadata)', fontFamily: 'var(--font-mono)', fontSize: '0.875rem', display: 'flex', justifyContent: 'space-between' }}>
                            <span>HQ: {selectedCompany.headquarters_country || selectedCompany.country} | Sector: {selectedCompany.sector || selectedCompany.industry}</span>
                          </div>
                          
                          {/* Freshness & Greenwash Badges */}
                          <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                            {/* Freshness Badge */}
                            {selectedCompany.months_since_publish !== undefined && (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '999px', fontSize: '0.875rem', fontWeight: 600, background: selectedCompany.months_since_publish <= 6 ? 'rgba(16, 185, 129, 0.1)' : selectedCompany.months_since_publish <= 12 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: selectedCompany.months_since_publish <= 6 ? '#10B981' : selectedCompany.months_since_publish <= 12 ? '#F59E0B' : '#EF4444', border: `1px solid ${selectedCompany.months_since_publish <= 6 ? '#10B981' : selectedCompany.months_since_publish <= 12 ? '#F59E0B' : '#EF4444'}` }}>
                                {selectedCompany.months_since_publish <= 6 ? <CheckCircle size={16} /> : selectedCompany.months_since_publish <= 12 ? <AlertTriangle size={16} /> : <XCircle size={16} />}
                                Report: {selectedCompany.months_since_publish} mo old
                              </div>
                            )}

                            {/* Greenwash Risk Badge */}
                            {selectedCompany.greenwash_risk && (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '999px', fontSize: '0.875rem', fontWeight: 600, background: selectedCompany.greenwash_risk === 'LOW' ? 'rgba(16, 185, 129, 0.1)' : selectedCompany.greenwash_risk === 'MEDIUM' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: selectedCompany.greenwash_risk === 'LOW' ? '#10B981' : selectedCompany.greenwash_risk === 'MEDIUM' ? '#F59E0B' : '#EF4444', border: `1px solid ${selectedCompany.greenwash_risk === 'LOW' ? '#10B981' : selectedCompany.greenwash_risk === 'MEDIUM' ? '#F59E0B' : '#EF4444'}` }}>
                                <ShieldAlert size={16} /> Greenwash Risk: {selectedCompany.greenwash_risk}
                              </div>
                            )}
                          </div>
                          
                          {/* Documents Section */}
                          {selectedCompany.documents && selectedCompany.documents.length > 0 && (
                            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              {selectedCompany.documents.map((doc, idx) => (
                                <a 
                                  key={idx} 
                                  href={doc.static_url ? `http://localhost:8000${doc.static_url}` : doc.url} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="nav-btn"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'var(--color-data-surface)', border: '1px solid var(--color-whisper-outline)', color: 'var(--color-emerald)', fontSize: '0.875rem', textDecoration: 'none' }}
                                >
                                  <FileText size={16} />
                                  {doc.title || "Original ESG Report"}
                                </a>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <h3 style={{ fontSize: '1.25rem', color: 'var(--color-muted-metadata)'}}>
                        {selectedCompany.type === 'city' ? 'City Metrics' : 'Extracted Metrics'}
                      </h3>
                      
                      {selectedCompany.type === 'city' ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
                            <div className="stat-card" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderLeft: selectedCompany.aqi > 150 ? '4px solid #EF4444' : '4px solid #10B981' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <CloudRain size={20} color="var(--color-muted-metadata)"/>
                                <span style={{ fontWeight: 600 }}>Air Quality Index</span>
                              </div>
                              <span className="mono" style={{ color: selectedCompany.aqi > 150 ? '#EF4444' : '#10B981', fontSize: '1.25rem', fontWeight: 700 }}>{selectedCompany.aqi}</span>
                            </div>
                            
                            <div className="stat-card" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '1rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <Zap size={20} color="var(--color-muted-metadata)"/>
                                <span style={{ fontWeight: 600 }}>Energy Consumption</span>
                              </div>
                              <span className="mono" style={{ color: 'var(--color-emerald)', fontSize: '1.25rem', fontWeight: 700 }}>{selectedCompany.energy_consumption_mwh} MWh</span>
                            </div>

                            <div className="stat-card" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '1rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <Activity size={20} color="var(--color-muted-metadata)"/>
                                <span style={{ fontWeight: 600 }}>Waste Recycling Rate</span>
                              </div>
                              <span className="mono" style={{ color: 'var(--color-emerald)', fontSize: '1.25rem', fontWeight: 700 }}>{selectedCompany.waste_recycling_rate}%</span>
                            </div>
                        </div>
                      ) : selectedCompany.metrics && selectedCompany.metrics.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
                          {selectedCompany.metrics.map((m, i) => (
                            <div key={i} className="stat-card" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '1rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                {m.metric_name && m.metric_name.includes('Water') ? <CloudRain size={20} color="var(--color-muted-metadata)"/> : <BarChart3 size={20} color="var(--color-muted-metadata)"/>}
                                <span style={{ fontWeight: 600 }}>{m.metric_name}</span>
                              </div>
                              <span className="mono" style={{ color: 'var(--color-emerald)', fontSize: '1.25rem', fontWeight: 700 }}>{m.value || 'N/A'} {m.unit || ''}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ padding: '2rem', textAlign: 'center', border: '1px dashed var(--color-whisper-outline)', borderRadius: '0.5rem', color: 'var(--color-muted-metadata)' }}>
                          No Extracted Metrics Available
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--color-muted-metadata)' }}>
                    <Globe size={48} style={{ opacity: 0.2, margin: '0 auto 1rem auto' }} />
                    <p>Interact with the globe to analyze deep-scan ESG data.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Globe Panel */}
            <div className="right-panel">
              {loading && (
                <div style={{ position: 'absolute', zIndex: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-emerald)', animation: 'pulse 1.5s infinite' }}>
                  INITIALIZING GLOBAL ORBIT...
                </div>
              )}
              <GlobeViz data={globeData} onPointClick={handlePointClick} />
            </div>
          </div>
        )}
        
        {activeTab === 'companies-data' && renderCompaniesData()}
        {activeTab === 'benchmark' && renderBenchmark()}
        {activeTab === 'actions' && renderActions()}
        {activeTab === 'pipeline' && renderPipeline()}
        {activeTab === 'audit' && <AuditTab />}
      </main>

      <style>{`
        .app-layout {
          display: flex;
          height: 100vh;
          width: 100vw;
          overflow: hidden;
        }
        .sidebar {
          width: 80px;
          background: var(--color-canvas-charcoal);
          border-right: 1px solid var(--color-whisper-outline);
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 2rem 0;
          z-index: 50;
        }
        .nav-brand {
          margin-bottom: 3rem;
        }
        .nav-items {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .nav-btn {
          background: transparent;
          border: none;
          color: var(--color-muted-metadata);
          cursor: pointer;
          padding: 0.75rem;
          border-radius: 0.5rem;
          transition: var(--transition-spring);
        }
        .nav-btn:hover {
          color: var(--color-primary-text);
          background: var(--color-data-surface);
        }
        .nav-btn.active {
          color: var(--color-emerald);
          background: var(--color-emerald-muted);
        }
        .main-content {
          flex: 1;
          display: flex;
          background: var(--color-canvas-charcoal);
          overflow: hidden;
        }
        .tab-content {
          animation: fadeIn 0.4s ease-out;
        }
        @keyframes pulse {
          0% { opacity: 0.5; }
          50% { opacity: 1; }
          100% { opacity: 0.5; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default App

// Trigger reload
