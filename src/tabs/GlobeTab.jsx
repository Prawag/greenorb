import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Globe from 'react-globe.gl';
import * as THREE from 'three';
import { LAYERS, LAYER_IDS, DEFAULT_ON } from '../config/layers.config';
import { useCompanies, useCountries, useNewsVelocity, useClimateTrace, useAgentStatus } from '../hooks/useGlobeData';
import { Bdg, M, Rw } from '../components/primitives';
import './GlobeTab.css';

// ─── Debounce utility ─────────────────────────────────────────────────────────
function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ─── Time-ago helper ──────────────────────────────────────────────────────────
function timeAgo(isoStr) {
    if (!isoStr) return 'never';
    const s = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

export default function GlobeTab() {
    const globeRef = useRef();
    const [width, setWidth] = useState(window.innerWidth > 1100 ? 1100 : window.innerWidth);
    const [selectedCompany, setSelectedCompany] = useState(null);

    // Layer toggle state
    const [activeLayers, setActiveLayers] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        const layersParam = params.get('layers');
        return layersParam ? layersParam.split(',').filter(l => LAYER_IDS.includes(l)) : [...DEFAULT_ON];
    });
    const toggleLayer = (id) => setActiveLayers(prev =>
        prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]
    );
    const isActive = (id) => activeLayers.includes(id);

    // Data hooks — each fetches independently
    const companies    = useCompanies();
    const countries    = useCountries();
    const newsVelocity = useNewsVelocity();
    const climateTrace = useClimateTrace();
    const agentStatus  = useAgentStatus();

    // Helper: get layer state by ID
    const getLayerState = (id) => {
        const map = { companies, countries, newsVelocity, climateTrace };
        return map[id] || { loading: false, stale: false, error: null, cached_at: null, data: [] };
    };

    // Resize
    useEffect(() => {
        const handleResize = () => setWidth(window.innerWidth > 1100 ? 1100 : window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Initial camera — face Asia-Pacific; read URL params
    useEffect(() => {
        if (!globeRef.current) return;
        const params = new URLSearchParams(window.location.search);
        const lat  = parseFloat(params.get('lat')  || '22');
        const lng  = parseFloat(params.get('lng')  || '95');
        const zoom = parseFloat(params.get('zoom') || '2.5');
        globeRef.current.pointOfView({ lat, lng, altitude: zoom }, 1500);
        globeRef.current.controls().autoRotate = true;
        globeRef.current.controls().autoRotateSpeed = 0.3;
    }, []);

    // URL state sync (debounced)
    const syncURL = useCallback(debounce((pov, layers) => {
        const params = new URLSearchParams();
        params.set('lat',    pov.lat.toFixed(4));
        params.set('lng',    pov.lng.toFixed(4));
        params.set('zoom',   pov.altitude.toFixed(2));
        params.set('layers', layers.join(','));
        window.history.replaceState(null, '', `?${params}`);
    }, 500), []);

    // Companies with EXTRACTING status get animated pulse
    const auditingCompanies = useMemo(() =>
        companies.data.filter(d => d.audit_status === 'EXTRACTING'),
        [companies.data]
    );

    // Merge audit rings + news rings
    const ringsData = useMemo(() => {
        const newsRings = isActive('newsVelocity')
            ? newsVelocity.data.filter(d => d.trending).map(d => ({ ...d, _type: 'news' }))
            : [];
        const auditRings = auditingCompanies.map(d => ({
            lat: d.lat, lng: d.lng, company_name: d.name, velocity: 2, _type: 'audit',
        }));
        return [...newsRings, ...auditRings];
    }, [newsVelocity.data, auditingCompanies, activeLayers]);

    // NASA GIBS — dynamic yesterday's date
    const yesterday = useMemo(() =>
        new Date(Date.now() - 86400000).toISOString().split('T')[0], []);
    const GIBS_URL = `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${yesterday}/250m/{z}/{y}/{x}.jpg`;
    const globeImageUrl = isActive('nasa_gibs')
        ? GIBS_URL
        : '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg';

    // Handle company/asset click
    const handlePointClick = (d) => {
        setSelectedCompany(d);
        if (globeRef.current) {
            globeRef.current.controls().autoRotate = false;
            globeRef.current.pointOfView({ lat: d.lat, lng: d.lng, altitude: 1.2 }, 800);
        }
    };

    const handleCustomClick = (obj) => {
        const d = obj?.userData || obj;
        if (d?.lat && d?.lng) {
            setSelectedCompany({
                name: d.name || 'Unknown Asset',
                country: d.country || 'Unknown',
                sector: d.sector || d.asset_type || 'Unknown',
                scope_total: d.co2e_mt || 0,
                greendex: null,
                esg_grade: 'N/A',
                lat: d.lat,
                lng: d.lng,
                _isAsset: true,
            });
            if (globeRef.current) {
                globeRef.current.controls().autoRotate = false;
                globeRef.current.pointOfView({ lat: d.lat, lng: d.lng, altitude: 1.2 }, 800);
            }
        }
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
            {/* ── LIVE HEADER ── */}
            <div className="globe-live-header">
                <div className="globe-live-header__dot" />
                <span>LIVE</span>
                <span style={{ opacity: 0.6 }}>·</span>
                <span>{agentStatus.active_agents} agents</span>
                <span style={{ opacity: 0.6 }}>·</span>
                <span>{agentStatus.audits_in_progress} auditing</span>
                <span style={{ opacity: 0.6 }}>·</span>
                <span>{agentStatus.total_companies} companies</span>
            </div>

            {/* ── GLOBE ── */}
            <Globe
                ref={globeRef}
                width={width}
                height={window.innerHeight - 60}
                globeImageUrl={globeImageUrl}
                bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
                backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
                atmosphereColor="#00ff88"
                atmosphereAltitude={0.15}

                // === PRIMITIVE 1: POINTS — companies ===
                pointsData={isActive('companies') ? companies.data : []}
                pointLat={d => d.lat}
                pointLng={d => d.lng}
                pointAltitude={LAYERS.companies.altitude}
                pointRadius={LAYERS.companies.radius}
                pointColor={LAYERS.companies.color}
                pointLabel={d => `
                    <div class="globe-tooltip">
                        <strong>${d.name}</strong><br/>
                        ${d.country} · ${d.sector}<br/>
                        Greendex: <span style="color:${LAYERS.companies.color(d)}">${d.greendex ?? 'N/A'}</span><br/>
                        Scope 1+2: ${d.scope_total ? (d.scope_total / 1e6).toFixed(2) + 'Mt' : 'Not disclosed'}<br/>
                        ${d.has_discrepancy ? '<span style="color:#FF3B3B">⚠ Math discrepancy detected</span><br/>' : ''}
                        ${d.absence_signals_count > 0 ? `<span style="color:#FF8C00">${d.absence_signals_count} disclosure gaps</span>` : ''}
                    </div>
                `}
                onPointClick={handlePointClick}
                pointsMerge={false}

                // === PRIMITIVE 2: RINGS — news velocity + audit pulse ===
                ringsData={ringsData}
                ringLat={d => d.lat}
                ringLng={d => d.lng}
                ringMaxRadius={d => d._type === 'audit' ? 3 : (d.velocity || 1) * 1.5}
                ringPropagationSpeed={d => d._type === 'audit' ? 3 : 2}
                ringRepeatPeriod={d => d._type === 'audit' ? 600 : 800}
                ringColor={d => () => d._type === 'audit' ? '#10B981' : '#A78BFA'}
                ringLabel={d => d._type === 'news' ?
                    `<div class="globe-tooltip"><strong>${d.company_name}</strong><br/>${d.velocity} ESG mentions today<br/>${d.latest_headline || ''}</div>` : ''}

                // === PRIMITIVE 3: POLYGONS — country choropleth ===
                polygonsData={isActive('countries') ? countries.data : []}
                polygonGeoJsonGeometry={d => d.geometry}
                polygonCapColor={d => LAYERS.countries.color(d)}
                polygonSideColor={() => 'rgba(0,0,0,0)'}
                polygonAltitude={0.001}
                polygonLabel={d => `
                    <div class="globe-tooltip">
                        <strong>${d.country}</strong><br/>
                        Avg Greendex: ${d.avg_greendex?.toFixed(1) ?? 'N/A'}<br/>
                        ${d.company_count} companies tracked<br/>
                        Disclosure rate: ${((d.disclosure_rate || 0) * 100).toFixed(0)}%
                    </div>
                `}

                // === PRIMITIVE 4: ARCS — future supply chain ===
                arcsData={[]}

                // === PRIMITIVE 5: CUSTOM — Climate TRACE assets ===
                customLayerData={isActive('climateTrace') ? climateTrace.data : []}
                customThreeObject={d => {
                    const geo  = new THREE.SphereGeometry(LAYERS.climateTrace.radius);
                    const mat  = new THREE.MeshLambertMaterial({
                        color: LAYERS.climateTrace.color(d),
                        transparent: true,
                        opacity: 0.85,
                    });
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.userData = d;
                    return mesh;
                }}
                customThreeObjectUpdate={(obj, d) => {
                    if (globeRef.current?.getCoords) {
                        Object.assign(obj.position, globeRef.current.getCoords(
                            d.lat, d.lng, LAYERS.climateTrace.altitude(d)
                        ) ?? {});
                    }
                }}
                onCustomLayerClick={handleCustomClick}

                onGlobeReady={() => {
                    if (globeRef.current) {
                        const pov = globeRef.current.pointOfView();
                        syncURL(pov, activeLayers);
                    }
                }}
            />

            {/* ── LAYER PANEL (left) ── */}
            <div className="globe-layer-panel">
                <div className="globe-layer-panel__header">
                    <span>Layers</span>
                    <span className="globe-layer-panel__count">
                        {companies.data.length} cos
                    </span>
                </div>
                {LAYER_IDS.map(id => {
                    const st = getLayerState(id);
                    const isNasa = id === 'nasa_gibs';
                    return (
                        <button
                            key={id}
                            className={`globe-layer-pill ${isActive(id) ? 'active' : ''}`}
                            onClick={() => {
                                toggleLayer(id);
                                if (globeRef.current) {
                                    const pov = globeRef.current.pointOfView();
                                    const next = isActive(id)
                                        ? activeLayers.filter(l => l !== id)
                                        : [...activeLayers, id];
                                    syncURL(pov, next);
                                }
                            }}
                        >
                            <span
                                className="globe-layer-pill__dot"
                                style={{
                                    background: isNasa ? '#3b82f6'
                                        : typeof LAYERS[id].color === 'function'
                                            ? LAYERS[id].color({ greendex: 60, asset_type: 'power-plant', velocity: 5 })
                                            : '#6b7280'
                                }}
                            />
                            {LAYERS[id].label}
                            {!isNasa && st.stale && <span className="stale-icon" title="Stale data">↻</span>}
                            {!isNasa && st.loading && <span className="loading-dot" />}
                            {!isNasa && st.error && <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />}
                        </button>
                    );
                })}
            </div>

            {/* ── COMPANY DETAIL PANEL (right) ── */}
            <div className={`globe-detail-panel ${selectedCompany ? 'open' : ''}`}>
                {selectedCompany && (
                    <>
                        <button className="globe-detail-panel__close" onClick={() => {
                            setSelectedCompany(null);
                            if (globeRef.current) globeRef.current.controls().autoRotate = true;
                        }}>✕</button>

                        <div className="globe-detail-panel__name">{selectedCompany.name}</div>
                        <div className="globe-detail-panel__meta">
                            <Bdg color="blu">{selectedCompany.country}</Bdg>
                            <Bdg color="amb">{selectedCompany.sector}</Bdg>
                            {selectedCompany.esg_grade && selectedCompany.esg_grade !== 'N/A' && (
                                <Bdg color="jade">ESG {selectedCompany.esg_grade}</Bdg>
                            )}
                        </div>

                        {/* Greendex Score */}
                        {selectedCompany.greendex != null && (
                            <div className="globe-detail-panel__greendex">
                                <div className="globe-detail-panel__greendex-score" style={{ color: LAYERS.companies.color(selectedCompany) }}>
                                    {selectedCompany.greendex}
                                </div>
                                <M size={10} color="var(--tx3)">Greendex Score</M>
                            </div>
                        )}

                        {/* Discrepancy warning */}
                        {selectedCompany.has_discrepancy && (
                            <div className="globe-detail-panel__warning">
                                ⚠ Math discrepancy detected in this company's ESG report
                            </div>
                        )}

                        {/* Scope bars */}
                        <M size={10} color="var(--tx3)" style={{ display: 'block', marginBottom: 8, letterSpacing: '.05em', textTransform: 'uppercase' }}>
                            Emissions Breakdown
                        </M>
                        {[
                            { label: 'Scope 1', value: selectedCompany.scope_1 || selectedCompany.co2e_mt || 0, color: '#10b981' },
                            { label: 'Scope 2', value: selectedCompany.scope_2 || 0, color: '#06b6d4' },
                            { label: 'Scope 3', value: selectedCompany.scope_3 || 0, color: '#f59e0b' },
                        ].map(s => {
                            const maxVal = Math.max(selectedCompany.scope_1 || 0, selectedCompany.scope_2 || 0, selectedCompany.scope_3 || 0, 1);
                            return (
                                <div key={s.label} className="globe-detail-panel__scope-row">
                                    <M size={10} color="var(--tx3)" style={{ width: 50 }}>{s.label}</M>
                                    <div style={{ flex: 1, background: 'var(--bg3)', borderRadius: 3, height: 6, overflow: 'hidden' }}>
                                        <div className="globe-detail-panel__scope-bar"
                                            style={{ width: `${Math.min((s.value / maxVal) * 100, 100)}%`, background: s.color }} />
                                    </div>
                                    <M size={10} mono color="var(--tx2)" style={{ width: 60, textAlign: 'right' }}>
                                        {s.value > 0 ? (s.value / 1e6).toFixed(2) + 'Mt' : '—'}
                                    </M>
                                </div>
                            );
                        })}

                        {/* Absence signals */}
                        {selectedCompany.absence_signals_count > 0 && (
                            <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8 }}>
                                <M size={11} color="#f59e0b" style={{ fontWeight: 600 }}>
                                    {selectedCompany.absence_signals_count} disclosure gaps detected
                                </M>
                            </div>
                        )}

                        {/* Action button */}
                        <button
                            className="globe-detail-panel__action"
                            onClick={() => {
                                // Navigate to Audit tab (trigger via URL or state)
                                window.dispatchEvent(new CustomEvent('greenorb:navigate', { detail: { tab: 'audit', company: selectedCompany.name } }));
                            }}
                        >
                            Open full audit →
                        </button>
                    </>
                )}
            </div>

            {/* ── SOURCE HEALTH BAR (bottom) ── */}
            <div className="globe-source-bar">
                {[
                    { label: 'Companies', state: companies },
                    { label: 'Countries', state: countries },
                    { label: 'Climate TRACE', state: climateTrace },
                    { label: 'RSS', state: newsVelocity },
                ].map(src => (
                    <div key={src.label} className="globe-source-bar__item">
                        <div className={`globe-source-bar__dot ${
                            src.state.error ? 'globe-source-bar__dot--error'
                            : src.state.stale ? 'globe-source-bar__dot--stale'
                            : 'globe-source-bar__dot--fresh'
                        }`} />
                        <span>{src.label} ({timeAgo(src.state.cached_at)})</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
