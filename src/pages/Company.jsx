import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApi } from '../hooks/useApi.js';
import AskPanel from '../components/AskPanel.jsx';
import FlagItem from '../components/FlagItem.jsx';
import { AssuranceBadge, Card, Cite, Confidence, Empty, ErrorState, ExternalSource, PageHeader, ScoreRing, Skeleton, SkeletonRows } from '../components/ui.jsx';
import { fmtCompact, fmtDate, fmtFull, fmtUnit } from '../format.js';

const TILES = [
  { key: 'ghg_scope1', label: 'Scope 1' },
  { key: ['ghg_scope2_market', 'ghg_scope2_location', 'ghg_scope2'], label: 'Scope 2' },
  { key: 'ghg_scope3', label: 'Scope 3' },
  { key: 'ghg_scope12_total', label: 'Scope 1+2 (reported)' },
  { key: 'energy_total', label: 'Energy use' },
  { key: 'energy_renewable_pct', label: 'Renewable share' },
  { key: ['water_withdrawal', 'water_consumption'], label: 'Water' },
  { key: 'waste_generated', label: 'Waste' },
];
const SERIES = [
  { key: 'ghg_scope1', name: 'Scope 1', color: '#0b0b0c' },
  { key: 'scope2', name: 'Scope 2', color: '#4d7c0f' },
  { key: 'ghg_scope3', name: 'Scope 3', color: '#a3a3a3' },
];

function Tile({ label, point, metricKey, latestYear }) {
  if (!point) {
    return (
      <div className="kpi">
        <div className="kpi-label">{label}</div>
        <div className="kpi-value muted">–</div>
        <div className="kpi-foot">Not disclosed or not found</div>
      </div>
    );
  }
  const stale = latestYear && point.fiscal_year !== latestYear;
  return (
    <div className="kpi" title={point.quote || ''}>
      <div className="kpi-label">{label}{metricKey?.startsWith('ghg_scope2_') ? ` (${metricKey.endsWith('market') ? 'market' : 'location'})` : ''}</div>
      <div className="kpi-value">
        {point.value == null ? <span title={`Printed as “${point.raw_value}”`}>nil</span> : <>{fmtCompact(point.value)}<span className="kpi-unit">{fmtUnit(point.unit)}</span></>}
      </div>
      <div className="kpi-foot">
        <span>FY{point.fiscal_year}{stale ? ' (latest available)' : ''}</span>
        {point.page && <Cite reportId={point.report_id} page={point.page} />}
        {point.method === 'legacy' ? <span className="go-badge go-badge-medium">unverified</span> : <Confidence value={point.confidence} method={point.method} />}
        {point.status === 'verified' && <span className="go-badge go-badge-success">verified</span>}
      </div>
    </div>
  );
}

export default function Company() {
  const { slug } = useParams();
  const { data, error, loading, reload } = useApi(`/companies/${slug}`);
  const [showAllFlags, setShowAllFlags] = useState(false);

  const byKey = useMemo(() => Object.fromEntries((data?.metrics || []).map((m) => [m.key, m])), [data]);
  const latestYear = data?.summary?.latest_year;
  // For a tile covering several metric keys (e.g. Scope 2 market/location/unspecified), prefer the
  // latest year, then verified extractions over unverified legacy imports, then the key order.
  const latestPoint = (keys) => {
    const cands = [];
    [].concat(keys).forEach((k, order) => (byKey[k]?.points || []).forEach((p) => cands.push({ p, k, order })));
    if (!cands.length) return { point: null, key: null };
    cands.sort((a, b) =>
      (b.p.value != null) - (a.p.value != null) ||
      (b.p.fiscal_year === latestYear) - (a.p.fiscal_year === latestYear) ||
      (a.p.method === 'legacy') - (b.p.method === 'legacy') ||
      b.p.fiscal_year - a.p.fiscal_year ||
      a.order - b.order);
    return { point: cands[0].p, key: cands[0].k };
  };

  const chart = useMemo(() => {
    // One value per series and year; cited extractions win over unverified legacy imports.
    const rows = {};
    const add = (keys, alias) => {
      const best = {};
      keys.forEach((k, order) => (byKey[k]?.points || []).filter((p) => p.value != null).forEach((p) => {
        const rank = (p.method === 'legacy' ? 10 : 0) + order;
        if (!best[p.fiscal_year] || rank < best[p.fiscal_year].rank) best[p.fiscal_year] = { rank, value: p.value };
      }));
      Object.entries(best).forEach(([y, b]) => {
        rows[y] ||= { year: Number(y) };
        rows[y][alias] = b.value;
      });
    };
    add(['ghg_scope1'], 'ghg_scope1');
    add(['ghg_scope2_market', 'ghg_scope2_location', 'ghg_scope2'], 'scope2');
    add(['ghg_scope3'], 'ghg_scope3');
    return Object.values(rows).sort((a, b) => a.year - b.year);
  }, [byKey]);

  if (loading && !data) {
    return <div className="page"><Skeleton h={36} w="40%" /><div style={{ height: 24 }} /><div className="kpi-grid">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} h={110} />)}</div></div>;
  }
  if (error) return <div className="page"><Link to="/companies" className="go-btn go-btn-ghost">← Directory</Link><div style={{ height: 16 }} /><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return null;

  const { company, summary, reports, flags } = data;
  const openFlags = flags.filter((f) => f.status === 'open');
  const shownFlags = showAllFlags ? flags : openFlags;

  return (
    <div className="page">
      <Link to="/companies" className="go-btn go-btn-ghost" style={{ marginBottom: 12 }}>← Directory</Link>
      <PageHeader title={company.name}>
        <Link to={`/ingest?company=${company.slug}`} className="go-btn go-btn-primary">Add a report</Link>
      </PageHeader>
      <div className="row section" style={{ marginTop: -16 }}>
        {company.sector && <span className="go-badge go-badge-accent">{company.sector}</span>}
        {company.country && <span className="go-badge">{company.country}</span>}
        {company.ticker && <span className="go-badge mono">{company.ticker}</span>}
        {summary?.latest_report_id && <AssuranceBadge level={summary.assurance_level} />}
        {company.website && <ExternalSource url={company.website} />}
      </div>

      {!latestYear ? (
        <Card style={{ marginBottom: 24 }}>
          <Empty title={reports.length ? 'Reports are being processed' : 'No reports yet'}>
            {reports.length ? 'Figures appear here once the worker has read the report.' : 'Add a sustainability report to extract cited figures for this company.'}
          </Empty>
        </Card>
      ) : (
        <>
          <div className="grid-21 section">
            <div className="kpi-grid">
              {TILES.map((t) => {
                const { point, key } = latestPoint(t.key);
                return <Tile key={t.label} label={t.label} point={point} metricKey={key} latestYear={latestYear} />;
              })}
            </div>
            <Card title="Disclosure score">
              <div className="row" style={{ gap: 16, flexWrap: 'nowrap' }}>
                <ScoreRing value={summary.disclosure_score} />
                <div className="small muted" style={{ lineHeight: 1.5 }}>
                  How completely FY{latestYear} is disclosed: Scope 1 (20) + Scope 2 (20) + Scope 3 (15) + energy, water and waste (10 each) + external assurance (10 limited / 15 reasonable).
                </div>
              </div>
              <div className="stack small" style={{ marginTop: 14 }}>
                <div className="row"><span className="muted">Data confidence</span><span className="spacer" />{summary.data_confidence != null ? `${Math.round(summary.data_confidence * 100)}%` : '–'}</div>
                <div className="row"><span className="muted">Open flags</span><span className="spacer" /><span style={{ color: summary.open_material_flags ? 'var(--down)' : undefined }}>{summary.open_flags}</span></div>
                <div className="row"><span className="muted">Reports</span><span className="spacer" />{summary.report_count}</div>
                {summary.has_legacy_data && <div className="go-status go-status-warn small">Some figures were imported from GreenOrb v3 and are unverified.</div>}
              </div>
            </Card>
          </div>
          {chart.length > 1 && (
            <Card title="Emissions over time (tCO₂e)" style={{ marginBottom: 24 }}>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <LineChart data={chart} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(0,0,0,.06)" vertical={false} />
                    <XAxis dataKey="year" tickFormatter={(y) => `FY${y}`} tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 12 }} width={64} />
                    <Tooltip formatter={(v) => `${fmtFull(v)} tCO₂e`} labelFormatter={(y) => `FY${y}`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {SERIES.filter((s) => chart.some((r) => r[s.key] != null)).map((s) => (
                      <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </>
      )}

      <div className="grid-2 section">
        <Card title={`Integrity flags (${openFlags.length} open)`} action={flags.length > openFlags.length && (
          <button className="go-btn go-btn-ghost" onClick={() => setShowAllFlags((v) => !v)}>{showAllFlags ? 'Open only' : `Show reviewed (${flags.length - openFlags.length})`}</button>
        )}>
          {shownFlags.length ? (
            <div className="stack">{shownFlags.map((f) => <FlagItem key={f.id} flag={f} onChange={() => reload(true)} />)}</div>
          ) : <Empty>No {showAllFlags ? '' : 'open '}flags.</Empty>}
        </Card>
        <Card title="Ask the reports">
          {reports.some((r) => r.status === 'processed') ? <AskPanel company={company.slug} /> : <Empty>Available once a report has been processed.</Empty>}
        </Card>
      </div>

      <Card title="Reports" flush>
        {reports.length ? (
          <div className="table-wrap">
            <table className="go-table">
              <thead><tr><th>Report</th><th>FY</th><th>Status</th><th>Assurance</th><th className="num">Metrics</th><th className="num">Open flags</th><th>Added</th></tr></thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/reports/${r.id}`} style={{ fontWeight: 700 }}>{r.title || r.file_name || `Report #${r.id}`}</Link>
                      <div className="small muted">{r.source_type === 'legacy' ? 'Imported from v3' : r.source_type}{r.page_count ? ` · ${r.page_count} pages` : ''}</div>
                    </td>
                    <td className="mono">{r.fiscal_year || '–'}</td>
                    <td><span className={`go-badge ${r.status === 'processed' ? 'go-badge-success' : r.status === 'failed' ? 'go-badge-high' : r.status === 'legacy' ? 'go-badge-medium' : 'go-badge-info'}`}>{r.status}</span></td>
                    <td>{r.status === 'processed' ? <AssuranceBadge level={r.assurance_level} provider={r.assurance_provider} /> : '–'}</td>
                    <td className="num">{r.metric_count}</td>
                    <td className="num">{r.open_flags || '–'}</td>
                    <td className="small muted nowrap">{fmtDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <SkeletonRows rows={0} />}
      </Card>
    </div>
  );
}
