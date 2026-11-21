import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, Minus } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApi } from '../hooks/useApi.js';
import { useCrumbs } from '../components/Frame.jsx';
import AskPanel from '../components/AskPanel.jsx';
import FlagItem from '../components/FlagItem.jsx';
import { Assurance, Basis, Empty, ErrorNotice, Figure, Notice, Panel, Skel, Source, StatusTag } from '../components/ui.jsx';
import { fmtCompact, fmtDate, fmtFull } from '../format.js';

// Rows of the key-figures statement. A row may draw on several metric keys (Scope 2 methods).
const ROWS = [
  { group: 'Greenhouse gas emissions' },
  { label: 'Scope 1 (direct)', keys: ['ghg_scope1'] },
  { label: 'Scope 2 (purchased energy)', keys: ['ghg_scope2_market', 'ghg_scope2_location', 'ghg_scope2'] },
  { label: 'Scope 3 (value chain)', keys: ['ghg_scope3'] },
  { label: 'Scope 1 + 2, as reported', keys: ['ghg_scope12_total'] },
  { group: 'Energy, water and waste' },
  { label: 'Energy consumed', keys: ['energy_total'] },
  { label: 'Renewable share of energy', keys: ['energy_renewable_pct'] },
  { label: 'Water withdrawn', keys: ['water_withdrawal'] },
  { label: 'Water consumed', keys: ['water_consumption'] },
  { label: 'Waste generated', keys: ['waste_generated'] },
];
const SCOPE2_NOTE = { ghg_scope2_market: 'market-based', ghg_scope2_location: 'location-based' };

function pick(byKey, keys, year) {
  const c = [];
  keys.forEach((k, order) => (byKey[k]?.points || []).forEach((p) => p.fiscal_year === year && c.push({ p, k, order })));
  c.sort((a, b) => (b.p.value != null) - (a.p.value != null) || (a.p.method === 'legacy') - (b.p.method === 'legacy') || a.order - b.order);
  return c[0] || null;
}

function Change({ now, before }) {
  if (now?.value == null || before?.value == null || !before.value) return <span className="faint">–</span>;
  const pct = ((now.value - before.value) / before.value) * 100;
  if (Math.abs(pct) < 0.5) return <span className="muted">no change</span>;
  return <span className={pct > 0 ? 'delta-up' : 'delta-down'}>{pct > 0 ? '+' : '−'}{Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}%</span>;
}

const CHECKS = [
  ['Scope 1', (s) => s.scope1 != null, 20],
  ['Scope 2', (s) => s.scope2 != null, 20],
  ['Scope 3', (s) => s.scope3 != null, 15],
  ['Energy', (s) => s.energy_mwh != null, 10],
  ['Water', (s) => s.water_m3 != null, 10],
  ['Waste', (s) => s.waste_t != null, 10],
  ['External assurance', (s) => ['limited', 'reasonable'].includes(s.assurance_level), 15],
];

export default function Company() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi(`/companies/${slug}`);
  const [showReviewed, setShowReviewed] = useState(false);
  useCrumbs([{ to: '/companies', label: 'Companies' }, { label: data?.company?.name || '…' }]);

  const byKey = useMemo(() => Object.fromEntries((data?.metrics || []).map((m) => [m.key, m])), [data]);
  const latest = data?.summary?.latest_year;

  const chart = useMemo(() => {
    const rows = {};
    const add = (keys, alias) => {
      const best = {};
      keys.forEach((k, order) => (byKey[k]?.points || []).filter((p) => p.value != null).forEach((p) => {
        const rank = (p.method === 'legacy' ? 10 : 0) + order;
        if (!best[p.fiscal_year] || rank < best[p.fiscal_year].rank) best[p.fiscal_year] = { rank, value: p.value };
      }));
      Object.entries(best).forEach(([y, b]) => { (rows[y] ||= { year: Number(y) })[alias] = b.value; });
    };
    add(['ghg_scope1'], 's1');
    add(['ghg_scope2_market', 'ghg_scope2_location', 'ghg_scope2'], 's2');
    add(['ghg_scope3'], 's3');
    return Object.values(rows).sort((a, b) => a.year - b.year);
  }, [byKey]);

  if (loading && !data) {
    return <div className="content"><Skel h={28} w="35%" /><Skel w="50%" style={{ marginTop: 12 }} /><Skel h={320} style={{ marginTop: 24 }} /></div>;
  }
  if (error) return <div className="content"><ErrorNotice error={error} onRetry={reload} /></div>;
  if (!data) return null;

  const { company, summary, reports, flags } = data;
  const open = flags.filter((f) => f.status === 'open');
  const shown = showReviewed ? flags : open;
  const prev = latest ? latest - 1 : null;
  const hasPrev = latest && ROWS.some((r) => r.keys && pick(byKey, r.keys, prev));

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>{company.name}</h1>
          <div className="facts">
            {company.sector && <span>Sector <b>{company.sector}</b></span>}
            {company.country && <span>Country <b>{company.country}</b></span>}
            {company.ticker && <span>Ticker <b>{company.ticker}</b></span>}
            <span>Reports <b>{summary?.report_count ?? 0}</b></span>
            {company.website && <a href={company.website} target="_blank" rel="noreferrer">Company website</a>}
          </div>
        </div>
        <div className="page-actions"><Link to={`/ingest?company=${company.slug}`} className="btn btn-primary">Add a report</Link></div>
      </div>

      {summary?.has_legacy_data && (
        <Notice tone="warn">Some figures were imported from GreenOrb v3 without a source page and may be wrong. Add the original report to replace them with sourced figures.</Notice>
      )}

      {!latest ? (
        <Panel>
          <Empty title={reports.length ? 'This company’s report is being read' : 'No reports yet'} action={!reports.length && <Link to={`/ingest?company=${company.slug}`} className="btn btn-primary">Add a report</Link>}>
            {reports.length ? 'Figures appear here once reading finishes. This usually takes under a minute after the worker picks it up.' : 'Add a sustainability report to extract this company’s figures with their source pages.'}
          </Empty>
        </Panel>
      ) : (
        <div className="grid grid-main">
          <Panel title="Key figures" hint={`As reported for FY${latest}${hasPrev ? ` and FY${prev}` : ''}. Click a page number to open the report there.`} flush>
            <div className="table-wrap">
              <table className="table statement">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th className="num">FY{latest}</th>
                    {hasPrev && <th className="num">FY{prev}</th>}
                    {hasPrev && <th className="num">Change</th>}
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r, i) => {
                    if (r.group) return <tr key={i} className="group"><td colSpan={hasPrev ? 5 : 3}>{r.group}</td></tr>;
                    const now = pick(byKey, r.keys, latest);
                    const before = hasPrev ? pick(byKey, r.keys, prev) : null;
                    return (
                      <tr key={r.label}>
                        <td>
                          <div className="metric">{r.label}</div>
                          {now && SCOPE2_NOTE[now.k] && <div className="sub">{SCOPE2_NOTE[now.k]}</div>}
                          {now?.p.boundary && <div className="sub">{now.p.boundary} figures</div>}
                        </td>
                        <td className="num"><Figure value={now?.p.value} unit={now?.p.unit} raw={now?.p.raw_value} /></td>
                        {hasPrev && <td className="num">{before ? <Figure value={before.p.value} unit={before.p.unit} raw={before.p.raw_value} /> : <span className="faint">–</span>}</td>}
                        {hasPrev && <td className="num">{r.keys[0] === 'energy_renewable_pct' ? <span className="faint">–</span> : <Change now={now?.p} before={before?.p} />}</td>}
                        <td>
                          {now ? (
                            <div style={{ display: 'grid', gap: 2 }}>
                              <span><Source reportId={now.p.report_id} page={now.p.page} method={now.p.method} quote={now.p.quote} /></span>
                              <Basis method={now.p.method} confidence={now.p.confidence} status={now.p.status} />
                            </div>
                          ) : <span className="faint">Not found in reports</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <div style={{ display: 'grid', gap: 20, alignContent: 'start' }}>
            <Panel title="Disclosure completeness" hint={`What FY${latest} covers`}>
              <div className="score">
                <div className="score-value">{summary.disclosure_score}</div>
                <div style={{ flex: 1 }}>
                  <div className="small muted">out of 100</div>
                  <div className="score-bar"><span style={{ width: `${summary.disclosure_score}%` }} /></div>
                </div>
              </div>
              <ul className="checklist" style={{ marginTop: 14 }}>
                {CHECKS.map(([label, ok, pts]) => {
                  const yes = ok(summary);
                  return (
                    <li key={label}>
                      {yes ? <Check size={15} className="yes" aria-label="Disclosed" /> : <Minus size={15} className="no" aria-label="Not disclosed" />}
                      <span style={{ color: yes ? 'var(--ink)' : 'var(--muted)' }}>{label}</span>
                      <span>{pts} pts</span>
                    </li>
                  );
                })}
              </ul>
              <p className="small muted" style={{ marginTop: 12 }}>This scores how complete the disclosure is, not how sustainable the company is.</p>
            </Panel>
            <Panel title="Assurance">
              <Assurance level={summary.assurance_level} />
              <p className="small muted" style={{ marginTop: 8 }}>Whether an independent firm checked the emissions data in the latest report.</p>
            </Panel>
          </div>
        </div>
      )}

      {chart.length > 1 && (
        <Panel title="Emissions over time" hint="Tonnes of CO₂-equivalent, as reported each year" className="mt-20">
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={chart} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
                <XAxis dataKey="year" tickFormatter={(y) => `FY${y}`} tick={{ fontSize: 12, fill: '#8f9b91' }} axisLine={{ stroke: 'rgba(255,255,255,.1)' }} tickLine={false} />
                <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 12, fill: '#8f9b91' }} width={60} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => `${fmtFull(v)} tCO₂e`} labelFormatter={(y) => `FY${y}`} contentStyle={{ fontFamily: 'Manrope', fontSize: 12, borderRadius: 12, background: 'rgba(15,22,17,.94)', border: '1px solid rgba(255,255,255,.14)', color: '#f1f5ee' }} itemStyle={{ color: '#c9d2c9' }} cursor={{ stroke: 'rgba(198,243,107,.4)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
                {[['s1', 'Scope 1', '#c6f36b'], ['s2', 'Scope 2', '#5fbf73'], ['s3', 'Scope 3', '#e9eee6']].filter(([k]) => chart.some((r) => r[k] != null)).map(([k, name, color]) => (
                  <Line key={k} type="linear" dataKey={k} name={name} stroke={color} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: color }} connectNulls isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}

      <div className="grid grid-2 mt-20">
        <Panel
          title="Flags"
          hint={open.length ? `${open.length} open` : 'Nothing open'}
          flush
          action={flags.length > open.length && <button className="btn btn-sm btn-ghost" onClick={() => setShowReviewed((v) => !v)}>{showReviewed ? 'Hide reviewed' : `Show reviewed (${flags.length - open.length})`}</button>}
        >
          {shown.length ? shown.map((f) => <FlagItem key={f.id} flag={f} onChange={() => reload(true)} />) : <Empty>No {showReviewed ? '' : 'open '}flags for this company.</Empty>}
        </Panel>
        <Panel title="Ask about this company">
          {reports.some((r) => r.status === 'processed') ? <AskPanel company={company.slug} /> : <Empty>Available once a report has been read.</Empty>}
        </Panel>
      </div>

      <Panel title="Reports" flush className="mt-20">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Report</th><th>Year</th><th>Status</th><th>Assurance</th><th className="num">Figures</th><th className="num">Open flags</th><th>Added</th></tr></thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="link" onClick={() => navigate(`/reports/${r.id}`)}>
                  <td>
                    <div className="name">{r.title || r.file_name || `Report ${r.id}`}</div>
                    <div className="sub">{{ legacy: 'Imported from v3', url: 'From a link', local: 'Local file', upload: 'Uploaded file' }[r.source_type] || r.source_type}{r.page_count ? `, ${r.page_count} pages` : ''}</div>
                  </td>
                  <td className="nowrap">{r.fiscal_year ? `FY${r.fiscal_year}` : '–'}</td>
                  <td><StatusTag status={r.status} /></td>
                  <td>{r.status === 'processed' ? <Assurance level={r.assurance_level} provider={r.assurance_provider} /> : <span className="faint">–</span>}</td>
                  <td className="num">{r.metric_count}</td>
                  <td className="num">{r.open_flags || <span className="faint">–</span>}</td>
                  <td className="nowrap muted">{fmtDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
