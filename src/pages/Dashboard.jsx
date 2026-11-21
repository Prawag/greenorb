import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { useCrumbs } from '../components/Frame.jsx';
import { Empty, ErrorNotice, Notice, PageHead, Panel, Severity, Skel, SkelRows, StatusTag } from '../components/ui.jsx';
import { fmtCompact, fmtDate, FLAG_LABELS } from '../format.js';

function Strip({ t }) {
  const pct = t.metrics_extracted ? Math.round((t.metrics_grounded / t.metrics_extracted) * 100) : null;
  const cells = [
    ['Companies with data', fmtCompact(t.companies_with_data), `of ${fmtCompact(t.companies)} tracked`],
    ['Reports read', fmtCompact(t.reports_processed), t.reports_pending ? `${t.reports_pending} waiting to be read` : t.reports_failed ? `${t.reports_failed} could not be read` : 'None waiting'],
    ['Figures with a source page', fmtCompact(t.metrics_extracted), pct !== null ? `${pct}% matched word-for-word in the PDF` : 'Every figure links to its page'],
    ['Flags to review', fmtCompact(t.open_flags), `${t.open_material_flags} medium or high severity`],
  ];
  return (
    <div className="strip">
      {cells.map(([label, value, note]) => (
        <div key={label}>
          <div className="strip-label">{label}</div>
          <div className="strip-value">{value}</div>
          <div className="strip-note">{note}</div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  useCrumbs([{ label: 'Overview' }]);
  const { data, error, loading, reload } = useApi('/stats', { poll: 30000 });
  const health = useApi('/health').data;
  const navigate = useNavigate();
  const t = data?.totals;
  const maxSector = Math.max(1, ...(data?.sectors || []).map((s) => s.companies));

  return (
    <div className="content">
      <PageHead title="Overview" actions={<Link to="/ingest" className="btn btn-primary">Add a report</Link>}>
        Emissions and environmental figures taken from company sustainability reports, each traceable to the page it came from.
      </PageHead>

      <ErrorNotice error={error} onRetry={reload} />
      {health?.worker?.stalled && (
        <Notice tone="warn">{health.worker.queued} report(s) have waited more than two minutes. The report reader (worker) may not be running.</Notice>
      )}

      {loading && !data ? (
        <div className="strip">{[0, 1, 2, 3].map((i) => <div key={i}><Skel w="60%" /><Skel h={26} w="40%" style={{ marginTop: 8 }} /></div>)}</div>
      ) : t ? <Strip t={t} /> : null}

      {t && t.companies_with_data === 0 && (
        <Panel style={{ marginBottom: 20 }}>
          <Empty title="No reports have been read yet" action={<Link to="/ingest" className="btn btn-primary">Add your first report</Link>}>
            Upload a sustainability or BRSR report, or paste a link to one. GreenOrb extracts the emissions figures, links each one to its page, and flags anything that needs a second look.
          </Empty>
        </Panel>
      )}

      <div className="grid grid-main">
        <Panel title="Flags to review" hint="Most severe first" flush action={<Link to="/review" className="btn btn-sm btn-ghost">Open review queue</Link>}>
          {loading && !data ? <SkelRows rows={6} /> : data?.recent_flags?.length ? (
            <table className="table">
              <thead><tr><th>Severity</th><th>Company</th><th>Issue</th><th>Raised</th></tr></thead>
              <tbody>
                {data.recent_flags.map((f) => (
                  <tr key={f.id} className="link" onClick={() => navigate(f.report_id ? `/reports/${f.report_id}` : `/companies/${f.company_slug}`)}>
                    <td><Severity level={f.severity} /></td>
                    <td className="name">{f.company_name}</td>
                    <td>{f.title}</td>
                    <td className="nowrap muted">{fmtDate(f.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>No open flags. New ones appear here when a report is read.</Empty>}
        </Panel>

        <Panel title="Recently read" flush action={<Link to="/companies" className="btn btn-sm btn-ghost">All companies</Link>}>
          {loading && !data ? <SkelRows rows={6} /> : data?.recent_reports?.length ? (
            <table className="table">
              <tbody>
                {data.recent_reports.map((r) => (
                  <tr key={r.id} className="link" onClick={() => navigate(`/reports/${r.id}`)}>
                    <td>
                      <div className="name">{r.company_name}</div>
                      <div className="sub">{r.fiscal_year ? `FY${r.fiscal_year}` : 'Year not detected'}, {r.metric_count} figures</div>
                    </td>
                    <td style={{ textAlign: 'right' }}><StatusTag status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>Nothing read yet.</Empty>}
        </Panel>
      </div>

      <div className="grid grid-2 mt-20">
        <Panel title="Companies with data, by sector">
          {data?.sectors?.length ? (
            <div className="bars">
              {data.sectors.map((s) => (
                <Link key={s.sector} className="bar-row" to={s.sector === 'Unclassified' ? '/companies' : `/companies?sector=${encodeURIComponent(s.sector)}`}>
                  <span className="label" title={s.sector}>{s.sector}</span>
                  <span className="bar-track"><span className="bar-fill" style={{ width: `${(s.companies / maxSector) * 100}%` }} /></span>
                  <span className="num">{s.companies}</span>
                </Link>
              ))}
            </div>
          ) : <Empty>{loading ? 'Loading…' : 'No sector data yet.'}</Empty>}
        </Panel>
        <Panel title="Open flags by type" flush>
          {data?.open_flags_by_code?.length ? (
            <table className="table">
              <tbody>
                {data.open_flags_by_code.map((f) => (
                  <tr key={f.code} className="link" onClick={() => navigate(`/review?code=${f.code}`)}>
                    <td className="name">{FLAG_LABELS[f.code] || f.code}</td>
                    <td className="num">{f.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>{loading ? 'Loading…' : 'No open flags.'}</Empty>}
        </Panel>
      </div>
    </div>
  );
}
