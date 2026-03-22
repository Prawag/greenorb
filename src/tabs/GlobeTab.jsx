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
        if(!parts) return Cesium.Color.GRAY;
        return new Cesium.Color(parts[0]/255, parts[1]/255, parts[2]/255, parts[3]);
    }
    return Cesium.Color.fromCssColorString(hex);
}

export default function GlobeTab() {
    const cesiumContainer = useRef(null);
    const viewerRef = useRef(null);
    const primitivesRef = useRef({}); // Store active primitive collections
    const entitiesRef = useRef({});   // Store active entities

    const [width, setWidth] = useState(window.innerWidth > 1100 ? 1100 : window.innerWidth);
    const [selectedCompany, setSelectedCompany] = useState(null);
    const [selectedAlert, setSelectedAlert] = useState(null);
    const [hoverInfo, setHoverInfo] = useState(null);
    const autoRotateRef = useRef(true);

    const [activeLayers, setActiveLayers] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        const layersParam = params.get('layers');
        return layersParam ? layersParam.split(',').filter(l => LAYER_IDS.includes(l)) : [...DEFAULT_ON];
    });
    const toggleLayer = (id) => setActiveLayers(prev => prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]);
    const isActive = useCallback((id) => activeLayers.includes(id), [activeLayers]);

    const [historyDate, setHistoryDate] = useState(null);
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
        disasters: [ ...(earthquakes.data || []), ...(floods.data || []), ...(cyclones.data || []), ...(volcanoes.data || []), ...(eonet.data || []) ]
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
        const handleResize = () => setWidth(window.innerWidth > 1100 ? 1100 : window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
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
            if (d.disasterType === 'earthquake') return hexToResourceColor('#fbbf24');
            if (d.disasterType === 'flood')      return hexToResourceColor('#3b82f6');
            if (d.disasterType === 'cyclone')    return hexToResourceColor('#a855f7');
            if (d.disasterType === 'volcano')    return hexToResourceColor('#ef4444');
            if (d.disasterType === 'eonet')      return hexToResourceColor('#f97316');
            return hexToResourceColor('#ff6600');
        }
        if (d._isAQ) return hexToResourceColor(LAYERS.airQuality.color(d));
        if (d._isGrid) return hexToResourceColor(LAYERS.gridCarbon.color(d));
        if (d._isFire) return hexToResourceColor(LAYERS.fires.color(d));
        if (d._isH3) {
            if (d.has_any_discrepancy) return hexToResourceColor('rgba(255, 59, 59, 0.8)');
            const g = d.avg_greendex || 50;
            if (g < 25) return hexToResourceColor('rgba(255, 59, 59, 0.8)');
            if (g < 45) return hexToResourceColor('rgba(255, 140, 0, 0.8)');
            if (g < 65) return hexToResourceColor('rgba(255, 215, 0, 0.8)');
            if (g < 80) return hexToResourceColor('rgba(124, 252, 0, 0.8)');
            return hexToResourceColor('rgba(0, 250, 154, 0.8)');
        }
        if (!d.scope_total && !d.greendex) return hexToResourceColor('#888780');
        if (d.has_discrepancy) return hexToResourceColor('#FF3B3B');
        const g = d.greendex || 50;
        if (g < 25) return hexToResourceColor('#FF3B3B');
        if (g < 45) return hexToResourceColor('#FF8C00');
        if (g < 65) return hexToResourceColor('#FFD700');
        if (g < 80) return hexToResourceColor('#7CFC00');
        return hexToResourceColor('#00FA9A');
    };

    const getPointRadius = (d) => {
        if (d.type === 'sat') return 3;
        if (d._isDisaster) {
            if (d.disasterType === 'earthquake') return Math.max(5, (d.mag || 4) * 2);
            if (d.disasterType === 'cyclone') return 12;
            if (d.disasterType === 'volcano') return 10;
            return 8;
        }
        if (d._isAQ) return 5;
        if (d._isGrid) return 5;
        if (d._isFire) return 4;
        if (d._isH3) return 8;
        const total = d.scope_total;
        if (!total || total === 0) return 4;
        return Math.max(4, Math.min(total / 4e9 * 15, 12));
    };

    // Initialize Cesium Viewer
    useEffect(() => {
        if (!cesiumContainer.current) return;
        
        Cesium.Ion.defaultAccessToken = ''; // We use public NASA/Copernicus layers

        const viewer = new Cesium.Viewer(cesiumContainer.current, {
            animation: false,
            timeline: false,
            geocoder: false,
            homeButton: false,
            sceneModePicker: false,
            navigationHelpButton: false,
            baseLayerPicker: false,
            infoBox: false,
            selectionIndicator: false,
            fullscreenButton: false,
            imageryProvider: new Cesium.SingleTileImageryProvider({
                url: 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'
            }),
            contextOptions: { webgl: { alpha: true } },
        });

        viewer.scene.globe.enableLighting = true;
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0B0D15');
        viewer.scene.globe.baseColor = Cesium.Color.BLACK;

        // Auto rotate logic
        const onPreUpdate = (scene, time) => {
            if (autoRotateRef.current) {
                viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, 0.0005);
            }
        };
        viewer.scene.preUpdate.addEventListener(onPreUpdate);

        // Tooltip handler
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((movement) => {
            const pickedObject = viewer.scene.pick(movement.endPosition);
            if (Cesium.defined(pickedObject) && pickedObject.id) {
                setHoverInfo({ x: movement.endPosition.x, y: movement.endPosition.y, data: pickedObject.id });
                document.body.style.cursor = 'pointer';
            } else {
                setHoverInfo(null);
                document.body.style.cursor = 'default';
            }
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

        // Click handler
        handler.setInputAction((movement) => {
            const pickedObject = viewer.scene.pick(movement.position);
            if (Cesium.defined(pickedObject) && pickedObject.id) {
                const d = pickedObject.id;
                
                // Track height changes for dynamic clustering
                const cam = viewer.camera.positionCartographic;
                setAltitude(cam.height);

                if (d.company_name || d.name) {
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

        viewerRef.current = viewer;

        return () => {
            viewer.scene.preUpdate.removeEventListener(onPreUpdate);
            handler.destroy();
            viewer.destroy();
        };
    }, []);

    // Update activeLayers in syncURL closure by recreating simple effect when activeLayers changes
    useEffect(() => {
        if (!viewerRef.current) return;
        autoRotateRef.current = true; // reset autorotate naturally over time maybe? Let user control it
    }, [activeLayers]);

    // Data Syncing into Cesium Primitives
    const updatePoints = (layerId, dataArray, isVisible, mapPropsFn) => {
        if (!viewerRef.current) return;
        const scene = viewerRef.current.scene;

        // Cleanup existing
        if (primitivesRef.current[layerId]) {
            scene.primitives.remove(primitivesRef.current[layerId]);
            delete primitivesRef.current[layerId];
        }

        if (isVisible && dataArray && dataArray.length > 0) {
            const collection = new Cesium.PointPrimitiveCollection();
            dataArray.forEach(d => {
                const mapped = mapPropsFn(d);
                collection.add({
                    position: Cesium.Cartesian3.fromDegrees(d.lng, d.lat, mapped.altitude || 10000),
                    color: mapped.color,
                    pixelSize: mapped.size,
                    id: d // attach original data for picking
                });
            });
            scene.primitives.add(collection);
            primitivesRef.current[layerId] = collection;
        }
    };

    const updateEntities = (layerId, dataArray, isVisible, entityBuilderFn) => {
        if (!viewerRef.current) return;
        const entities = viewerRef.current.entities;

        // Cleanup existing
        if (entitiesRef.current[layerId]) {
            entitiesRef.current[layerId].forEach(e => entities.remove(e));
        }
        entitiesRef.current[layerId] = [];

        if (isVisible && dataArray && dataArray.length > 0) {
            dataArray.forEach(d => {
                const entity = entityBuilderFn(d);
                if (entity) entitiesRef.current[layerId].push(entities.add(entity));
            });
        }
    };

    // Companies & Clusters
    useEffect(() => {
        let pts = [];
        if (companies.data) {
            if (altitude > 11500000) pts = buildH3Clusters(companies.data, 3);
            else pts = companies.data;
        }
        updatePoints('companies', pts, isActive('companies'), d => ({
            color: getPointColor(d), size: getPointRadius(d), altitude: 20000
        }));
    }, [companies.data, activeLayers, altitude]);

    // Disasters & other data sources
    useEffect(() => {
        updatePoints('fires', (fires.data || []).map(f => ({...f, _isFire: true})), isActive('fires'), d => ({ color: getPointColor(d), size: getPointRadius(d), altitude: 10000 }));
        updatePoints('earthquakes', (earthquakes.data || []).map(d => ({...d, _isDisaster: true, disasterType: 'earthquake', source: 'USGS'})), isActive('earthquakes'), d => ({ color: getPointColor(d), size: getPointRadius(d), altitude: 50000 }));
        updatePoints('floods', (floods.data || []).map(d => ({...d, _isDisaster: true, disasterType: 'flood', source: 'GDACS'})), isActive('floods'), d => ({ color: getPointColor(d), size: getPointRadius(d), altitude: 50000 }));
        updatePoints('cyclones', (cyclones.data || []).map(d => ({...d, _isDisaster: true, disasterType: 'cyclone', source: 'GDACS'})), isActive('cyclones'), d => ({ color: getPointColor(d), size: getPointRadius(d), altitude: 100000 }));
        updatePoints('volcanoes', (volcanoes.data || []).map(d => ({...d, _isDisaster: true, disasterType: 'volcano', source: 'GVP'})), isActive('volcanoes'), d => ({ color: getPointColor(d), size: getPointRadius(d), altitude: 40000 }));
        updatePoints('eonet', (eonet.data || []).map(d => ({...d, _isDisaster: true, disasterType: 'eonet', source: 'NASA'})), isActive('eonet'), d => ({ color: getPointColor(d), size: getPointRadius(d), altitude: 60000 }));
        
        updatePoints('gridCarbon', (gridCarbon.data || []).map(d => ({...d, _isGrid: true})), isActive('gridCarbon'), d => ({ color: getPointColor(d), size: getPointRadius(d), altitude: 30000 }));
        updatePoints('airQuality', (airQuality.data || []).map(d => ({...d, _isAQ: true})), isActive('airQuality'), d => ({ color: getPointColor(d), size: getPointRadius(d), altitude: 15000 }));
    }, [fires.data, earthquakes.data, floods.data, cyclones.data, volcanoes.data, eonet.data, gridCarbon.data, airQuality.data, activeLayers]);

    // Satellites
    useEffect(() => {
        updatePoints('satellites', satPoints, isActive('satellites'), d => ({ color: getPointColor(d), size: getPointRadius(d), altitude: (d.alt || 400) * 1000 }));
    }, [satPoints, activeLayers]);

    // Countries Choropleth using GeoJsonDataSource
    const countriesSourceRef = useRef(null);
    useEffect(() => {
        const loadCountries = async () => {
            if (!viewerRef.current) return;
            if (isActive('countries') && countries.data?.length > 0 && !countriesSourceRef.current) {
                const featureCollection = { type: 'FeatureCollection', features: countries.data.map(c => c.geometry).filter(Boolean) };
                const dataSource = await Cesium.GeoJsonDataSource.load(featureCollection, {
                    stroke: Cesium.Color.fromCssColorString('rgba(0,0,0,0)'),
                    fill: Cesium.Color.fromCssColorString('rgba(0,0,0,0)'), // Color applied individually next
                });
                
                // Colorize entity polygons
                const entities = dataSource.entities.values;
                for (let i = 0; i < entities.length; i++) {
                    const feat = countries.data[i]; // assuming 1:1 mapping if stable
                    if (feat) {
                        const col = LAYERS.countries.color(feat);
                        entities[i].polygon.material = Cesium.Color.fromCssColorString(col).withAlpha(0.6);
                        entities[i].id = feat; // Custom payload for tooltips
                    }
                }
                
                viewerRef.current.dataSources.add(dataSource);
                countriesSourceRef.current = dataSource;
            } else if (!isActive('countries') && countriesSourceRef.current) {
                viewerRef.current.dataSources.remove(countriesSourceRef.current);
                countriesSourceRef.current = null;
            }
        };
        loadCountries();
    }, [countries.data, activeLayers]);

    // Rings (GVI, Audit, News)
    useEffect(() => {
        let rings = [];
        if (isActive('newsVelocity')) rings.push(...((newsVelocity.data || []).filter(d => d.trending).map(d => ({ ...d, _type: 'news' }))));
        if (isActive('newsVelocity')) rings.push(...((greenwashVelocity.data || []).filter(d => d.risk_band === 'CRITICAL' || d.risk_band === 'HIGH').map(d => {
            const c = (companies.data || []).find(c => c.name === d.company_id);
            return { ...d, lat: c?.lat, lng: c?.lng, _type: 'gvi' };
        }).filter(d => d.lat !== undefined)));
        rings.push(...auditingCompanies.map(d => ({ lat: d.lat, lng: d.lng, company_name: d.name, velocity: 2, _type: 'audit' })));

        const getRingColor = (d) => {
            if (d._type === 'proximity_alert') return d.severity === 'CRITICAL' ? Cesium.Color.RED : Cesium.Color.ORANGE;
            if (d._type === 'gvi') return d.risk_band === 'CRITICAL' ? Cesium.Color.RED : Cesium.Color.ORANGE;
            return d._type === 'alert' ? Cesium.Color.RED : d._type === 'audit' ? Cesium.Color.SPRINGGREEN : Cesium.Color.MEDIUMPURPLE;
        };

        const getRingSize = (d) => {
            if (d._type === 'audit') return 300000;
            if (d._type === 'gvi') return (d.gvi || 50) * 8000;
            return (d.velocity || 1) * 150000;
        };

        let t = 0;
        const tick = () => { t += 0.02; if (!viewerRef.current) return; viewerRef.current.scene.requestRender(); requestAnimationFrame(tick); };
        const raf = requestAnimationFrame(tick);

        updateEntities('rings', rings, true, d => {
            const size = getRingSize(d);
            return new Cesium.Entity({
                position: Cesium.Cartesian3.fromDegrees(d.lng, d.lat),
                id: d,
                ellipse: {
                    semiMinorAxis: new Cesium.CallbackProperty(() => size * (0.2 + 0.8 * (Math.sin(t + d.lat) * 0.5 + 0.5)), false),
                    semiMajorAxis: new Cesium.CallbackProperty(() => size * (0.2 + 0.8 * (Math.sin(t + d.lat) * 0.5 + 0.5)), false),
                    material: new Cesium.ColorMaterialProperty(getRingColor(d).withAlpha(0.3)),
                    outline: true,
                    outlineColor: getRingColor(d),
                }
            });
        });

        return () => cancelAnimationFrame(raf);
    }, [newsVelocity.data, greenwashVelocity.data, auditingCompanies, companies.data, activeLayers]);

    // Sprint 3: GPM Precipitation (Rectangles)
    useEffect(() => {
        updateEntities('gpm_precipitation', gpmImerg.data, isActive('gpm_precipitation'), d => {
            const opacity = Math.min(d.precipitation_mm / 100, 0.8);
            const color = d.precipitation_mm > 50 ? Cesium.Color.RED : d.precipitation_mm > 20 ? Cesium.Color.YELLOW : d.precipitation_mm > 10 ? Cesium.Color.CYAN : Cesium.Color.BLUE;
            return new Cesium.Entity({
                id: { ...d, _type: 'gpm' },
                rectangle: {
                    coordinates: Cesium.Rectangle.fromDegrees(d.lng - 1, d.lat - 1, d.lng + 1, d.lat + 1),
                    material: color.withAlpha(opacity > 0.1 ? opacity : 0.1)
                }
            });
        });
    }, [gpmImerg.data, activeLayers]);

    // Sprint 3: Sentinel-5P Atmosphere (Rectangles)
    useEffect(() => {
        updateEntities('sentinel_atmosphere', sentinel.data, isActive('sentinel_atmosphere'), d => {
            const no2Ratio = Math.min(d.no2 / 0.0002, 1);
            return new Cesium.Entity({
                id: { ...d, _type: 'sentinel' },
                rectangle: {
                    coordinates: Cesium.Rectangle.fromDegrees(d.lng - 2, d.lat - 2, d.lng + 2, d.lat + 2),
                    material: Cesium.Color.MEDIUMPURPLE.withAlpha(no2Ratio * 0.6)
                }
            });
        });
    }, [sentinel.data, activeLayers]);

    // Sprint 3: Biodiversity (Polygons)
    useEffect(() => {
        updateEntities('biodiversity_index', biodiversity.data, isActive('biodiversity_index'), d => {
            const threatRatio = d.threatened_count / (d.species_count || 1);
            const color = threatRatio > 0.2 ? Cesium.Color.RED : threatRatio > 0.1 ? Cesium.Color.ORANGE : Cesium.Color.LIMEGREEN;
            return new Cesium.Entity({
                id: { ...d, _type: 'biodiversity' },
                polygon: {
                    hierarchy: Cesium.Cartesian3.fromDegreesArray([
                        d.lng - 3, d.lat - 3,
                        d.lng + 3, d.lat - 3,
                        d.lng + 3, d.lat + 3,
                        d.lng - 3, d.lat + 3
                    ]),
                    material: color.withAlpha(0.4),
                    outline: true,
                    outlineColor: color,
                    extrudedHeight: threatRatio * 1000000 // visually lift highly threatened zones
                }
            });
        });
    }, [biodiversity.data, activeLayers]);

    // Sprint 4: Ocean Currents (Polylines)
    useEffect(() => {
        if (!viewerRef.current) return;
        const scene = viewerRef.current.scene;
        
        if (primitivesRef.current['ocean_currents']) {
            scene.primitives.remove(primitivesRef.current['ocean_currents']);
            delete primitivesRef.current['ocean_currents'];
        }

        if (isActive('ocean_currents') && oceanCurrents.data?.length > 0) {
            const collection = new Cesium.PolylineCollection();
            oceanCurrents.data.forEach(d => {
                const speed = d.speed_ms || 0;
                // Calculate end point for a short vector based on direction
                const rad = Cesium.Math.toRadians(d.direction_deg);
                const latDiff = Math.cos(rad) * (speed / 5);
                const lngDiff = Math.sin(rad) * (speed / 5);
                
                collection.add({
                    positions: Cesium.Cartesian3.fromDegreesArray([
                        d.lng, d.lat,
                        d.lng + lngDiff, d.lat + latDiff
                    ]),
                    width: speed > 1.5 ? 3 : 2,
                    material: Cesium.Material.fromType('Color', {
                        color: speed > 1.2 ? Cesium.Color.WHITE : Cesium.Color.fromCssColorString('#06b6d4')
                    }),
                    id: { ...d, _type: 'ocean_currents' }
                });
            });
            scene.primitives.add(collection);
            primitivesRef.current['ocean_currents'] = collection;
        }
    }, [oceanCurrents.data, activeLayers]);

    // Sprint 4: Water Stress (GeoJson polygons mapped into entities)
    useEffect(() => {
        updateEntities('water_stress', waterStress.data, isActive('water_stress'), d => {
            const r = d.stress_score;
            const color = r > 4 ? Cesium.Color.fromCssColorString('#7f1d1d') : r > 3 ? Cesium.Color.fromCssColorString('#ef4444') : r > 2 ? Cesium.Color.fromCssColorString('#f97316') : r > 1 ? Cesium.Color.fromCssColorString('#fbbf24') : Cesium.Color.fromCssColorString('#22c55e');
            return new Cesium.Entity({
                id: { ...d, _type: 'water_stress' },
                polygon: {
                    hierarchy: Cesium.Cartesian3.fromDegreesArray(d.geometry ? d.geometry.flat() : [
                        d.lng - 0.5, d.lat - 0.5,
                        d.lng + 0.5, d.lat - 0.5,
                        d.lng + 0.5, d.lat + 0.5,
                        d.lng - 0.5, d.lat + 0.5
                    ]),
                    material: color.withAlpha(0.5),
                    outline: true,
                    outlineColor: color,
                }
            });
        });
    }, [waterStress.data, activeLayers]);

    // Sprint 4: Forest Loss, Coral Bleaching, Fishing Watch (Mixed primitives/entities)
    useEffect(() => {
        // Forest loss - Point primitives
        updatePoints('forest_loss', (forestLoss.data || []).map(d => ({ ...d, _type: 'forest_loss' })), isActive('forest_loss'), d => ({
            color: d.confidence === 'high' ? Cesium.Color.fromCssColorString('#ef4444') : Cesium.Color.fromCssColorString('#f97316'),
            size: Math.max(4, Math.min(12, Math.sqrt(d.area_ha || 0) / 2)),
            altitude: 10000
        }));

        // Illegal fishing - Point primitives
        updatePoints('fishing_watch', (fishingWatch.data || []).map(d => ({ ...d, _type: 'fishing_watch' })), isActive('fishing_watch'), d => ({
            color: d.is_suspected_illegal ? Cesium.Color.fromCssColorString('#a855f7') : Cesium.Color.fromCssColorString('#6b7280'),
            size: d.is_suspected_illegal ? 8 : 4,
            altitude: 10000
        }));

        // Coral Bleaching - Entities (Points + Pulsing ellipses)
        let t = 0;
        const raf = requestAnimationFrame(function tick() { t += 0.05; if(viewerRef.current) viewerRef.current.scene.requestRender(); requestAnimationFrame(tick); });
        
        updateEntities('coral_bleaching', coralBleaching.data, isActive('coral_bleaching'), d => {
            let color = Cesium.Color.GOLD;
            if (d.alert_level === 'Warning') color = Cesium.Color.ORANGE;
            if (d.alert_level === 'Alert1') color = Cesium.Color.RED;
            if (d.alert_level === 'Alert2') color = Cesium.Color.DARKRED;

            const isAlert2 = d.alert_level === 'Alert2';
            
            return new Cesium.Entity({
                id: { ...d, _type: 'coral_bleaching' },
                position: Cesium.Cartesian3.fromDegrees(d.lng, d.lat),
                point: {
                    color: color,
                    pixelSize: 8,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 1
                },
                ellipse: isAlert2 ? {
                    semiMinorAxis: new Cesium.CallbackProperty(() => 50000 * (1 + 0.2 * Math.sin(t)), false),
                    semiMajorAxis: new Cesium.CallbackProperty(() => 50000 * (1 + 0.2 * Math.sin(t)), false),
                    material: new Cesium.ColorMaterialProperty(color.withAlpha(0.4)),
                    outline: true,
                    outlineColor: color
                } : undefined
            });
        });

        return () => cancelAnimationFrame(raf);
    }, [forestLoss.data, fishingWatch.data, coralBleaching.data, activeLayers]);

    // Tooltip Renderer (React Overlay)
    const renderTooltipContent = (d) => {
        if (!d) return null;
        if (d._isDisaster) {
            return (
                <>
                    <strong>{d.type === 'earthquake' ? '🌋 Earthquake' : d.disasterType === 'flood' ? '🌊 Flood' : d.disasterType === 'cyclone' ? '🌀 Cyclone' : d.disasterType === 'volcano' ? '🌋 Volcano' : '⚠️ Disaster'}</strong><br/>
                    {d.title || d.place || d.name}<br/>
                    {d.mag && <>Magnitude: <strong>{d.mag}</strong><br/></>}
                    {d.severity && <>Severity: <strong>{d.severity}</strong><br/></>}
                    Source: {d.source}
                </>
            );
        }
        if (d.type === 'sat') return (
            <><strong>🛰️ {d.name}</strong><br/>Altitude: <strong>{d.alt?.toFixed(0) || 0} km</strong><br/>Type: {d.category}</>
        );
        if (d._isAQ) return (
            <><strong>🏭 {d.name} Air Quality</strong><br/>PM2.5 Avg: <strong>{d.avg_pm25} µg/m³</strong><br/>{d.exceeds_who ? '⚠ Exceeds WHO limit' : '✅ Within WHO limits'}<br/>Sensors active: {d.sensor_count}</>
        );
        if (d._isGrid) return (
            <><strong>⚡ {d.name}</strong><br/>Carbon Intensity: <strong>{d.carbon_intensity} gCO₂eq/kWh</strong><br/>Fossil Free: {d.fossil_free_pct}%<br/>Renewable: {d.renewable_pct}%</>
        );
        if (d._isFire) return (
            <><strong>🔥 Active Fire</strong><br/>Brightness: {d.brightness}K<br/>Power: {d.frp} MW<br/>Confidence: {d.confidence}<br/>Acquired: {d.acq_date}</>
        );
        if (d._isH3) return (
            <><strong>{d.count} companies</strong><br/>Avg Greendex: {d.avg_greendex?.toFixed(1) ?? 'N/A'}<br/>Total emissions: {(d.total_scope / 1e6).toFixed(2)}Mt CO₂<br/>{d.has_any_discrepancy ? '⚠ Discrepancies in this cluster' : ''}<br/><em>Zoom in to see individual companies</em></>
        );
        if (d._type === 'news') return <><strong>{d.company_name}</strong><br/>{d.velocity} ESG mentions today<br/>{d.latest_headline || ''}</>;
        if (d._type === 'proximity_alert') return <><strong>🚨 PROXIMITY ALERT</strong><br/>{d.company_name}<br/>Severity: {d.severity}</>;
        if (d._type === 'gvi') return <><strong>{d.company_id}</strong><br/>GVI Score: {d.gvi}<br/>Articles: {d.article_count}<br/><em>"{d.latest_headline || ''}"</em></>;
        if (d.country && typeof d.disclosure_rate !== 'undefined') return (
            <><strong>{d.country}</strong><br/>Avg Greendex: {d.avg_greendex?.toFixed(1) ?? 'N/A'}<br/>{d.company_count} companies tracked<br/>Disclosure rate: {((d.disclosure_rate || 0) * 100).toFixed(0)}%</>
        );
        if (d._type === 'gpm') return <><strong>🌧️ NASA GPM IMERG</strong><br/>Precipitation: <strong>{d.precipitation_mm} mm</strong><br/>Intensity: {d.intensity}</>;
        if (d._type === 'sentinel') return <><strong>🌍 ESA Sentinel-5P</strong><br/>NO₂: {d.no2?.toExponential(2)} {d.unit}<br/>CH₄: {d.ch4?.toFixed(0)} ppb<br/>CO: {d.co?.toFixed(3)} {d.unit}</>;
        if (d._type === 'biodiversity') return <><strong>{d.zone_name}</strong><br/>Species logged (GBIF): {d.species_count}<br/>Threatened (IUCN): {d.threatened_count}<br/>CR: {d.iucn_categories?.CR} · EN: {d.iucn_categories?.EN} · VU: {d.iucn_categories?.VU}</>;
        if (d._type === 'ocean_currents') return <><strong>🌊 Ocean Current</strong><br/>Speed: {d.speed_ms?.toFixed(2)} m/s<br/>Direction: {d.direction_deg}°</>;
        if (d._type === 'water_stress') return <><strong>💧 {d.basin_name}</strong><br/>Water Stress Score: {d.stress_score?.toFixed(1)}/5<br/>Risk Level: {d.stress_label}</>;
        if (d._type === 'forest_loss') return <><strong>🌳 Deforestation Alert</strong><br/>Area Loss: {d.area_ha?.toFixed(1)} ha<br/>Confidence: {d.confidence}<br/>Detected: {new Date(d.alert_date).toLocaleDateString()}</>;
        if (d._type === 'coral_bleaching') return <><strong>🪸 Coral Reef: {d.region_name}</strong><br/>Status: <strong>{d.alert_level}</strong><br/>DHW: {d.dhw?.toFixed(1)}<br/>Bleaching Risk: {d.bleaching_risk}</>;
        if (d._type === 'fishing_watch') return <><strong>⚓ Vessel: {d.vessel_id}</strong><br/>Flag: {d.flag_country}<br/>Fishing Hours: {d.fishing_hours?.toFixed(1)}h<br/>{d.is_suspected_illegal ? <span style={{color: '#a855f7', fontWeight: 'bold'}}>⚠ Suspected Illegal (Dark Fleet / IUU)</span> : '✅ Compliant'}</>;
        // Default Company Toolkit
        return (
            <>
                <strong>{d.name || d.company_name}</strong><br/>
                {d.country} · {d.sector}<br/>
                Greendex: <span>{d.greendex ?? 'N/A'}</span><br/>
                Scope 1+2: {d.scope_total ? (d.scope_total / 1e6).toFixed(2) + 'Mt' : 'Not disclosed'}<br/>
                {d.has_discrepancy && <>⚠ Math discrepancy detected<br/></>}
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

            <div ref={cesiumContainer} style={{ width: width, height: window.innerHeight - 60 }} />

            {/* REACT HTML TOOLTIP FOR CESIUM */}
            {hoverInfo && (
                <div className="globe-tooltip" style={{ position: 'absolute', left: hoverInfo.x + 15, top: hoverInfo.y + 15, pointerEvents: 'none', zIndex: 100, background: 'rgba(20,20,20,0.9)', padding: 8, borderRadius: 4, color: 'white', border: '1px solid #333' }}>
                    {renderTooltipContent(hoverInfo.data)}
                </div>
            )}

            {/* ── LAYER PANEL (left) ── */}
            <div className="globe-layer-panel">
                <div className="globe-layer-panel__header">
                    <span>Layers</span>
                    <span className="globe-layer-panel__count">{companies.data?.length || 0} cos</span>
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
                        <button className="globe-detail-panel__action" onClick={() => window.dispatchEvent(new CustomEvent('greenorb:navigate', { detail: { tab: 'audit', company: selectedCompany.name } }))}>Open full audit →</button>
                    </>
                )}
            </div>

            <div style={{ position: 'absolute', bottom: 110, left: '50%', transform: 'translateX(-50%)', zIndex: 100 }}>
                <TimelineScrubber onDateChange={setHistoryDate} onLive={() => setHistoryDate(null)} />
            </div>

            <div className="globe-source-bar">
                {[ { label: 'Oceans', state: oceanCurrents }, { label: 'Water', state: waterStress }, { label: 'Forests', state: forestLoss }, { label: 'Corals', state: coralBleaching }, { label: 'Fishing', state: fishingWatch }].map(src => (
                    <div key={src.label} className="globe-source-bar__item">
                        <div className={`globe-source-bar__dot ${src.state.error ? 'globe-source-bar__dot--error' : src.state.stale ? 'globe-source-bar__dot--stale' : 'globe-source-bar__dot--fresh'}`} />
                        <span>{src.label} ({timeAgo(src.state.cached_at)})</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
