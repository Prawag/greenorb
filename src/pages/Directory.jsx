import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import { useCrumbs } from '../components/Frame.jsx';
import { Assurance, Empty, ErrorNotice, PageHead, Pager, Panel, SkelRows } from '../components/ui.jsx';
import { fmtCompact } from '../format.js';

const COLS = [
  { key: 'name', label: 'Company' },
  { key: 'year', label: 'Latest year', num: true },
  { key: 'scope1', label: 'Scope 1', num: true },
  { key: 'scope2', label: 'Scope 2', num: true },
  { key: 'scope3', label: 'Scope 3', num: true },
  { key: 'disclosure', label: 'Disclosure', num: true },
  { key: 'flags', label: 'Open flags', num: true },
];

export default function Directory() {
  useCrumbs([{ label: 'Companies' }]);
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
  const limit = 25;

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v === '' || v == null ? next.delete(k) : next.set(k, v)));
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };
  useEffect(() => setSearch(q), [q]);
  useEffect(() => {
    const t = setTimeout(() => search !== q && update({ q: search }), 350);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const qs = new URLSearchParams({ page, limit, sort });
  if (order) qs.set('order', order);
  if (q) qs.set('q', q);
  if (sector) qs.set('sector', sector);
  if (country) qs.set('country', country);
  qs.set('has_data', hasData);
  const { data, error, loading, reload } = useApi(`/companies?${qs}`);
  const facets = useApi('/companies/facets').data;

  const dir = (key) => order || (key === 'name' ? 'asc' : 'desc');
  const clickSort = (key) => (sort === key ? update({ order: dir(key) === 'asc' ? 'desc' : 'asc' }) : update({ sort: key, order: '' }));
  const filtered = q || sector || country;

  return (
    <div className="content">
      <PageHead title="Companies">
        Latest reported figures per company. Emissions are in tonnes of CO₂-equivalent; open a company to see the source page for each figure.
      </PageHead>
      <ErrorNotice error={error} onRetry={reload} />

      <Panel flush>
        <div className="toolbar">
          <input className="input" style={{ maxWidth: 280 }} placeholder="Filter by name or ticker" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Filter companies" />
          <select className="select" value={sector} onChange={(e) => update({ sector: e.target.value })} aria-label="Sector">
            <option value="">All sectors</option>
            {facets?.sectors?.map((s) => <option key={s.value} value={s.value}>{s.value} ({s.count})</option>)}
          </select>
          <select className="select" value={country} onChange={(e) => update({ country: e.target.value })} aria-label="Country">
            <option value="">All countries</option>
            {facets?.countries?.map((c) => <option key={c.value} value={c.value}>{c.value} ({c.count})</option>)}
          </select>
          <div className="segmented" role="group" aria-label="Show">
            {[['true', 'With figures'], ['false', 'Awaiting reports'], ['all', 'All']].map(([v, l]) => (
              <button key={v} className={hasData === v ? 'on' : ''} aria-pressed={hasData === v} onClick={() => update({ has_data: v })}>{l}</button>
            ))}
          </div>
          {filtered && <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setParams({ has_data: hasData }, { replace: true }); }}>Clear filters</button>}
          <span className="spacer" />
          {data && <span className="small muted">{data.total.toLocaleString()} {data.total === 1 ? 'company' : 'companies'}</span>}
        </div>

        {loading && !data ? <SkelRows rows={10} /> : data?.data?.length ? (
          <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
            <table className="table">
              <thead>
                <tr>
                  {COLS.map((c) => (
                    <th key={c.key} className={c.num ? 'num' : ''} aria-sort={sort === c.key ? (dir(c.key) === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button className={sort === c.key ? 'sorted' : ''} onClick={() => clickSort(c.key)}>
                        {c.label}
                        {sort === c.key && (dir(c.key) === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      </button>
                    </th>
                  ))}
                  <th>Assurance</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((c) => {
                  const legacyOnly = c.has_legacy_data && c.assurance_level === 'unknown';
                  return (
                    <tr key={c.id} className="link" onClick={() => navigate(`/companies/${c.slug}`)}>
                      <td>
                        <div className="name">{c.name}</div>
                        <div className="sub">{[c.sector, c.country].filter(Boolean).join(', ') || 'Sector and country not set'}</div>
                      </td>
                      <td className="num">{c.latest_year ? `FY${c.latest_year}` : <span className="faint">–</span>}</td>
                      <td className="num">{fmtCompact(c.scope1)}</td>
                      <td className="num">{fmtCompact(c.scope2)}</td>
                      <td className="num">{fmtCompact(c.scope3)}</td>
                      <td className="num">{c.disclosure_score ?? <span className="faint">–</span>}</td>
                      <td className="num" style={{ color: c.open_material_flags ? 'var(--red)' : undefined }}>{c.open_flags || <span className="faint">–</span>}</td>
                      <td>
                        {legacyOnly ? <span className="tag tag-medium" title="Imported from GreenOrb v3 without page sources">Unverified import</span>
                          : c.latest_year ? <Assurance level={c.assurance_level} />
                          : c.report_count ? <span className="tag tag-info">Report queued</span>
                          : <span className="faint">–</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No companies match">
            {hasData === 'true' ? 'Only companies with extracted figures are shown. Choose “All” to include companies still waiting for a report.' : 'Change the filters, or add a report for a new company.'}
          </Empty>
        )}
        {data && <Pager page={data.page} totalPages={data.totalPages} total={data.total} limit={limit} onChange={(p) => update({ page: p })} />}
      </Panel>
    </div>
  );
}
