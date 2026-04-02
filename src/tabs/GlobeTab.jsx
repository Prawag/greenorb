import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import * as Cesium from 'cesium';
import { LAYERS, LAYER_IDS, DEFAULT_ON } from '../config/layers.config';
import { useCompanies, useCountries, useNewsVelocity, useClimateTrace, useAgentStatus, useFires, useGridCarbon, useAirQuality, useEarthquakes, useFloods, useCyclones, useVolcanoes, useEonet, useGdelt, useGreenwashVelocity, useGpmImerg, useSentinel, useBiodiversity, useOceanCurrents, useWaterStress, useForestLoss, useCoralBleaching, useFishingWatch } from '../hooks/useGlobeData';
import { useConvergenceEngine } from '../hooks/useConvergenceEngine';
import { Bdg, M, Rw } from '../components/primitives';
import { TimelineScrubber } from '../components/TimelineScrubber';
import { latLngToCell, cellToLatLng } from 'h3-js';
import './GlobeTab.css';

// ─── Debounce utility ─────────────────────────────────────────────────────────
function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function timeAgo(isoStr) {
    if (!isoStr) return 'never';
    const s = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

function buildH3Clusters(companies, resolution) {
    const cells = {};
    companies.forEach(c => {
        const cell = latLngToCell(c.lat, c.lng, resolution);
        if (!cells[cell]) {
            cells[cell] = { cell, companies: [], total_scope: 0, avg_greendex: 0, discrepancy_count: 0 };
        }
        cells[cell].companies.push(c);
        cells[cell].total_scope += c.scope_total || 0;
        cells[cell].discrepancy_count += c.has_discrepancy ? 1 : 0;
    });
    return Object.values(cells).map(cell => {
        const [lat, lng] = cellToLatLng(cell.cell);
        const greendexes = cell.companies.map(c => c.greendex).filter(Boolean);
        return {
            ...cell, lat, lng, count: cell.companies.length,
            avg_greendex: greendexes.length ? greendexes.reduce((a, b) => a + b, 0) / greendexes.length : null,
            has_any_discrepancy: cell.discrepancy_count > 0, _isH3: true,
        };
    });
}

function hexToResourceColor(hex) {
    if (!hex) return Cesium.Color.GRAY;
    if (hex.startsWith('rgba')) {
        const parts = hex.match(/[\d.]+/g);
        if (!parts) return Cesium.Color.GRAY;
        return new Cesium.Color(parts[0] / 255, parts[1] / 255, parts[2] / 255, parts[3]);
    }
    return Cesium.Color.fromCssColorString(hex);
}

// Canvas-based emoji icons
function makeEmojiCanvas(emoji, size = 32) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.font = `${size * 0.8}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, size / 2, size / 2);
    return canvas;
}

const ICONS = {
    earthquake: '🌋',
    flood: '🌊',
    cyclone: '🌀',
    volcano: '🔥',
    fire: '🔥',
    company: '🏢',
    satellite: '🛰️',
};

export default function GlobeTab() {
    const cesiumContainer = useRef(null);
    const viewerRef = useRef(null);
    const primitivesRef = useRef({}); // Store active primitive collections
    const entitiesRef = useRef({});   // Store active entities
    const autoRotateRef = useRef(true);
    const waterStressDataSourceRef = useRef(null);

    // Safe coordinate extractor — handles all layer data shapes
    function extractLatLng(point) {
        if (!point) return null;
        // Standard shape: { lat, lng }
        const lat = point.lat ?? point.latitude ?? point.y ?? null;
        const lng = point.lng ?? point.longitude ?? point.lon ?? point.x ?? null;
        if (lat === null || lng === null) return null;
        if (isNaN(lat) || isNaN(lng)) return null;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
        return { lat: parseFloat(lat), lng: parseFloat(lng) };
    }

    const [width, setWidth] = useState('100%');
    const [selectedCompany, setSelectedCompany] = useState(null);
    const [selectedAlert, setSelectedAlert] = useState(null);
    const [activeLayers, setActiveLayers] = useState(['companies', 'earthquakes', 'floods', 'cyclones', 'volcanoes']);
    const [historyDate, setHistoryDate] = useState(null);
    const [mapMode, setMapMode] = useState('globe');
    const [hoverInfo, setHoverInfo] = useState(null);

    const toggleLayer = (id) => setActiveLayers(prev => prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]);
    const isActive = useCallback((id) => activeLayers.includes(id), [activeLayers]);

    const [satPoints, setSatPoints] = useState([]);
    const [altitude, setAltitude] = useState(2.5 * 6378137); // rough starting cam

    const companies = useCompanies(historyDate);
    const countries = useCountries();
    const newsVelocity = useNewsVelocity();
    const climateTrace = useClimateTrace();
    const agentStatus = useAgentStatus();
    const fires = useFires();
    const gridCarbon = useGridCarbon();
    const airQuality = useAirQuality();
    const earthquakes = useEarthquakes();
    const floods = useFloods();
    const cyclones = useCyclones();
    const volcanoes = useVolcanoes();
    const eonet = useEonet();
    const gdelt = useGdelt();
    const greenwashVelocity = useGreenwashVelocity();
    const gpmImerg = useGpmImerg();
    const sentinel = useSentinel();
    const biodiversity = useBiodiversity();
    const oceanCurrents = useOceanCurrents();
    const waterStress = useWaterStress();
    const forestLoss = useForestLoss();
    const coralBleaching = useCoralBleaching();
    const fishingWatch = useFishingWatch();

    const { alerts: convergenceAlerts } = useConvergenceEngine({
        companies: companies.data || [], fires: fires.data || [], airQuality: airQuality.data || [],
        disasters: [...(earthquakes.data || []), ...(floods.data || []), ...(cyclones.data || []), ...(volcanoes.data || []), ...(eonet.data || [])]
    });

    const auditingCompanies = useMemo(() => (companies?.data || []).filter(d => d.audit_status === 'EXTRACTING'), [companies?.data]);

    const getLayerState = useCallback((id) => {
        const map = {
            companies, countries, newsVelocity, climateTrace, fires, gridCarbon, airQuality,
            earthquakes, floods, cyclones, volcanoes, eonet, gdelt, greenwashVelocity,
            gpm_precipitation: gpmImerg, sentinel_atmosphere: sentinel, biodiversity_index: biodiversity,
            ocean_currents: oceanCurrents, water_stress: waterStress, forest_loss: forestLoss,
            coral_bleaching: coralBleaching, fishing_watch: fishingWatch
        };
        return map[id] || { loading: false, stale: false, error: null, cached_at: null, data: [] };
    }, [companies, countries, newsVelocity, climateTrace, fires, gridCarbon, airQuality, earthquakes, floods, cyclones, volcanoes, eonet, gdelt, greenwashVelocity, gpmImerg, sentinel, biodiversity, oceanCurrents, waterStress, forestLoss, coralBleaching, fishingWatch]);

    useEffect(() => {
        // Full width responsiveness is now handled via CSS (100% width)
    }, []);

    // Satellite worker
    const satWorkerRef = useRef(null);
    useEffect(() => {
        satWorkerRef.current = new Worker('/workers/satellite-propagator.worker.js', { type: 'module' });
        satWorkerRef.current.onmessage = (e) => { if (e.data.type === 'SAT_UPDATE') setSatPoints(e.data.satellites); };
        return () => { if (satWorkerRef.current) satWorkerRef.current.terminate(); };
    }, []);

    useEffect(() => {
        if (!satWorkerRef.current) return;
        if (isActive('satellites')) { satWorkerRef.current.postMessage({ type: 'START' }); } else { satWorkerRef.current.postMessage({ type: 'STOP' }); setSatPoints([]); }
    }, [activeLayers]);

    const syncURL = useCallback(debounce((lat, lng, height, layers) => {
        const params = new URLSearchParams(window.location.search);
        params.set('lat', lat.toFixed(4));
        params.set('lng', lng.toFixed(4));
        params.set('zoom', (height / 6378137).toFixed(2));
        params.set('layers', layers.join(','));
        window.history.replaceState(null, '', `?${params}`);
    }, 500), []);

    // Map point color mappings dynamically from react-globe logic
    const getPointColor = (d) => {
        if (d.type === 'sat') return hexToResourceColor(d.color);
        if (d._isDisaster) {
            if (d.disasterType === 'earthquake') return Cesium.Color.fromCssColorString('#fbbf24');
            if (d.disasterType === 'flood') return Cesium.Color.fromCssColorString('#3b82f6');
            if (d.disasterType === 'cyclone') return Cesium.Color.fromCssColorString('#a855f7');
            if (d.disasterType === 'volcano') return Cesium.Color.fromCssColorString('#f97316');
            if (d.disasterType === 'eonet') return Cesium.Color.fromCssColorString('#f97316');
            return Cesium.Color.fromCssColorString('#ff6600');
        }
        if (d._isAQ) return hexToResourceColor(LAYERS.airQuality.color(d));
        if (d._isGrid) return hexToResourceColor(LAYERS.gridCarbon.color(d));
        if (d._isFire) return Cesium.Color.fromCssColorString('#ef4444');
        if (d._isH3) {
            if (d.has_any_discrepancy) return Cesium.Color.fromCssColorString('rgba(255, 59, 59, 0.8)');
            const g = d.avg_greendex || 50;
            if (g < 25) return Cesium.Color.fromCssColorString('rgba(255, 59, 59, 0.8)');
            if (g < 45) return Cesium.Color.fromCssColorString('rgba(255, 140, 0, 0.8)');
            if (g < 65) return Cesium.Color.fromCssColorString('rgba(255, 215, 0, 0.8)');
            if (g < 80) return Cesium.Color.fromCssColorString('rgba(124, 252, 0, 0.8)');
            return Cesium.Color.fromCssColorString('rgba(0, 250, 154, 0.8)');
        }
        if (!d.scope_total && !d.greendex) return Cesium.Color.fromCssColorString('#888780');
        if (d.has_discrepancy) return Cesium.Color.fromCssColorString('#FF3B3B');
        const g = d.greendex || 50;
        if (g < 25) return Cesium.Color.fromCssColorString('#FF3B3B');
        if (g < 45) return Cesium.Color.fromCssColorString('#FF8C00');
        if (g < 65) return Cesium.Color.fromCssColorString('#FFD700');
        if (g < 80) return Cesium.Color.fromCssColorString('#7CFC00');
        return Cesium.Color.fromCssColorString('#00FA9A');
    };

    const getPointRadius = (d) => {
        if (d.type === 'sat') return 3;
        if (d._isDisaster) {
            if (d.disasterType === 'earthquake') return Math.max(6, (d.mag || 4) * 2.5);
            if (d.disasterType === 'cyclone') return 10;
            if (d.disasterType === 'volcano') return 9;
            if (d.disasterType === 'flood') return 8;
            return 8;
        }
        if (d._isAQ) return 5;
        if (d._isGrid) return 5;
        if (d._isFire) return Math.max(4, (d.frp || 10) / 50);
        if (d._isH3) return 8;
        const total = d.scope_total;
        if (!total || total === 0) return 4;
        return Math.max(4, Math.min(total / 4e9 * 15, 12));
    };

    // Initialize Cesium Viewer
    useEffect(() => {
        const timer = setTimeout(() => {
            if (!cesiumContainer.current) return;
            if (viewerRef.current) return;

            let viewer;
            try {
                // Detect Chrome specifically
                const isChrome = /Chrome/.test(navigator.userAgent) &&
                                 /Google Inc/.test(navigator.vendor);

                viewer = new Cesium.Viewer(cesiumContainer.current, {
                    animation: false,
                    baseLayerPicker: false,
                    fullscreenButton: false,
                    geocoder: false,
                    homeButton: false,
                    infoBox: false,
                    navigationHelpButton: false,
                    sceneModePicker: false,
                    timeline: false,
                    selectionIndicator: false,
                    creditContainer: document.createElement('div'),
                    shouldAnimate: true,
                    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
                    // Chrome needs explicit context options
                    contextOptions: {
                        webgl: {
                            alpha: false,
                            depth: true,
                            stencil: false,
                            antialias: true,
                            powerPreference: 'high-performance',
                            failIfMajorPerformanceCaveat: false
                        }
                    }
                });

                // Globe rendering — safe for all browsers
                const globe = viewer.scene.globe;
                viewer.scene.backgroundColor = Cesium.Color.BLACK;
                globe.enableLighting = false;
                globe.showGroundAtmosphere = true;
                globe.tileCacheSize = 100;
                globe.maximumScreenSpaceError = isChrome ? 8 : 4;
                globe.baseColor = Cesium.Color.fromCssColorString('#1a3a5c');
                viewerRef.current = viewer;

                // Load OSM imagery via requestAnimationFrame (fixes Ctrl+R race condition)
                viewer.scene.requestRender();
                setTimeout(() => { if (!viewer.isDestroyed()) viewer.scene.requestRender(); }, 800);
                requestAnimationFrame(() => {
                    if (viewer.isDestroyed()) return;
                    viewer.imageryLayers.removeAll();
                    viewer.imageryLayers.addImageryProvider(
                        new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' })
                    );
                });

                // Auto rotate logic
                const onPreUpdate = (scene, time) => {
                    if (autoRotateRef.current && viewerRef.current) {
                        viewerRef.current.camera.rotate(Cesium.Cartesian3.UNIT_Z, 0.0005);
                    }
                };
                viewer.scene.preUpdate.addEventListener(onPreUpdate);

                // ─── Cross-browser Pointer Events for Hover & Rotation ───
                const canvas = viewer.scene.canvas;

                const handlePointerEnter = () => { /* let pointermove decide */ };
                const handlePointerLeave = () => {
                    autoRotateRef.current = true;
                    setHoverInfo(null);
                    if (cesiumContainer.current) cesiumContainer.current.style.cursor = '';
                };
                const handlePointerMove = (e) => {
                    const screenPos = new Cesium.Cartesian2(e.offsetX, e.offsetY);
                    // Only interact when pointer is over the actual globe sphere
                    const cartesian = viewer.camera.pickEllipsoid(screenPos);
                    if (!cartesian) {
                        autoRotateRef.current = true;
                        setHoverInfo(null);
                        if (cesiumContainer.current) cesiumContainer.current.style.cursor = '';
                        return;
                    }
                    autoRotateRef.current = false;
                    // scene.pick works correctly with PointPrimitiveCollection
                    const picked = viewer.scene.pick(screenPos);
                    if (Cesium.defined(picked) && picked.id) {
                        setHoverInfo({ x: e.clientX, y: e.clientY, data: picked.id });
                        if (cesiumContainer.current) cesiumContainer.current.style.cursor = 'pointer';
                    } else {
                        setHoverInfo(null);
                        if (cesiumContainer.current) cesiumContainer.current.style.cursor = '';
                    }
                };

                canvas.addEventListener('pointerenter', handlePointerEnter);
                canvas.addEventListener('pointerleave', handlePointerLeave);
                canvas.addEventListener('pointermove', handlePointerMove);

                // Click handler — works for ALL layer types
                const handler = new Cesium.ScreenSpaceEventHandler(canvas);
                handler.setInputAction((movement) => {
                    const pickedObject = viewer.scene.pick(movement.position);
                    if (Cesium.defined(pickedObject) && pickedObject.id) {
                        const d = pickedObject.id;
                        const cam = viewer.camera.positionCartographic;
                        setAltitude(cam.height);

                        if (d.company_name || d.name) {
                            // Company point → open company detail panel
                            setSelectedAlert(null);
                            setSelectedCompany({
                                name: d.company_name || d.name,
                                country: d.country || 'Unknown',
                                sector: d.sector || 'Unknown',
                                scope_total: d.scope_total || 0,
                                greendex: d.greendex || null,
                                esg_grade: d.esg_grade || 'N/A',
                                lat: d.lat, lng: d.lng,
                                has_discrepancy: d.has_discrepancy,
                            });
                            autoRotateRef.current = false;
                            viewer.camera.flyTo({
                                destination: Cesium.Cartesian3.fromDegrees(d.lng, d.lat, 800000),
                                duration: 1.5
                            });
                        } else {
                            // Non-company point → open generic alert panel
                            setSelectedCompany(null);
                            setSelectedAlert(d);
                            autoRotateRef.current = false;
                            const coords = extractLatLng(d);
                            if (coords) {
                                viewer.camera.flyTo({
                                    destination: Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, 500000),
                                    duration: 1.5
                                });
                            }
                        }
                    }
                }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

                viewer.camera.moveEnd.addEventListener(() => {
                    const cam = viewer.camera.positionCartographic;
                    syncURL(Cesium.Math.toDegrees(cam.latitude), Cesium.Math.toDegrees(cam.longitude), cam.height, activeLayers);
                });

                // Set initial position
                const params = new URLSearchParams(window.location.search);
                const lat = parseFloat(params.get('lat') || '22');
                const lng = parseFloat(params.get('lng') || '95');
                const zoom = parseFloat(params.get('zoom') || '2.5');
                viewer.camera.setView({
                    destination: Cesium.Cartesian3.fromDegrees(lng, lat, zoom * 6378137)
                });

            } catch (e) {
                console.error('[Cesium] Init failed:', e.message);
            }
        }, 0);

        return () => {
            clearTimeout(timer);
            if (viewerRef.current && !viewerRef.current.isDestroyed()) {
                viewerRef.current.destroy();
            }
            viewerRef.current = null;
        };
    }, []);

    // ─── Master Sync Effect: Rebuilds point primitives when layers or data change ───
    useEffect(() => {
        if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
        const viewer = viewerRef.current;

        try {
            // Cleanup named primitives
            const removePrimitive = (key) => {
                if (primitivesRef.current[key]) {
                    viewer.scene.primitives.remove(primitivesRef.current[key]);
                    delete primitivesRef.current[key];
                }
            };

            ['mainPoints', 'earthquakePoints', 'firePoints', 'floodPoints', 'cyclonePoints', 'volcanoPoints',
             'aqPoints', 'gridPoints', 'assetPoints', 'bioPoints', 'waterPoints', 'coralPoints', 'satPoints',
             'forestPoints', 'fishingPoints', 'gpmPoints', 'oceanPoints', 'newsPoints'].forEach(removePrimitive);

            // 1. Companies
            if (isActive('companies') && companies.data?.length) {
                const pc = new Cesium.PointPrimitiveCollection();
                const pts = (altitude > 11500000) ? buildH3Clusters(companies.data, 3) : companies.data;
                pts.forEach(d => {
                    const coords = extractLatLng(d);
                    if (!coords) return;
                    pc.add({
                        position: Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, 20000),
                        color: getPointColor(d),
                        pixelSize: getPointRadius(d),
                        scaleByDistance: new Cesium.NearFarScalar(1e4, 2.0, 1e7, 0.5),
                        id: d,
                    });
                });
                viewer.scene.primitives.add(pc);
                primitivesRef.current.mainPoints = pc;
            }

            // 2. Earthquakes
            if (isActive('earthquakes') && earthquakes.data?.length) {
                const pc = new Cesium.PointPrimitiveCollection();
                earthquakes.data.forEach(d => {
                    const coords = extractLatLng(d);
                    if (!coords) return;
                    pc.add({
                        position: Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, 40000),
                        color: Cesium.Color.fromCssColorString('#fbbf24'),
                        pixelSize: Math.max(6, (d.mag || 4) * 2.5),
                        id: { ...d, _isDisaster: true, disasterType: 'earthquake' },
                    });
                });
                viewer.scene.primitives.add(pc);
                primitivesRef.current.earthquakePoints = pc;
            }

            // 3. Fires
            if (isActive('fires') && fires.data?.length) {
                const pc = new Cesium.PointPrimitiveCollection();
                fires.data.forEach(d => {
                    const coords = extractLatLng(d);
                    if (!coords) return;
                    pc.add({
                        position: Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, 35000),
                        color: Cesium.Color.fromCssColorString('#ef4444'),
                        pixelSize: Math.max(3, (d.frp || 10) / 50),
                        id: { ...d, _isFire: true },
                    });
                });
                viewer.scene.primitives.add(pc);
                primitivesRef.current.firePoints = pc;
            }

            // 4. Floods
            if (isActive('floods') && floods.data?.length) {
                const pc = new Cesium.PointPrimitiveCollection();
                floods.data.forEach(d => {
                    const coords = extractLatLng(d);
                    if (!coords) return;
                    pc.add({
                        position: Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, 40000),
                        color: Cesium.Color.fromCssColorString('#3b82f6'),
                        pixelSize: 10,
                        id: { ...d, _isDisaster: true, disasterType: 'flood' },
                    });
                });
                viewer.scene.primitives.add(pc);
                primitivesRef.current.floodPoints = pc;
            }

            // 5. Cyclones
            if (isActive('cyclones') && cyclones.data?.length) {
                const pc = new Cesium.PointPrimitiveCollection();
                cyclones.data.forEach(d => {
                    const coords = extractLatLng(d);
                    if (!coords) return;
                    pc.add({
                        position: Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, 45000),
                        color: Cesium.Color.fromCssColorString('#a855f7'),
                        pixelSize: 12,
                        id: { ...d, _isDisaster: true, disasterType: 'cyclone' },
                    });
                });
                viewer.scene.primitives.add(pc);
                primitivesRef.current.cyclonePoints = pc;
            }

            // 6. Volcanoes
            if (isActive('volcanoes') && volcanoes.data?.length) {
                const pc = new Cesium.PointPrimitiveCollection();
                volcanoes.data.forEach(d => {
                    const coords = extractLatLng(d);
                    if (!coords) return;
                    pc.add({
                        position: Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, 40000),
                        color: Cesium.Color.fromCssColorString('#f97316'),
                        pixelSize: 9,
                        id: { ...d, _isDisaster: true, disasterType: 'volcano' },
                    });
                });
                viewer.scene.primitives.add(pc);
                primitivesRef.current.volcanoPoints = pc;
            }

            // 7. Air Quality
            if (isActive('airQuality') && airQuality.data?.length) {
                const pc = new Cesium.PointPrimitiveCollection();
                airQuality.data.forEach(d => {
                    const coords = extractLatLng(d);
                    if (!coords || d.avg_pm25 == null) return;
                    const pm = d.avg_pm25;
                    const color = pm > 55 ? '#7E0023' : pm > 35 ? '#ef4444' : pm > 15 ? '#f97316' : '#22c55e';
                    pc.add({
                        position: Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, 15000),
                        color: Cesium.Color.fromCssColorString(color),
                        pixelSize: 8,
                        id: { ...d, _isAQ: true },
                    });
                });
                viewer.scene.primitives.add(pc);
                primitivesRef.current.aqPoints = pc;
            }

            // 8. Grid Carbon
            if (isActive('gridCarbon') && gridCarbon.data?.length) {
                const pc = new Cesium.PointPrimitiveCollection();
                gridCarbon.data.forEach(d => {
                    const coords = extractLatLng(d);
                    if (!coords) return;
                    const ci = d.carbon_intensity || 0;
                    const color = ci > 600 ? '#ef4444' : ci > 400 ? '#f97316' : ci > 200 ? '#fbbf24' : '#22c55e';
                    pc.add({
                        position: Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, 25000),
                        color: Cesium.Color.fromCssColorString(color),
                        pixelSize: 12,
                        id: { ...d, _isGrid: true },
                    });
                });
                viewer.scene.primitives.add(pc);
                primitivesRef.current.gridPoints = pc;
            }

            // 9. Climate TRACE
            if (isActive('climateTrace') && climateTrace.data?.length) {
                const pc = new Cesium.PointPrimitiveCollection();
                climateTrace.data.forEach(d => {
                    const coords = extractLatLng(d);
                    if (!coords) return;
                    const t = d.asset_type || '';
                    const color = t.includes('power') ? '#FF6B35' : t.includes('steel') ? '#888780' : t.includes('oil') ? '#ef4444' : '#378ADD';
                    pc.add({
                        position: Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, 30000),
                        color: Cesium.Color.fromCssColorString(color),
                        pixelSize: Math.max(5, Math.min((d.co2e_mt || 0) / 5e6, 20)),
                        id: { ...d, _isAsset: true },
                    });
                });
                viewer.scene.primitives.add(pc);
                primitivesRef.current.assetPoints = pc;
            }

            // 10. Biodiversity
            if (isActive('biodiversity_index') && biodiversity.data?.length) {
                const pc = new Cesium.PointPrimitiveCollection();
                biodiversity.data.forEach(d => {
                    const coords = extractLatLng(d);
                    if (!coords || d.threat_rate === undefined) return;
                    const color = d.threat_rate > 0.2 ? '#ef4444' : '#22c55e';
                    pc.add({
                        position: Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, 10000),
                        color: Cesium.Color.fromCssColorString(color),
                        pixelSize: 5,
                        id: { ...d, _type: 'biodiversity' },
                    });
                });
                viewer.scene.primitives.add(pc);
                primitivesRef.current.bioPoints = pc;
            }

            // 11. Water Stress — toggle visibility on dedicated DataSource
            if (waterStressDataSourceRef.current) {
                waterStressDataSourceRef.current.show = isActive('water_stress');
            }

            // 12. Coral Bleaching
            if (isActive('coral_bleaching') && coralBleaching.data?.length) {
                const pc = new Cesium.PointPrimitiveCollection();
                coralBleaching.data.forEach(d => {
                    const coords = extractLatLng(d);
                    if (!coords) return;
                    const color = d.alert_level === 'Alert2' ? '#7f1d1d' : d.alert_level === 'Alert1' ? '#ef4444' : d.alert_level === 'Warning' ? '#f97316' : '#fbbf24';
                    pc.add({
                        position: Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, 10000),
                        color: Cesium.Color.fromCssColorString(color),
                        pixelSize: 10,
                        id: { ...d, _isCoral: true },
                    });
                });
                viewer.scene.primitives.add(pc);
                primitivesRef.current.coralPoints = pc;
            }

            // 13. Satellites
            if (isActive('satellites') && satPoints?.length) {
                const pc = new Cesium.PointPrimitiveCollection();
                satPoints.forEach(d => {
                    const coords = extractLatLng(d);
                    if (!coords) return;
                    pc.add({
                        position: Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, (d.alt || 400) * 1000),
                        color: Cesium.Color.fromCssColorString(d.color || '#60a5fa'),
                        pixelSize: 4,
                        id: { ...d, type: 'sat' },
                    });
                });
                viewer.scene.primitives.add(pc);
                primitivesRef.current.satPoints = pc;
            }

            // 14. Precipitation (GPM)
            if (isActive('gpm_precipitation') && gpmImerg.data?.length) {
                const pc = new Cesium.PointPrimitiveCollection();
                gpmImerg.data.forEach(d => {
                    const coords = extractLatLng(d);
                    if (!coords) return;
                    const color = d.intensity === 'HEAVY' ? '#ef4444' : d.intensity === 'MODERATE' ? '#f97316' : '#3b82f6';
                    pc.add({
                        position: Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, 12000),
                        color: Cesium.Color.fromCssColorString(color),
                        pixelSize: 6,
                        id: { ...d, _type: 'gpm' },
                    });
                });
                viewer.scene.primitives.add(pc);
                primitivesRef.current.gpmPoints = pc;
            }

            // 15. Ocean Currents
            if (isActive('ocean_currents') && oceanCurrents.data?.length) {
                const pc = new Cesium.PointPrimitiveCollection();
                oceanCurrents.data.forEach(d => {
                    const coords = extractLatLng(d);
                    if (!coords || d.speed === null || d.speed < 0.1) return; // filter dead zones
                    const color = d.speed > 0.5
                        ? Cesium.Color.CYAN.withAlpha(0.6)
                        : Cesium.Color.fromCssColorString('#0ea5e9').withAlpha(0.4);
                    pc.add({
                        position: Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, 10000),
                        color,
                        pixelSize: 6,
                        id: { ...d, _type: 'ocean_currents' },
                    });
                });
                viewer.scene.primitives.add(pc);
                primitivesRef.current.oceanPoints = pc;
            }

            // 16. ESG News Velocity
            if ((isActive('newsVelocity') && newsVelocity.data?.length) || (isActive('greenwashVelocity') && greenwashVelocity.data?.length)) {
                const pc = new Cesium.PointPrimitiveCollection();
                const data = [...(newsVelocity.data || []), ...(greenwashVelocity.data || [])];
                data.forEach(d => {
                    const coords = extractLatLng(d);
                    if (!coords) return;
                    pc.add({
                        position: Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, 20000),
                        color: Cesium.Color.fromCssColorString('#facc15'),
                        pixelSize: 5,
                        id: { ...d, _type: 'news' },
                    });
                });
                viewer.scene.primitives.add(pc);
                primitivesRef.current.newsPoints = pc;
            }

            // 17. Forest Loss
            if (isActive('forest_loss') && forestLoss.data?.length) {
                const pc = new Cesium.PointPrimitiveCollection();
                forestLoss.data.forEach(d => {
                    const coords = extractLatLng(d);
                    if (!coords) return;
                    pc.add({
                        position: Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, 15000),
                        color: Cesium.Color.fromCssColorString('#22c55e'),
                        pixelSize: 6,
                        id: { ...d, _type: 'forest_loss' },
                    });
                });
                viewer.scene.primitives.add(pc);
                primitivesRef.current.forestPoints = pc;
            }

            // 18. Fishing Watch
            if (isActive('fishing_watch') && fishingWatch.data?.length) {
                const pc = new Cesium.PointPrimitiveCollection();
                fishingWatch.data.forEach(d => {
                    const coords = extractLatLng(d);
                    if (!coords) return;
                    pc.add({
                        position: Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, 5000),
                        color: Cesium.Color.fromCssColorString('#a855f7'),
                        pixelSize: 6,
                        id: { ...d, _type: 'fishing_watch' },
                    });
                });
                viewer.scene.primitives.add(pc);
                primitivesRef.current.fishingPoints = pc;
            }

        } catch (err) {
            console.error('[GlobeTab] Layer sync error:', err);
        }

    }, [
        activeLayers, altitude, satPoints,
        companies.data, earthquakes.data, fires.data, floods.data, cyclones.data, volcanoes.data,
        airQuality.data, gridCarbon.data, climateTrace.data, biodiversity.data, waterStress.data, coralBleaching.data,
        gpmImerg.data, oceanCurrents.data, newsVelocity.data, greenwashVelocity.data, forestLoss.data, fishingWatch.data
    ]);

    // ─── Water Stress: Basin ellipse entities (dedicated DataSource) ───
    useEffect(() => {
        if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
        const viewer = viewerRef.current;

        const initWaterStress = async () => {
            try {
                const res = await fetch('http://localhost:5000/api/water-stress');
                const json = await res.json();
                const basins = json.data;
                if (!basins || basins.length === 0) {
                    console.warn('[water_stress] No basin data found');
                    return;
                }

                const ds = new Cesium.CustomDataSource('water_stress');

                basins.forEach(b => {
                    if (b.lat == null || b.lng == null) return;

                    let color;
                    const cat = b.category || 1;
                    if (cat >= 4) color = Cesium.Color.RED.withAlpha(0.45);
                    else if (cat >= 3) color = Cesium.Color.ORANGE.withAlpha(0.4);
                    else if (cat >= 2) color = Cesium.Color.YELLOW.withAlpha(0.35);
                    else color = Cesium.Color.GREEN.withAlpha(0.3);

                    ds.entities.add({
                        position: Cesium.Cartesian3.fromDegrees(b.lng, b.lat),
                        ellipse: {
                            semiMajorAxis: 200000,
                            semiMinorAxis: 200000,
                            material: color,
                            outline: true,
                            outlineColor: Cesium.Color.BLACK.withAlpha(0.3),
                            outlineWidth: 1,
                            height: 0,
                        },
                        properties: {
                            _type: 'water_stress',
                            basin_name: b.basin_name,
                            stress_score: b.stress_score,
                            stress_label: b.stress_label,
                        },
                    });
                });

                waterStressDataSourceRef.current = ds;
                await viewer.dataSources.add(ds);
                ds.show = activeLayers.includes('water_stress');
                console.log('[water_stress] Loaded', basins.length, 'basin regions');
            } catch (err) {
                console.error('[water_stress] Failed to load:', err.message);
            }
        };

        initWaterStress();

        return () => {
            if (viewerRef.current && !viewerRef.current.isDestroyed() && waterStressDataSourceRef.current) {
                viewerRef.current.dataSources.remove(waterStressDataSourceRef.current);
                waterStressDataSourceRef.current = null;
            }
        };
    }, [viewerRef.current]);

    // ─── NASA GIBS Layer Toggle (Fix 3) ───
    const handleGibsToggle = (viewer, isOn) => {
        // Remove existing GIBS layer if present
        if (viewerRef.current?._gibsLayer) {
            viewer.imageryLayers.remove(viewerRef.current._gibsLayer, false);
            viewerRef.current._gibsLayer = null;
        }
        if (!isOn) return;

        const d = new Date();
        d.setDate(d.getDate() - 2);
        const dateStr = d.toISOString().split('T')[0];

        try {
            const gibsLayer = viewer.imageryLayers.addImageryProvider(
                new Cesium.WebMapTileServiceImageryProvider({
                    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/' +
                         'MODIS_Terra_CorrectedReflectance_TrueColor/default/' +
                         dateStr + '/GoogleMapsCompatible_Level9/' +
                         '{TileMatrix}/{TileRow}/{TileCol}.jpg',
                    layer: 'MODIS_Terra_CorrectedReflectance_TrueColor',
                    style: 'default',
                    format: 'image/jpeg',
                    tileMatrixSetID: 'GoogleMapsCompatible_Level9',
                    tileWidth: 256,
                    tileHeight: 256,
                    maximumLevel: 9,
                })
            );
            viewerRef.current._gibsLayer = gibsLayer;
        } catch (e) {
            console.warn('[GIBS] Layer failed:', e.message);
        }
    };

    useEffect(() => {
        if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
        handleGibsToggle(viewerRef.current, activeLayers.includes('nasa_gibs'));
    }, [activeLayers]);

    // Tooltip Renderer (React Overlay)
    const renderTooltipContent = (d) => {
        if (!d) return null;
        if (d._isDisaster) {
            return (
                <>
                    <strong>{d.type === 'earthquake' ? '🌋 Earthquake' : d.disasterType === 'flood' ? '🌊 Flood' : d.disasterType === 'cyclone' ? '🌀 Cyclone' : d.disasterType === 'volcano' ? '🌋 Volcano' : '⚠️ Disaster'}</strong><br />
                    {d.title || d.place || d.name}<br />
                    {d.mag && <>Magnitude: <strong>{d.mag}</strong><br /></>}
                    {d.severity && <>Severity: <strong>{d.severity}</strong><br /></>}
                    Source: {d.source}
                </>
            );
        }
        if (d.type === 'sat') return (
            <><strong>🛰️ {d.name}</strong><br />Altitude: <strong>{d.alt?.toFixed(0) || 0} km</strong><br />Type: {d.category}</>
        );
        if (d._isAQ) return (
            <><strong>🏭 {d.name} Air Quality</strong><br />PM2.5 Avg: <strong>{d.avg_pm25} µg/m³</strong><br />{d.exceeds_who ? '⚠ Exceeds WHO limit' : '✅ Within WHO limits'}<br />Sensors active: {d.sensor_count}</>
        );
        if (d._isGrid) return (
            <><strong>⚡ {d.name}</strong><br />Carbon Intensity: <strong>{d.carbon_intensity} gCO₂eq/kWh</strong><br />Fossil Free: {d.fossil_free_pct}%<br />Renewable: {d.renewable_pct}%</>
        );
        if (d._isFire) return (
            <><strong>🔥 Active Fire</strong><br />Brightness: {d.brightness}K<br />Power: {d.frp} MW<br />Confidence: {d.confidence}<br />Acquired: {d.acq_date}</>
        );
        if (d._isH3) return (
            <><strong>{d.count} companies</strong><br />Avg Greendex: {d.avg_greendex?.toFixed(1) ?? 'N/A'}<br />Total emissions: {(d.total_scope / 1e6).toFixed(2)}Mt CO₂<br />{d.has_any_discrepancy ? '⚠ Discrepancies in this cluster' : ''}<br /><em>Zoom in to see individual companies</em></>
        );
        if (d._type === 'news') return <><strong>{d.company_name}</strong><br />{d.velocity} ESG mentions today<br />{d.latest_headline || ''}</>;
        if (d._type === 'proximity_alert') return <><strong>🚨 PROXIMITY ALERT</strong><br />{d.company_name}<br />Severity: {d.severity}</>;
        if (d._type === 'gvi') return <><strong>{d.company_id}</strong><br />GVI Score: {d.gvi}<br />Articles: {d.article_count}<br /><em>"{d.latest_headline || ''}"</em></>;
        if (d.country && typeof d.disclosure_rate !== 'undefined') return (
            <><strong>{d.country}</strong><br />Avg Greendex: {d.avg_greendex?.toFixed(1) ?? 'N/A'}<br />{d.company_count} companies tracked<br />Disclosure rate: {((d.disclosure_rate || 0) * 100).toFixed(0)}%</>
        );
        if (d._type === 'gpm') return <><strong>🌧️ NASA GPM IMERG</strong><br />Precipitation: <strong>{d.precipitation_mm} mm</strong><br />Intensity: {d.intensity}</>;
        if (d._type === 'sentinel') return <><strong>🌍 ESA Sentinel-5P</strong><br />NO₂: {d.no2?.toExponential(2)} {d.unit}<br />CH₄: {d.ch4?.toFixed(0)} ppb<br />CO: {d.co?.toFixed(3)} {d.unit}</>;
        if (d._type === 'biodiversity') return <><strong>{d.zone_name}</strong><br />Species logged (GBIF): {d.species_count}<br />Threatened (IUCN): {d.threatened_count}<br />CR: {d.iucn_categories?.CR} · EN: {d.iucn_categories?.EN} · VU: {d.iucn_categories?.VU}</>;
        if (d._type === 'ocean_currents') return <><strong>🌊 Ocean Current</strong><br />Speed: {d.speed_ms?.toFixed(2)} m/s<br />Direction: {d.direction_deg}°</>;
        if (d._type === 'water_stress') return <><strong>💧 {d.basin_name}</strong><br />Water Stress Score: {d.stress_score?.toFixed(1)}/5<br />Risk Level: {d.stress_label}</>;
        if (d._type === 'forest_loss') return <><strong>🌳 Deforestation Alert</strong><br />Area Loss: {d.area_ha?.toFixed(1)} ha<br />Confidence: {d.confidence}<br />Detected: {new Date(d.alert_date).toLocaleDateString()}</>;
        if (d._type === 'coral_bleaching') return <><strong>🪸 Coral Reef: {d.region_name}</strong><br />Status: <strong>{d.alert_level}</strong><br />DHW: {d.dhw?.toFixed(1)}<br />Bleaching Risk: {d.bleaching_risk}</>;
        if (d._type === 'fishing_watch') return <><strong>⚓ Vessel: {d.vessel_id}</strong><br />Flag: {d.flag_country}<br />Fishing Hours: {d.fishing_hours?.toFixed(1)}h<br />{d.is_suspected_illegal ? <span style={{ color: '#a855f7', fontWeight: 'bold' }}>⚠ Suspected Illegal (Dark Fleet / IUU)</span> : '✅ Compliant'}</>;
        // Default Company Toolkit
        return (
            <>
                <strong>{d.name || d.company_name}</strong><br />
                {d.country} · {d.sector}<br />
                Greendex: <span>{d.greendex ?? 'N/A'}</span><br />
                Scope 1+2: {d.scope_total ? (d.scope_total / 1e6).toFixed(2) + 'Mt' : 'Not disclosed'}<br />
                {d.has_discrepancy && <>⚠ Math discrepancy detected<br /></>}
                {d.absence_signals_count > 0 && <>{d.absence_signals_count} disclosure gaps</>}
            </>
        );
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
            <div className="globe-live-header">
                <div className="globe-live-header__dot" />
                <span>LIVE</span><span style={{ opacity: 0.6 }}>·</span>
                <span>{agentStatus?.active_agents || 0} agents active</span><span style={{ opacity: 0.6 }}>·</span>
                <span>{agentStatus?.audits_in_progress || 0} audits</span><span style={{ opacity: 0.6 }}>·</span>
                <span>{agentStatus?.total_companies || 0} companies</span>
                {convergenceAlerts.length > 0 && <><span style={{ opacity: 0.6 }}>·</span><span style={{ color: '#FF3B3B', fontWeight: 600 }}>{convergenceAlerts.length} ⚠ evidence contradictions</span></>}
            </div>

            <div
                ref={cesiumContainer}
                style={{
                    width: '100%',
                    height: '100vh',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                }}
            />

            {/* 2D/3D MODE TOGGLE (Fix 6) */}
            <div style={{ position:'absolute', top:70, right:16, zIndex:9999, display:'flex', gap:8 }}>
                {['globe','map'].map(mode => (
                    <button
                        key={mode}
                        onClick={() => setMapMode(mode)}
                        style={{
                            padding:'6px 14px', borderRadius:20, cursor:'pointer',
                            fontSize:12, fontWeight:600, fontFamily:'var(--mono)',
                            border:'1px solid var(--bd)',
                            background: mapMode === mode ? 'var(--jade)' : 'var(--sf)',
                            color: mapMode === mode ? '#fff' : 'var(--tx2)',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            transition:'all .2s',
                        }}
                    >
                        {mode === 'globe' ? '🌍 3D' : '🗺️ 2D'}
                    </button>
                ))}
            </div>

            {/* REACT HTML TOOLTIP FOR CESIUM (Fix 5) */}
            {hoverInfo && (
                <div style={{
                    position: 'absolute', // Absolute relative to GlobeTab container
                    left: hoverInfo.x + 12,
                    top: hoverInfo.y - 20,
                    zIndex: 10000,
                    background: 'rgba(0,0,0,0.95)',
                    border: '1px solid var(--bd)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    pointerEvents: 'none',
                    minWidth: 160,
                    maxWidth: 240,
                    fontSize: 12,
                    color: '#fff',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                }}>
                    {renderTooltipContent(hoverInfo.data)}
                </div>
            )}

            {mapMode === 'map' && (
                <div style={{
                    position:'absolute', inset:0, background:'#000', zIndex:5,
                    display:'flex', alignItems:'center', justifyContent:'center', color:'var(--tx3)'
                }}>
                    2D Map view — coming in next sprint
                </div>
            )}

            {/* ── LAYER PANEL (left) ── */}
            <div className="globe-layer-panel">
                <div className="globe-layer-panel__header">
                    <span>Layers</span>
                    <Rw style={{ gap:4 }}>
                        {['globe','map'].map(mode => (
                            <button key={mode} onClick={() => setMapMode(mode)} style={{ background: mapMode === mode ? 'var(--jade)' : 'var(--bg2)', color: mapMode === mode ? '#fff' : 'var(--tx3)', border:'1px solid var(--bd)', borderRadius:6, fontSize:10, fontWeight:700, cursor:'pointer', padding:'3px 6px', transition:'all .2s' }}>
                                {mode.toUpperCase()}
                            </button>
                        ))}
                    </Rw>
                </div>
                {LAYER_IDS.map(id => {
                    const st = getLayerState(id);
                    const isNasa = id === 'nasa_gibs';
                    return (
                        <button key={id} className={`globe-layer-pill ${isActive(id) ? 'active' : ''}`} onClick={() => toggleLayer(id)}>
                            <span className="globe-layer-pill__dot" style={{ background: isNasa ? '#3b82f6' : (LAYERS[id]?.color && typeof LAYERS[id].color === 'function') ? LAYERS[id].color({ greendex: 60, asset_type: 'power-plant', velocity: 5 }) : '#6b7280' }} />
                            {LAYERS[id]?.label || id}
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
                        <button className="globe-detail-panel__close" onClick={() => { setSelectedCompany(null); autoRotateRef.current = true; }}>✕</button>
                        <div className="globe-detail-panel__name">{selectedCompany.name}</div>
                        <div className="globe-detail-panel__meta">
                            <Bdg color="blu">{selectedCompany.country}</Bdg>
                            <Bdg color="amb">{selectedCompany.sector}</Bdg>
                            {selectedCompany.esg_grade && selectedCompany.esg_grade !== 'N/A' && <Bdg color="jade">ESG {selectedCompany.esg_grade}</Bdg>}
                        </div>
                        {selectedCompany.greendex != null && (
                            <div className="globe-detail-panel__greendex">
                                <div className="globe-detail-panel__greendex-score" style={{ color: LAYERS.companies.color(selectedCompany) }}>{selectedCompany.greendex}</div>
                                <M size={10} color="var(--tx3)">Greendex Score</M>
                            </div>
                        )}
                        {selectedCompany.has_discrepancy && <div className="globe-detail-panel__warning">⚠ Math discrepancy detected</div>}
                        <M size={10} color="var(--tx3)" style={{ display: 'block', marginBottom: 8, letterSpacing: '.05em', textTransform: 'uppercase' }}>Emissions Breakdown</M>
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
                                        <div className="globe-detail-panel__scope-bar" style={{ width: `${Math.min((s.value / maxVal) * 100, 100)}%`, background: s.color }} />
                                    </div>
                                    <M size={10} mono color="var(--tx2)" style={{ width: 60, textAlign: 'right' }}>{s.value > 0 ? (s.value / 1e6).toFixed(2) + 'Mt' : '—'}</M>
                                </div>
                            );
                        })}
                        {['steel','aluminium','metals','cement'].includes((selectedCompany.sector || '').toLowerCase()) && (
                            <div style={{ background:'rgba(239,68,68,0.1)', 
                                          border:'1px solid #ef4444',
                                          borderRadius:8, padding:12, marginTop:12 }}>
                                <div style={{ color:'#ef4444', fontWeight:700, fontSize:12 }}>
                                    ⚠ EU CBAM EXPOSURE RISK
                                </div>
                                <div style={{ fontSize:11, color:'var(--tx2)', marginTop:4 }}>
                                    Estimated CBAM tariff: ~€62/tonne of exports to EU.
                                    Without verified ESG data: up to €250–300/tonne.
                                </div>
                                <div style={{ fontSize:10, color:'var(--tx3)', marginTop:4 }}>
                                    Effective January 2026 · EU ETS price: ~€85/tonne
                                </div>
                            </div>
                        )}
                        <button className="globe-detail-panel__action" onClick={() => window.dispatchEvent(new CustomEvent('greenorb:navigate', { detail: { tab: 'audit', company: selectedCompany.name } }))}>Open full audit →</button>
                    </>
                )}
            </div>

            {/* ── GENERIC ALERT DETAIL PANEL (non-company data points) ── */}
            <div className={`globe-detail-panel ${selectedAlert ? 'open' : ''}`}>
                {selectedAlert && (
                    <>
                        <button className="globe-detail-panel__close" onClick={() => { setSelectedAlert(null); autoRotateRef.current = true; }}>✕</button>
                        <div className="globe-detail-panel__name">
                            {selectedAlert.title || selectedAlert.basin_name || selectedAlert.city || selectedAlert.location || selectedAlert._type || 'Data Point'}
                        </div>
                        <div style={{ padding: '8px 0', fontSize: 12, color: 'var(--tx2)' }}>
                            {renderTooltipContent(selectedAlert)}
                        </div>
                        {extractLatLng(selectedAlert) && (
                            <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 8 }}>
                                📍 {extractLatLng(selectedAlert).lat.toFixed(3)}°, {extractLatLng(selectedAlert).lng.toFixed(3)}°
                            </div>
                        )}
                    </>
                )}
            </div>

            <div style={{ position: 'absolute', bottom: 110, left: '50%', transform: 'translateX(-50%)', zIndex: 100 }}>
                <TimelineScrubber onDateChange={setHistoryDate} onLive={() => setHistoryDate(null)} />
            </div>

            <div className="globe-source-bar">
                {[{ label: 'Oceans', state: oceanCurrents }, { label: 'Water', state: waterStress }, { label: 'Forests', state: forestLoss }, { label: 'Corals', state: coralBleaching }, { label: 'Fishing', state: fishingWatch }].map(src => (
                    <div key={src.label} className="globe-source-bar__item">
                        <div className={`globe-source-bar__dot ${src.state.error ? 'globe-source-bar__dot--error' : src.state.stale ? 'globe-source-bar__dot--stale' : 'globe-source-bar__dot--fresh'}`} />
                        <span>{src.label} ({timeAgo(src.state.cached_at)})</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
