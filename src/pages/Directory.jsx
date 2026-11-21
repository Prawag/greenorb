import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { AssuranceBadge, Card, Empty, ErrorState, PageHeader, Pagination, SkeletonRows } from '../components/ui.jsx';
import { fmtCompact } from '../format.js';

const COLS = [
  { key: 'name', label: 'Company' },
  { key: 'year', label: 'Latest FY', num: true },
  { key: 'scope1', label: 'Scope 1', num: true },
  { key: 'scope2', label: 'Scope 2', num: true },
  { key: 'scope3', label: 'Scope 3', num: true },
  { key: 'disclosure', label: 'Disclosure', num: true },
  { key: 'flags', label: 'Open flags', num: true },
];

export default function Directory() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') || '';
  const sector = params.get('sector') || '';
  const country = params.get('country') || '';
  const hasData = params.get('has_data') ?? 'true';
  const sort = params.get('sort') || 'name';
  const order = params.get('order') || '';
  const page = Number(params.get('page') || 1);
  const [search, setSearch] = useState(q);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v === '' || v === null || v === undefined ? next.delete(k) : next.set(k, v)));
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => search !== q && update({ q: search }), 350);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const qs = new URLSearchParams({ page, limit: 25, sort });
  if (order) qs.set('order', order);
  if (q) qs.set('q', q);
  if (sector) qs.set('sector', sector);
  if (country) qs.set('country', country);
  if (hasData !== 'all') qs.set('has_data', hasData);
  const { data, error, loading, reload } = useApi(`/companies?${qs}`);
  const facets = useApi('/companies/facets').data;

  const clickSort = (key) => {
    if (sort === key) update({ order: (order || (key === 'name' ? 'asc' : 'desc')) === 'asc' ? 'desc' : 'asc' });
    else update({ sort: key, order: '' });
  };
  const arrow = (key) => (sort === key ? ((order || (key === 'name' ? 'asc' : 'desc')) === 'asc' ? ' ↑' : ' ↓') : '');

  return (
    <div className="page">
      <PageHeader
        title="ESG Directory"
        subtitle={data ? `${data.total.toLocaleString()} ${data.total === 1 ? 'company' : 'companies'}${sector ? ` in ${sector}` : ''}${country ? ` · ${country}` : ''}${q ? ` matching “${q}”` : ''}. Emissions show the latest primary value in tCO₂e.` : 'Loading…'}
      />

      <Card style={{ marginBottom: 20 }}>
        <div className="row" style={{ gap: 12 }}>
          <input className="go-input" style={{ maxWidth: 320 }} placeholder="Search companies or tickers…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search companies" />
          <select className="go-select" value={sector} onChange={(e) => update({ sector: e.target.value })} aria-label="Sector">
            <option value="">All sectors</option>
            {facets?.sectors?.map((s) => <option key={s.value} value={s.value}>{s.value} ({s.count})</option>)}
          </select>
          <select className="go-select" value={country} onChange={(e) => update({ country: e.target.value })} aria-label="Country">
            <option value="">All countries</option>
            {facets?.countries?.map((c) => <option key={c.value} value={c.value}>{c.value} ({c.count})</option>)}
          </select>
          <div className="seg" role="group" aria-label="Data filter">
            <button className={hasData === 'true' ? 'on' : ''} onClick={() => update({ has_data: 'true' })}>With data</button>
            <button className={hasData === 'false' ? 'on' : ''} onClick={() => update({ has_data: 'false' })}>No data yet</button>
            <button className={hasData === 'all' ? 'on' : ''} onClick={() => update({ has_data: 'all' })}>All</button>
          </div>
          {(q || sector || country) && (
            <button className="go-btn go-btn-ghost" onClick={() => { setSearch(''); setParams({}, { replace: true }); }}>Clear</button>
          )}
        </div>
      </Card>

      <ErrorState error={error} onRetry={reload} />

      <Card flush>
        {loading && !data ? <div style={{ padding: '0 24px' }}><SkeletonRows rows={10} h={22} /></div> : data?.data?.length ? (
          <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
            <table className="go-table">
              <thead>
                <tr>
                  {COLS.map((c) => (
                    <th key={c.key} className={c.num ? 'num' : ''}>
                      <button onClick={() => clickSort(c.key)}>{c.label}{arrow(c.key)}</button>
                    </th>
                  ))}
                  <th>Assurance</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((c) => (
                  <tr key={c.id} className={`clickable${c.has_legacy_data && c.assurance_level === 'unknown' ? ' dim' : ''}`} onClick={() => navigate(`/companies/${c.slug}`)}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{c.name}</div>
                      <div className="small muted">{[c.sector, c.country].filter(Boolean).join(' · ') || '–'}</div>
                    </td>
                    <td className="num">{c.latest_year || '–'}</td>
                    <td className="num">{fmtCompact(c.scope1)}</td>
                    <td className="num">{fmtCompact(c.scope2)}</td>
                    <td className="num">{fmtCompact(c.scope3)}</td>
                    <td className="num">{c.disclosure_score ?? '–'}</td>
                    <td className="num" style={{ color: c.open_material_flags ? 'var(--down)' : undefined }}>{c.open_flags || '–'}</td>
                    <td>
                      {c.has_legacy_data && c.assurance_level === 'unknown' ? (
                        <span className="go-badge go-badge-medium" title="Imported from GreenOrb v3 without citations. Re-ingest the report to verify.">Unverified (v3)</span>
                      ) : c.latest_year ? <AssuranceBadge level={c.assurance_level} /> : c.report_count ? <span className="go-badge go-badge-info">queued</span> : <span className="muted small">–</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No companies match">
            {hasData === 'true' ? 'Try “All” to include companies without processed reports.' : 'Change the filters or ingest a report.'}
          </Empty>
        )}
      </Card>
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={(p) => update({ page: p })} />}
    </div>
  );
}
