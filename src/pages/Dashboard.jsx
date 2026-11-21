import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { Card, Empty, ErrorState, FlagCode, PageHeader, Severity, Skeleton, SkeletonRows, Stat } from '../components/ui.jsx';
import { ReviewerButton } from '../components/Reviewer.jsx';
import { fmtCompact, FLAG_LABELS, timeAgo } from '../format.js';

export default function Dashboard() {
  const { data, error, loading, reload } = useApi('/stats', { poll: 30000 });
  const health = useApi('/health').data;
  const navigate = useNavigate();
  const t = data?.totals;
  const pct = t && t.metrics_extracted ? Math.round((t.metrics_grounded / t.metrics_extracted) * 100) : null;
  const maxSector = Math.max(1, ...(data?.sectors || []).map((s) => s.companies));

  return (
    <div className="page">
      <PageHeader
        title="ESG Intelligence"
        subtitle="Emissions and environmental figures read from sustainability reports. Every number links to the page it came from, and integrity flags show where a report needs a second look."
      >
        <ReviewerButton />
        <Link to="/ingest" className="go-btn go-btn-primary">Ingest a report</Link>
      </PageHeader>

      <ErrorState error={error} onRetry={reload} />

      {health?.worker?.stalled && (
        <div className="go-status go-status-warn section">
          {health.worker.queued} report(s) have been waiting for more than two minutes. Is the worker running?
          (<span className="mono">python -m greenorb_worker run</span>)
        </div>
      )}

      <div className="grid-stats section">
        {loading && !data ? (
          Array.from({ length: 4 }, (_, i) => <div key={i} className="stat-card"><Skeleton h={34} w="50%" /><Skeleton h={12} w="70%" style={{ marginTop: 10 }} /></div>)
        ) : t ? (
          <>
            <Stat value={fmtCompact(t.companies_with_data)} label="Companies with data" sub={`${fmtCompact(t.companies)} companies tracked`} />
            <Stat value={fmtCompact(t.reports_processed)} label="Reports processed" sub={t.reports_pending ? `${t.reports_pending} in the queue` : t.reports_failed ? `${t.reports_failed} failed` : 'Queue empty'} />
            <Stat value={fmtCompact(t.metrics_extracted)} label="Cited metrics" sub={pct !== null ? `${pct}% found verbatim on the cited page` : 'Extracted from source PDFs'} />
            <Stat value={fmtCompact(t.open_flags)} label="Open integrity flags" sub={`${t.open_material_flags} medium or high`} tone={t.open_material_flags ? 'var(--down)' : undefined} />
          </>
        ) : null}
      </div>

      {t && t.companies === 0 && (
        <Card style={{ marginBottom: 24 }}>
          <Empty title="No reports yet">
            Ingest a sustainability report (PDF upload or link) to see cited metrics and integrity flags here.
            <div style={{ marginTop: 16 }}><Link to="/ingest" className="go-btn go-btn-primary">Ingest your first report</Link></div>
          </Empty>
        </Card>
      )}

      <div className="grid-2 section">
        <Card title="Open flags" action={<Link to="/review" className="go-btn go-btn-ghost">Review queue →</Link>} flush>
          {loading && !data ? <div style={{ padding: '0 24px' }}><SkeletonRows rows={5} /></div> : (
            data?.recent_flags?.length ? (
              <table className="go-table">
                <tbody>
                  {data.recent_flags.map((f) => (
                    <tr key={f.id} className="clickable" onClick={() => navigate(f.report_id ? `/reports/${f.report_id}` : `/companies/${f.company_slug}`)}>
                      <td style={{ width: 70 }}><Severity level={f.severity} /></td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{f.company_name}</div>
                        <div className="small muted">{f.title}</div>
                      </td>
                      <td className="small muted nowrap">{timeAgo(f.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty>No open flags.</Empty>
          )}
        </Card>

        <Card title="Recently processed" action={<Link to="/companies" className="go-btn go-btn-ghost">Directory →</Link>} flush>
          {loading && !data ? <div style={{ padding: '0 24px' }}><SkeletonRows rows={5} /></div> : (
            data?.recent_reports?.length ? (
              <table className="go-table">
                <tbody>
                  {data.recent_reports.map((r) => (
                    <tr key={r.id} className="clickable" onClick={() => navigate(`/reports/${r.id}`)}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{r.company_name}</div>
                        <div className="small muted">{r.fiscal_year ? `FY${r.fiscal_year}` : 'Year pending'} · {r.metric_count} metrics</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`go-badge ${r.status === 'processed' ? 'go-badge-success' : r.status === 'failed' ? 'go-badge-high' : 'go-badge-info'}`}>{r.status}</span>
                        <div className="small muted" style={{ marginTop: 4 }}>{timeAgo(r.processed_at || r.created_at)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty>Nothing processed yet.</Empty>
          )}
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Companies with data, by sector">
          {data?.sectors?.length ? (
            <div className="stack">
              {data.sectors.map((s) => (
                <Link key={s.sector} to={s.sector === 'Unclassified' ? '/companies?has_data=true' : `/companies?sector=${encodeURIComponent(s.sector)}&has_data=true`} className="row" style={{ textDecoration: 'none', gap: 12 }}>
                  <span className="small" style={{ width: 150, textAlign: 'right', color: 'var(--body-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.sector}</span>
                  <span className="bar-track"><span className="bar-fill" style={{ display: 'block', width: `${(s.companies / maxSector) * 100}%` }} /></span>
                  <span className="mono small" style={{ width: 32, textAlign: 'right' }}>{s.companies}</span>
                </Link>
              ))}
            </div>
          ) : <Empty>{loading ? 'Loading…' : 'No sector data yet.'}</Empty>}
        </Card>
        <Card title="What the open flags are about">
          {data?.open_flags_by_code?.length ? (
            <div className="stack">
              {data.open_flags_by_code.map((f) => (
                <Link key={f.code} to={`/review?code=${f.code}`} className="row" style={{ textDecoration: 'none', justifyContent: 'space-between' }}>
                  <FlagCode code={f.code} />
                  <span className="small muted">{FLAG_LABELS[f.code] ? '' : f.code}</span>
                  <span className="mono small">{f.n}</span>
                </Link>
              ))}
            </div>
          ) : <Empty>{loading ? 'Loading…' : 'No open flags.'}</Empty>}
        </Card>
      </div>
    </div>
  );
}
