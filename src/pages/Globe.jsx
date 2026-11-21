import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Globe from 'react-globe.gl';
import { useApi } from '../hooks/useApi.js';
import { ErrorState } from '../components/ui.jsx';
import { fmtCompact } from '../format.js';

const COLORS = { material: '#ef4444', open: '#f59e0b', clean: '#97ffa1' };

function colorFor(p) {
  if (p.open_material_flags > 0) return COLORS.material;
  if (p.open_flags > 0) return COLORS.open;
  return COLORS.clean;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export default function GlobePage() {
  const { data, error, reload } = useApi('/globe');
  const navigate = useNavigate();
  const wrap = useRef(null);
  const globe = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (globe.current) {
      globe.current.pointOfView({ lat: 22, lng: 40, altitude: 2.3 }, 0);
      const c = globe.current.controls();
      c.autoRotate = true;
      c.autoRotateSpeed = 0.35;
    }
  }, [data]);

  // Companies with exact coordinates are drawn individually; the rest are grouped per country
  // (their only known location), so no point is placed somewhere it is not.
  const points = useMemo(() => {
    if (!data) return [];
    const exact = [];
    const byCountry = new Map();
    for (const p of data.points) {
      const total = (p.scope1 || 0) + (p.scope2 || 0);
      if (p.location_precision !== 'country') {
        exact.push({ ...p, kind: 'company', total, count: 1 });
        continue;
      }
      const g = byCountry.get(p.country) || { kind: 'country', country: p.country, lat: p.lat, lng: p.lng, total: 0, count: 0, open_flags: 0, open_material_flags: 0, top: [] };
      g.total += total;
      g.count += 1;
      g.open_flags += p.open_flags || 0;
      g.open_material_flags += p.open_material_flags || 0;
      g.top.push(p);
      byCountry.set(p.country, g);
    }
    const groups = [...byCountry.values()].map((g) => ({ ...g, top: g.top.sort((a, b) => (b.scope1 || 0) - (a.scope1 || 0)).slice(0, 5) }));
    return [...exact, ...groups];
  }, [data]);

  const maxLog = Math.max(1, ...points.map((p) => Math.log10(1 + p.total)));

  return (
    <div className="globe-wrap" ref={wrap}>
      <div className="globe-panel">
        <h3>Reporting footprint</h3>
        <div className="small muted">
          {data ? `${data.points.length} companies with processed reports${data.unplaced ? ` · ${data.unplaced} without a known location` : ''}.` : 'Loading…'}
          {' '}Bubbles without an exact headquarters are grouped by country. Height shows Scope 1+2 emissions.
        </div>
        <div className="globe-legend">
          <span className="row"><span className="dot" style={{ background: COLORS.material }} /> Open medium/high flags</span>
          <span className="row"><span className="dot" style={{ background: COLORS.open }} /> Only low/info flags</span>
          <span className="row"><span className="dot" style={{ background: '#16a34a' }} /> No open flags</span>
        </div>
        <Link to="/companies" className="go-btn go-btn-outline go-btn-sm" style={{ alignSelf: 'flex-start' }}>Open directory</Link>
        {error && <ErrorState error={error} onRetry={reload} />}
      </div>
      <Globe
        ref={globe}
        width={size.w}
        height={size.h}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="/textures/earth-day.jpg"
        bumpImageUrl="/textures/earth-topology.png"
        atmosphereColor="#97ffa1"
        atmosphereAltitude={0.15}
        pointsData={points}
        pointLat="lat"
        pointLng="lng"
        pointColor={colorFor}
        pointAltitude={(p) => 0.02 + 0.35 * (Math.log10(1 + p.total) / maxLog)}
        pointRadius={(p) => (p.kind === 'country' ? Math.min(2.2, 0.5 + Math.sqrt(p.count) * 0.35) : 0.45)}
        pointResolution={16}
        pointsMerge={false}
        pointLabel={(p) =>
          p.kind === 'country'
            ? `<div class="globe-tip"><b>${esc(p.country)}</b><br/>${p.count} compan${p.count === 1 ? 'y' : 'ies'} · Scope 1+2 ${fmtCompact(p.total)} tCO₂e<br/>${p.open_flags} open flags<br/><span style="color:#6b6c74">${p.top.map((t) => esc(t.name)).join(', ')}</span></div>`
            : `<div class="globe-tip"><b>${esc(p.name)}</b><br/>FY${p.latest_year} · Scope 1+2 ${fmtCompact(p.total)} tCO₂e<br/>${p.open_flags} open flags</div>`
        }
        onPointClick={(p) => navigate(p.kind === 'country' ? `/companies?country=${encodeURIComponent(p.country)}` : `/companies/${p.slug}`)}
      />
    </div>
  );
}
