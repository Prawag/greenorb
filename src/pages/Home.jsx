import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Globe from 'react-globe.gl';
import { MeshPhongMaterial } from 'three';
import { ArrowUpRight, FileCheck2, Building2, Link2, ShieldCheck, X } from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import { useCrumbs } from '../components/Frame.jsx';
import { Empty, ErrorNotice, Skel } from '../components/ui.jsx';
import { fmtCompact, timeAgo } from '../format.js';

const C = { lime: '#c6f36b', amber: '#f2b54d', red: '#f27466', white: '#e9eee6', green: '#5fbf73' };

const LAYERS = [
  { id: 'flags', label: 'Flags' },
  { id: 'disclosure', label: 'Disclosure' },
  { id: 'emissions', label: 'Emissions' },
];

const s12 = (p) => (p.scope1 || 0) + (p.scope2 || 0);
const initials = (name = '') => name.replace(/\b(ltd|limited|inc|plc|corp|co)\b\.?/gi, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const tco2 = (v) => `${fmtCompact(v)} t`;
const short = (v) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: v >= 1e9 ? 1 : 0 }).format(v);

/** Companies placed only by country share one marker, so nothing is drawn where it isn't. */
function buildPlaces(points) {
  const map = new Map();
  for (const p of points) {
    const exact = p.location_precision !== 'country';
    const key = exact ? `c:${p.slug}` : `k:${p.country}`;
    const g = map.get(key) || { key, exact, label: exact ? p.name : p.country, country: p.country, lat: p.lat, lng: p.lng, companies: [] };
    g.companies.push(p);
    map.set(key, g);
  }
  return [...map.values()].map((g) => {
    const cs = g.companies.sort((a, b) => s12(b) - s12(a));
    const scored = cs.filter((c) => c.disclosure_score != null);
    return {
      ...g,
      count: cs.length,
      total: cs.reduce((a, c) => a + s12(c), 0),
      open: cs.reduce((a, c) => a + (c.open_flags || 0), 0),
      material: cs.reduce((a, c) => a + (c.open_material_flags || 0), 0),
      withMaterial: cs.filter((c) => c.open_material_flags > 0).length,
      score: scored.length ? Math.round(scored.reduce((a, c) => a + c.disclosure_score, 0) / scored.length) : null,
    };
  });
}

function placeStyle(p, layer, maxTotal) {
  if (layer === 'flags') {
    const c = p.material > 0 ? C.red : p.open > 0 ? C.amber : C.lime;
    return { color: c, value: p.open ? `${p.open} flag${p.open === 1 ? '' : 's'}` : 'no flags' };
  }
  if (layer === 'disclosure') {
    const c = p.score == null ? C.white : p.score >= 70 ? C.lime : p.score >= 40 ? C.amber : C.red;
    return { color: c, value: p.score == null ? 'no score' : `${p.score}/100` };
  }
  const rel = maxTotal ? Math.log10(1 + p.total) / Math.log10(1 + maxTotal) : 0;
  return { color: C.white, value: `${fmtCompact(p.total)} t`, size: 8 + rel * 10 };
}

const LEGENDS = {
  flags: [[C.red, 'Medium or high flags'], [C.amber, 'Low flags only'], [C.lime, 'No open flags']],
  disclosure: [[C.lime, '70 and above'], [C.amber, '40 to 69'], [C.red, 'Below 40']],
  emissions: [[C.white, 'Marker size shows Scope 1 + 2']],
};

/* ── Globe ─────────────────────────────────────────────────────────── */
function Earth({ places, layer, selected, onSelect }) {
  const wrap = useRef(null);
  const globe = useRef(null);
  const [size, setSize] = useState(null);
  const [ready, setReady] = useState(false);
  const maxTotal = Math.max(0, ...places.map((p) => p.total));
  // Slightly muted, green-leaning earth so the glass panels and markers read on top of it.
  const material = useMemo(() => new MeshPhongMaterial({ color: '#8da386', shininess: 4 }), []);

  useEffect(() => {
    const el = wrap.current;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onReady = useCallback(() => {
    const g = globe.current;
    if (!g) return;
    g.pointOfView({ lat: 24, lng: 60, altitude: 2.05 }, 0);
    const c = g.controls();
    c.autoRotate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    c.autoRotateSpeed = 0.28;
    c.enableDamping = true;
    c.minDistance = 160;
    c.maxDistance = 520;
    setReady(true);
  }, []);

  useEffect(() => {
    const g = globe.current;
    if (!g || !ready) return;
    const c = g.controls();
    if (selected) {
      c.autoRotate = false;
      g.pointOfView({ lat: selected.lat, lng: selected.lng, altitude: 1.55 }, 900);
    } else if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      c.autoRotate = true;
    }
  }, [selected, ready]);

  // New marker elements whenever the layer or the selection changes (there are only a few dozen).
  const markers = useMemo(
    () =>
      places.map((p) => {
        const st = placeStyle(p, layer, maxTotal);
        return { ...p, st, on: selected?.key === p.key, small: p.count < 2 && p.total < maxTotal * 0.02 };
      }),
    [places, layer, selected, maxTotal],
  );

  const makeEl = useCallback(
    (d) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `marker${d.on ? ' on' : ''}${d.small && !d.on ? ' small' : ''}`;
      el.style.setProperty('--c', d.st.color);
      el.setAttribute('aria-label', `${d.label}: ${d.count} compan${d.count === 1 ? 'y' : 'ies'}, ${d.st.value}`);
      const dot = document.createElement('span');
      dot.className = 'marker-dot';
      if (d.st.size) { dot.style.width = `${d.st.size}px`; dot.style.height = `${d.st.size}px`; }
      const lab = document.createElement('span');
      lab.className = 'marker-label';
      lab.textContent = d.label;
      const v = document.createElement('span');
      v.textContent = `  ${d.st.value}`;
      lab.appendChild(v);
      el.append(dot, lab);
      el.style.border = '0';
      el.style.background = 'none';
      el.style.padding = '0';
      el.onclick = (e) => { e.stopPropagation(); onSelect(d.key); };
      return el;
    },
    [onSelect],
  );

  return (
    <div className={`home-globe${ready ? ' ready' : ''}`} ref={wrap}>
      {size && (
        <Globe
          ref={globe}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          globeMaterial={material}
          globeImageUrl="/textures/earth-day.jpg"
          bumpImageUrl="/textures/earth-topology.png"
          atmosphereColor="#a8e07c"
          atmosphereAltitude={0.17}
          onGlobeReady={onReady}
          htmlElementsData={markers}
          htmlLat="lat"
          htmlLng="lng"
          htmlAltitude={0.012}
          htmlElement={makeEl}
          htmlTransitionDuration={0}
          htmlElementVisibilityModifier={(el, visible) => { el.style.opacity = visible ? 1 : 0; el.style.pointerEvents = visible ? 'auto' : 'none'; }}
          ringsData={selected ? [selected] : []}
          ringLat="lat"
          ringLng="lng"
          ringColor={() => (t) => `rgba(198,243,107,${1 - t})`}
          ringMaxRadius={4.5}
          ringPropagationSpeed={2.2}
          ringRepeatPeriod={1100}
          onGlobeClick={() => onSelect(null)}
        />
      )}
    </div>
  );
}

/* ── Place card ────────────────────────────────────────────────────── */
function PlaceCard({ place, layer, onClose }) {
  const st = placeStyle(place, layer, place.total);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    const g = document.querySelector('.home-globe');
    if (!g) return;
    const r = g.getBoundingClientRect();
    // The globe flies the place to the centre; the card sits to its left so the marker label stays visible.
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    setPos(mobile ? {} : { left: Math.max(94, r.width / 2 - 384), top: Math.max(84, r.height / 2 - 190) });
  }, [place.key]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!pos) return null;
  return (
    <section className="panel place-card" style={pos} aria-label={`${place.label} companies`}>
      <div className="pc-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="tag" style={{ color: st.color, background: 'rgba(255,255,255,.07)' }}>
            <span className="status-dot" style={{ background: st.color }} />
            {place.material ? `${place.withMaterial} with medium or high flags` : place.open ? `${place.open} low-severity flags` : 'No open flags'}
          </span>
          <h3 style={{ marginTop: 10 }}>{place.label}</h3>
          <div className="small muted">
            {place.count} compan{place.count === 1 ? 'y' : 'ies'} with figures{place.exact ? '' : ', placed at the country'}
          </div>
        </div>
        <button className="btn btn-sm icon-btn" onClick={onClose} aria-label="Close"><X /></button>
      </div>
      <div className="row small faint" style={{ padding: '0 18px 6px', justifyContent: 'space-between' }}>
        <span>Company</span><span>Scope 1 + 2, latest year</span>
      </div>
      <ul className="place-list">
        {place.companies.slice(0, 8).map((c) => (
          <li key={c.slug}>
            <Link to={`/companies/${c.slug}`}>
              <span className="nm">{c.name}</span>
              <span className="vl">{s12(c) ? tco2(s12(c)) : '–'}</span>
              <span className="meta">
                <span className={`sev ${c.open_material_flags ? 'sev-high' : c.open_flags ? 'sev-medium' : ''}`} style={!c.open_flags ? { background: C.lime } : undefined} />
                {c.open_flags ? `${c.open_flags} open flag${c.open_flags === 1 ? '' : 's'}` : 'No open flags'}
              </span>
              <span className="meta" style={{ justifyContent: 'flex-end' }}>FY{c.latest_year}{c.disclosure_score != null ? `, ${c.disclosure_score}/100` : ''}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="pc-foot">
        {place.exact ? (
          <Link className="btn btn-primary" to={`/companies/${place.companies[0].slug}`}>Open company</Link>
        ) : (
          <Link className="btn btn-primary" to={`/companies?country=${encodeURIComponent(place.country)}`}>
            {place.count > 8 ? `See all ${place.count} in ${place.label}` : `Compare companies in ${place.label}`}
          </Link>
        )}
      </div>
    </section>
  );
}

/* ── Overview cards ────────────────────────────────────────────────── */
function Gauge({ pct }) {
  const ticks = 32;
  const on = Math.round((pct / 100) * ticks);
  const r = 58;
  return (
    <svg className="gauge" width="150" height="86" viewBox="0 0 150 86" aria-hidden>
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const a = Math.PI - (i / ticks) * Math.PI;
        const x1 = 75 + Math.cos(a) * (r + 8);
        const y1 = 78 - Math.sin(a) * (r + 8);
        const x2 = 75 + Math.cos(a) * (r + 13);
        const y2 = 78 - Math.sin(a) * (r + 13);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i <= on ? C.lime : 'rgba(255,255,255,.18)'} strokeWidth="1.6" strokeLinecap="round" />;
      })}
      <path d={`M ${75 - r} 78 A ${r} ${r} 0 0 1 ${75 + r} 78`} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="9" strokeLinecap="round" />
      <path d={`M ${75 - r} 78 A ${r} ${r} 0 0 1 ${75 + r} 78`} fill="none" stroke={C.lime} strokeWidth="9" strokeLinecap="round" pathLength="100" strokeDasharray={`${pct} 100`} />
    </svg>
  );
}

function Overview({ stats, points, delay }) {
  const t = stats?.totals;
  const scored = points.filter((p) => p.disclosure_score != null);
  const avg = scored.length ? Math.round(scored.reduce((a, p) => a + p.disclosure_score, 0) / scored.length) : null;
  const buckets = Array.from({ length: 10 }, (_, i) => scored.filter((p) => Math.min(9, Math.floor(p.disclosure_score / 10)) === i).length);
  const maxB = Math.max(1, ...buckets);
  const clean = points.length ? Math.round((points.filter((p) => !p.open_material_flags).length / points.length) * 100) : 0;
  const coverage = t && t.companies ? t.companies_with_data / t.companies : 0;
  const dotsOn = t?.companies_with_data ? Math.max(1, Math.round(coverage * 40)) : 0;
  const matched = t?.metrics_extracted ? Math.round((t.metrics_grounded / t.metrics_extracted) * 100) : null;

  return (
    <section className="panel reveal" style={{ animationDelay: `${delay}ms` }}>
      <div className="panel-head">
        <div><h2>Portfolio overview</h2><div className="hint">Latest reported year for each company</div></div>
        <Link to="/companies" className="btn btn-sm icon-btn" aria-label="All companies"><ArrowUpRight /></Link>
      </div>
      <div className="panel-body">
        {!t ? (
          <div className="overview-grid">{[0, 1, 2, 3].map((i) => <div className="card" key={i}><Skel w="60%" /><Skel h={28} w="45%" style={{ marginTop: 10 }} /><Skel h={40} style={{ marginTop: 12 }} /></div>)}</div>
        ) : (
          <div className="overview-grid">
            <div className="card">
              <div className="card-head">Avg. disclosure <FileCheck2 aria-hidden /></div>
              <div className="card-value">
                {avg ?? '–'}<small>/100</small>
                {avg != null && <span className={`tag ${avg >= 70 ? 'tag-ok' : avg >= 40 ? 'tag-medium' : 'tag-high'}`}>{avg >= 70 ? 'Good' : avg >= 40 ? 'Partial' : 'Thin'}</span>}
              </div>
              <div className="lollipops" title="How many companies score in each band of 10">
                {buckets.map((n, i) => (
                  <span key={i} className={`lolli${avg != null && Math.min(9, Math.floor(avg / 10)) === i ? ' on' : ''}`} style={{ height: `${n ? 8 + (n / maxB) * 36 : 2}px`, opacity: n ? 1 : 0.35 }} />
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-head">Companies with figures <Building2 aria-hidden /></div>
              <div className="card-value">{fmtCompact(t.companies_with_data)}<small>of {fmtCompact(t.companies)}</small></div>
              <div className="dots" title={`${(coverage * 100).toFixed(1)}% of tracked companies`}>
                {Array.from({ length: 40 }, (_, i) => <i key={i} className={i < dotsOn ? 'on' : ''} />)}
              </div>
            </div>
            <div className="card">
              <div className="card-head">Traced to a page <Link2 aria-hidden /></div>
              <div className="card-value">
                {fmtCompact(t.metrics_grounded)}
                {matched != null && <span className="tag tag-ok">{matched}% matched</span>}
              </div>
              <div className="card-note">Figures found word-for-word on their cited page. {t.metrics_verified ? `${fmtCompact(t.metrics_verified)} checked by a reviewer.` : 'None checked by a reviewer yet.'}</div>
            </div>
            <div className="card">
              <div className="card-head">No material flags <ShieldCheck aria-hidden /></div>
              <Gauge pct={clean} />
              <div className="gauge-value">{clean}%</div>
              <div className="gauge-note">of companies on the map</div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ReviewCard({ delay }) {
  const { data } = useApi('/flags?status=all&limit=1', { poll: 60000 });
  const sev = data?.open_by_severity || {};
  const open = Object.values(sev).reduce((a, n) => a + n, 0);
  const all = data?.total || 0;
  const reviewed = Math.max(0, all - open);
  const on = all ? Math.round((reviewed / all) * 10) : 0;
  const pct = all ? Math.round((reviewed / all) * 100) : 0;
  return (
    <section className="panel reveal" style={{ animationDelay: `${delay}ms` }}>
      <div className="panel-body" style={{ paddingTop: 18 }}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="small muted">Review queue</div>
            <div style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 600, marginTop: 2 }}>{data ? `${open} open flag${open === 1 ? '' : 's'}` : <Skel w={120} h={20} />}</div>
          </div>
          <span className="spacer" />
          <Link to="/review" className="btn btn-sm">Open queue</Link>
        </div>
        <div className="row small" style={{ marginTop: 10, gap: 6 }}>
          {['high', 'medium', 'low', 'info'].filter((k) => sev[k]).map((k) => (
            <span key={k} className={`tag tag-${k === 'info' ? 'quiet' : k}`}>{sev[k]} {k === 'info' ? 'notes' : k}</span>
          ))}
        </div>
        <div className="row small muted" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <span>Reviewed {reviewed} of {all}</span><span>{pct}%</span>
        </div>
        <div className="blocks" aria-hidden>{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < on ? 'on' : ''} />)}</div>
      </div>
    </section>
  );
}

function Activity({ stats, delay }) {
  const rows = stats?.recent_reports || [];
  return (
    <section className="panel reveal" style={{ animationDelay: `${delay}ms` }}>
      <div className="panel-head">
        <h2>Recently read</h2>
        <Link to="/ingest" className="btn btn-sm btn-ghost">Add a report</Link>
      </div>
      <div className="panel-body">
        {!stats ? <Skel h={120} /> : rows.length ? (
          <ul className="activity">
            {rows.map((r) => {
              const failed = r.status === 'failed';
              const busy = r.status === 'queued' || r.status === 'processing';
              return (
                <li key={r.id}>
                  <Link to={`/reports/${r.id}`}>
                    <span className={`avatar${failed ? ' bad' : busy ? ' warn' : ''}`} aria-hidden>{initials(r.company_name)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span className="t" style={{ display: 'block' }}>{r.company_name}</span>
                      <span className="d" style={{ display: 'block' }}>
                        {failed ? 'Could not be read' : busy ? 'Being read now' : `${r.metric_count} figure${Number(r.metric_count) === 1 ? '' : 's'} read${r.fiscal_year ? ` for FY${r.fiscal_year}` : ''}`}
                      </span>
                    </span>
                    <time dateTime={r.processed_at || r.created_at}>{timeAgo(r.processed_at || r.created_at).replace(' ago', '')}</time>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="small muted">No reports read yet.</p>
        )}
      </div>
    </section>
  );
}

/* ── Bottom charts ─────────────────────────────────────────────────── */
function ScopeMix({ points, delay }) {
  const tot = { s1: 0, s2: 0, s3: 0 };
  for (const p of points) { tot.s1 += p.scope1 || 0; tot.s2 += p.scope2 || 0; tot.s3 += p.scope3 || 0; }
  const sum = tot.s1 + tot.s2 + tot.s3;
  const rings = [
    { k: 's1', label: 'Scope 1', color: C.lime, r: 62 },
    { k: 's2', label: 'Scope 2', color: C.green, r: 50 },
    { k: 's3', label: 'Scope 3', color: C.white, r: 38 },
  ];
  return (
    <section className="panel reveal" style={{ animationDelay: `${delay}ms` }}>
      <div className="panel-head"><div><h2>Scope mix</h2><div className="hint">All mapped companies, latest year</div></div></div>
      <div className="panel-body">
        {sum ? (
          <div className="mix">
            <svg width="128" height="128" viewBox="0 0 150 150" role="img" aria-label={`Total ${fmtCompact(sum)} tonnes CO2e`}>
              {rings.map((g) => (
                <g key={g.k} transform="rotate(-90 75 75)">
                  <circle cx="75" cy="75" r={g.r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="8" />
                  <circle cx="75" cy="75" r={g.r} fill="none" stroke={g.color} strokeWidth="8" strokeLinecap="round" pathLength="100" strokeDasharray={`${Math.max(1, (tot[g.k] / sum) * 100)} 100`} />
                </g>
              ))}
              <text x="75" y="78" textAnchor="middle" className="mix-center">{short(sum)}</text>
              <text x="75" y="90" textAnchor="middle" className="mix-sub">tCO₂e</text>
            </svg>
            <ul className="mix-legend">
              {rings.map((g) => (
                <li key={g.k}><i style={{ background: g.color }} />{g.label}<b>{Math.round((tot[g.k] / sum) * 100)}%</b></li>
              ))}
            </ul>
          </div>
        ) : <p className="small muted">No emissions figures yet.</p>}
      </div>
    </section>
  );
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
}

function SectorChart({ points, delay }) {
  const [scope, setScope] = useState('s12');
  const [hover, setHover] = useState(null);
  const navigate = useNavigate();
  const rows = useMemo(() => {
    const m = new Map();
    for (const p of points) {
      const k = p.sector || 'Unclassified';
      const v = scope === 's12' ? s12(p) : p.scope3 || 0;
      const g = m.get(k) || { sector: k, v: 0, n: 0 };
      g.v += v;
      g.n += 1;
      m.set(k, g);
    }
    return [...m.values()].filter((g) => g.v > 0).sort((a, b) => b.v - a.v).slice(0, 10);
  }, [points, scope]);
  const max = niceMax(Math.max(0, ...rows.map((r) => r.v)));
  const top = rows[0]?.sector;
  const shown = hover ?? top;

  return (
    <section className="panel reveal" style={{ animationDelay: `${delay}ms` }}>
      <div className="panel-head">
        <div><h2>Emissions by sector</h2><div className="hint">tCO₂e, latest year per company</div></div>
        <div className="segmented" role="group" aria-label="Scope">
          <button className={scope === 's12' ? 'on' : ''} onClick={() => setScope('s12')}>Scope 1 + 2</button>
          <button className={scope === 's3' ? 'on' : ''} onClick={() => setScope('s3')}>Scope 3</button>
        </div>
      </div>
      <div className="panel-body">
        {rows.length ? (
          <div className="cols">
            <div className="cols-axis" aria-hidden>{[1, 0.75, 0.5, 0.25, 0].map((f) => <span key={f}>{fmtCompact(max * f)}</span>)}</div>
            <div className="cols-plot" onMouseLeave={() => setHover(null)}>
              {rows.map((r) => (
                <button
                  key={r.sector}
                  className={`col${shown === r.sector ? ' on' : ''}`}
                  onMouseEnter={() => setHover(r.sector)}
                  onFocus={() => setHover(r.sector)}
                  onClick={() => navigate(r.sector === 'Unclassified' ? '/companies' : `/companies?sector=${encodeURIComponent(r.sector)}`)}
                  aria-label={`${r.sector}: ${fmtCompact(r.v)} tonnes from ${r.n} companies`}
                >
                  <span className="col-track" />
                  <span className="col-bar" style={{ height: `${(r.v / max) * 100}%` }}>
                    {shown === r.sector && <span className="col-tip">{fmtCompact(r.v)} t, {r.n} co.</span>}
                  </span>
                  <span className="col-label" title={r.sector}>{r.sector.split(/[ &,]/)[0]}</span>
                </button>
              ))}
            </div>
          </div>
        ) : <p className="small muted">No {scope === 's12' ? 'Scope 1 or 2' : 'Scope 3'} figures yet.</p>}
      </div>
    </section>
  );
}

/* ── Page ──────────────────────────────────────────────────────────── */
export default function Home() {
  useCrumbs([{ label: 'Overview' }]);
  const globe = useApi('/globe');
  const stats = useApi('/stats', { poll: 60000 });
  const [layer, setLayer] = useState('flags');
  const [selKey, setSelKey] = useState(null);
  const points = globe.data?.points || [];
  const places = useMemo(() => buildPlaces(points), [points]);
  const selected = places.find((p) => p.key === selKey) || null;
  const onSelect = useCallback((k) => setSelKey(k), []);
  const empty = stats.data && !Number(stats.data.totals.companies_with_data);

  return (
    <div className="home">
      <h1 className="sr-only">Overview</h1>
      <Earth places={places} layer={layer} selected={selected} onSelect={onSelect} />

      <div className="map-legend" aria-label="Map legend">
        {LEGENDS[layer].map(([c, t]) => <span key={t}><span className="status-dot" style={{ background: c }} />{t}</span>)}
      </div>
      <div className="layers" role="group" aria-label="Colour the map by">
        {LAYERS.map((l) => (
          <button key={l.id} className={`layer-btn${layer === l.id ? ' on' : ''}`} onClick={() => setLayer(l.id)} aria-pressed={layer === l.id}>{l.label}</button>
        ))}
      </div>

      {selected && <PlaceCard place={selected} layer={layer} onClose={() => setSelKey(null)} />}

      <aside className="home-side">
        {(globe.error || stats.error) && <ErrorNotice error={globe.error || stats.error} onRetry={() => { globe.reload(); stats.reload(); }} />}
        {empty ? (
          <section className="panel reveal">
            <Empty title="No reports read yet" action={<Link className="btn btn-primary" to="/ingest">Add a report</Link>}>
              Add a sustainability or annual report and GreenOrb will place the company here with its figures.
            </Empty>
          </section>
        ) : (
          <>
            <Overview stats={stats.data} points={points} delay={120} />
            <ReviewCard delay={200} />
            <Activity stats={stats.data} delay={280} />
          </>
        )}
      </aside>

      {!empty && (
        <div className="home-bottom">
          <ScopeMix points={points} delay={340} />
          <SectorChart points={points} delay={400} />
        </div>
      )}
    </div>
  );
}
