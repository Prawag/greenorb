import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { api, fileUrl } from '../api.js';
import { useApi } from '../hooks/useApi.js';
import { useReviewer } from '../components/Reviewer.jsx';
import FlagItem from '../components/FlagItem.jsx';
import AskPanel from '../components/AskPanel.jsx';
import { AssuranceBadge, Card, Cite, Confidence, Empty, ErrorState, ExternalSource, PageHeader, Skeleton } from '../components/ui.jsx';
import { fmtDate, fmtFull, fmtUnit, METHOD_LABELS, timeAgo } from '../format.js';

export function JobProgress({ job }) {
  if (!job) return null;
  const logs = (job.logs || []).slice(-40);
  return (
    <div className="stack">
      <div className="row">
        <span className={`dot ${job.status === 'running' ? 'dot-pulse' : ''}`} style={{ background: job.status === 'failed' ? 'var(--down)' : job.status === 'succeeded' ? 'var(--up)' : 'var(--warn)' }} />
        <b style={{ textTransform: 'capitalize' }}>{job.status}</b>
        {job.stage && <span className="muted small">· {job.stage}</span>}
        {job.status === 'queued' && job.queue_position > 0 && <span className="muted small">· {job.queue_position} ahead in queue</span>}
        {job.attempts > 1 && <span className="muted small">· attempt {job.attempts}/{job.max_attempts}</span>}
        <span className="spacer" />
        <span className="mono small">{job.progress}%</span>
      </div>
      <div className="progress"><span style={{ width: `${job.progress}%` }} /></div>
      {job.error && <div className="go-status go-status-error small">{job.error}</div>}
      {logs.length > 0 && (
        <div className="log">
          {logs.map((l, i) => (
            <div key={i} className={l.level}>
              <span style={{ opacity: 0.55 }}>{new Date(l.at).toLocaleTimeString()} </span>{l.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricRow({ m, reportId, onChange }) {
  const reviewer = useReviewer();
  const [edit, setEdit] = useState(false);
  const [value, setValue] = useState(m.value ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const patch = async (body) => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/metrics/${m.id}`, { method: 'PATCH', body });
      setEdit(false);
      onChange();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const dim = m.status === 'rejected' || (!m.is_primary && m.value != null);
  return (
    <tr className={dim ? 'dim' : ''}>
      <td>
        <div style={{ fontWeight: 700 }}>{m.label}</div>
        <div className="small muted">
          FY{m.fiscal_year}{m.period_label && !/^FY\d{4}$/.test(m.period_label) ? ` (${m.period_label})` : ''}{m.boundary ? ` · ${m.boundary}` : ''}
          {m.is_primary && <span className="go-badge go-badge-dark" style={{ marginLeft: 6 }}>primary</span>}
        </div>
      </td>
      <td className="num">
        {edit ? (
          <form className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); patch({ value: Number(value) }); }}>
            <input className="go-input mono" style={{ width: 140, padding: '5px 8px', fontSize: 12 }} type="number" step="any" min="0" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            <button className="go-btn go-btn-outline go-btn-sm" disabled={busy || value === ''}>Save</button>
          </form>
        ) : (
          <>
            <div>{m.value == null ? <span className="muted">nil / “{m.raw_value}”</span> : `${fmtFull(m.value)} ${fmtUnit(m.unit)}`}</div>
            {m.raw_value && m.value != null && <div className="small muted">as printed: {m.raw_value}{m.raw_unit ? ` · ${m.raw_unit}` : ''}</div>}
          </>
        )}
      </td>
      <td style={{ maxWidth: 380 }}>
        {m.page ? <Cite reportId={reportId} page={m.page} /> : <span className="muted small">no page</span>}
        {m.quote && <div className="quote">{m.quote}</div>}
        {m.notes && <div className="small muted" style={{ marginTop: 4 }}>{m.notes}</div>}
      </td>
      <td>
        <div className="small">{METHOD_LABELS[m.method] || m.method}</div>
        <Confidence value={m.confidence} method={m.method} />
        {m.status !== 'extracted' && <div><span className={`go-badge ${m.status === 'verified' ? 'go-badge-success' : 'go-badge-high'}`}>{m.status}</span></div>}
      </td>
      {reviewer.isReviewer && (
        <td className="nowrap">
          <div className="row" style={{ gap: 4 }}>
            {m.status !== 'verified' && <button className="go-btn go-btn-ghost go-btn-sm" title="Mark as verified" disabled={busy} onClick={() => patch({ status: 'verified' })}><CheckCircle2 size={14} /></button>}
            {m.status !== 'rejected' && <button className="go-btn go-btn-ghost go-btn-sm" title="Reject this value" disabled={busy} onClick={() => patch({ status: 'rejected' })}><XCircle size={14} /></button>}
            {m.status === 'rejected' && <button className="go-btn go-btn-ghost go-btn-sm" disabled={busy} onClick={() => patch({ status: 'extracted' })}>Restore</button>}
            <button className="go-btn go-btn-ghost go-btn-sm" onClick={() => setEdit((v) => !v)}>{edit ? 'Cancel' : 'Correct'}</button>
          </div>
          {err && <div className="small" style={{ color: 'var(--down)' }}>{err}</div>}
        </td>
      )}
    </tr>
  );
}

export default function Report() {
  const { id } = useParams();
  const navigate = useNavigate();
  const reviewer = useReviewer();
  const [poll, setPoll] = useState(0);
  const { data, error, loading, reload } = useApi(`/reports/${id}`, { poll });
  const [showRejected, setShowRejected] = useState(false);
  const [actionErr, setActionErr] = useState(null);

  const active = Boolean(data && ['queued', 'processing'].includes(data.report.status));
  useEffect(() => setPoll(active ? 2500 : 0), [active]);

  if (loading && !data) return <div className="page"><Skeleton h={36} w="50%" /><div style={{ height: 20 }} /><Skeleton h={300} /></div>;
  if (error) return <div className="page"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return null;
  const { report, metrics, flags, job } = data;
  const visible = metrics.filter((m) => showRejected || m.status !== 'rejected');
  const rejectedCount = metrics.length - metrics.filter((m) => m.status !== 'rejected').length;

  const reprocess = async () => {
    setActionErr(null);
    try {
      await api(`/reports/${id}/reprocess`, { method: 'POST' });
      reload();
    } catch (e) {
      setActionErr(e.message);
    }
  };
  const remove = async () => {
    if (!window.confirm('Delete this report and all values and flags extracted from it?')) return;
    try {
      await api(`/reports/${id}`, { method: 'DELETE' });
      navigate(`/companies/${report.company.slug}`);
    } catch (e) {
      setActionErr(e.message);
    }
  };

  return (
    <div className="page">
      <Link to={`/companies/${report.company.slug}`} className="go-btn go-btn-ghost" style={{ marginBottom: 12 }}>← {report.company.name}</Link>
      <PageHeader
        title={report.title || (report.fiscal_year ? `${report.company.name} · FY${report.fiscal_year} report` : `${report.company.name} report`)}
        subtitle={[report.fiscal_year && `FY${report.fiscal_year}${report.period_label && !/^FY\d{4}$/.test(report.period_label) ? ` (${report.period_label})` : ''}`, report.page_count && `${report.page_count} pages`, report.processed_at && `processed ${timeAgo(report.processed_at)}`, `added ${fmtDate(report.created_at)}`].filter(Boolean).join(' · ')}
      >
        {(report.has_file || report.source_url) && <a className="go-btn go-btn-outline" href={fileUrl(report.id)} target="_blank" rel="noreferrer">Open PDF</a>}
        {reviewer.isReviewer && !active && report.status !== 'legacy' && <button className="go-btn go-btn-outline" onClick={reprocess}><RefreshCw size={14} /> Reprocess</button>}
        {reviewer.isReviewer && <button className="go-btn go-btn-danger" onClick={remove} title="Delete report"><Trash2 size={14} /></button>}
      </PageHeader>

      <div className="row section" style={{ marginTop: -16 }}>
        <span className={`go-badge ${report.status === 'processed' ? 'go-badge-success' : report.status === 'failed' ? 'go-badge-high' : report.status === 'legacy' ? 'go-badge-medium' : 'go-badge-info'}`}>{report.status}</span>
        {report.status === 'processed' && <AssuranceBadge level={report.assurance_level} provider={report.assurance_provider} />}
        {report.assurance_page && <Cite reportId={report.id} page={report.assurance_page} label={`assurance p.${report.assurance_page}`} />}
        {report.frameworks?.map((f) => <span key={f} className="go-badge">{f}</span>)}
        <ExternalSource url={report.source_url} />
        {report.file_name && <span className="small muted mono">{report.file_name}</span>}
      </div>

      {actionErr && <div className="section"><ErrorState error={{ message: actionErr }} /></div>}
      {report.status === 'legacy' && <div className="go-status go-status-warn section">These figures were imported from GreenOrb v3 without page citations. Ingest the original PDF to replace them with verified, cited values.</div>}
      {report.status === 'failed' && report.error && <div className="go-status go-status-error section">Processing failed: {report.error}</div>}
      {(active || (job && job.status !== 'succeeded' && report.status !== 'processed')) && <Card title="Processing" style={{ marginBottom: 24 }}><JobProgress job={job} /></Card>}

      <Card title={`Extracted values (${metrics.length - rejectedCount})`} flush style={{ marginBottom: 24 }} action={rejectedCount > 0 && (
        <button className="go-btn go-btn-ghost" onClick={() => setShowRejected((v) => !v)}>{showRejected ? 'Hide' : 'Show'} {rejectedCount} rejected</button>
      )}>
        {visible.length ? (
          <div className="table-wrap">
            <table className="go-table">
              <thead><tr><th>Metric</th><th className="num">Value</th><th>Evidence</th><th>Method</th>{reviewer.isReviewer && <th>Review</th>}</tr></thead>
              <tbody>{visible.map((m) => <MetricRow key={m.id} m={m} reportId={report.id} onChange={() => reload(true)} />)}</tbody>
            </table>
          </div>
        ) : <Empty>{active ? 'Values appear when processing finishes.' : 'No values were extracted from this report.'}</Empty>}
      </Card>

      <div className="grid-2">
        <Card title={`Flags (${flags.filter((f) => f.status === 'open').length} open)`}>
          {flags.length ? <div className="stack">{flags.map((f) => <FlagItem key={f.id} flag={{ ...f, report_id: report.id }} onChange={() => reload(true)} />)}</div> : <Empty>No flags for this report.</Empty>}
        </Card>
        <div className="stack" style={{ gap: 24 }}>
          {report.status === 'processed' && <Card title="Ask this report"><AskPanel company={report.company.slug} reportId={report.id} /></Card>}
          {report.stats && Object.keys(report.stats).length > 0 && (
            <Card title="How this report was read">
              <div className="stack small">
                <div className="row"><span className="muted">Table readings</span><span className="spacer" />{report.stats.table_readings}</div>
                <div className="row"><span className="muted">LLM readings (rejected as ungrounded)</span><span className="spacer" />{report.stats.llm_readings} ({report.stats.llm_rejected})</div>
                <div className="row"><span className="muted">Number format</span><span className="spacer" />{report.stats.locale === 'eu' ? 'European (1.234,5)' : 'International / Indian'}</div>
                <div className="row"><span className="muted">Year detected from</span><span className="spacer" />{report.stats.year_method}</div>
                {report.stats.ocr_pages > 0 && <div className="row"><span className="muted">OCR pages</span><span className="spacer" />{report.stats.ocr_pages}</div>}
                <div className="row"><span className="muted">Processing time</span><span className="spacer" />{report.stats.seconds}s</div>
                {report.stats.llm_notes?.map((n, i) => <div key={i} className="muted">{n}</div>)}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
