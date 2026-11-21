import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, RotateCcw, Trash2, X } from 'lucide-react';
import { api, fileUrl } from '../api.js';
import { useApi } from '../hooks/useApi.js';
import { useCrumbs } from '../components/Frame.jsx';
import { useReviewer } from '../components/Reviewer.jsx';
import FlagItem from '../components/FlagItem.jsx';
import AskPanel from '../components/AskPanel.jsx';
import { Assurance, Basis, Empty, ErrorNotice, Notice, Panel, Skel, Source, StatusTag } from '../components/ui.jsx';
import { fmtDate, fmtFull, fmtUnit, timeAgo } from '../format.js';

const ORDER = ['ghg_scope1', 'ghg_scope2_location', 'ghg_scope2_market', 'ghg_scope2', 'ghg_scope3', 'ghg_scope12_total', 'energy_total', 'energy_renewable_pct', 'water_withdrawal', 'water_consumption', 'waste_generated'];
const STAGES = { starting: 'Starting', fetch: 'Downloading', parse: 'Reading pages', extract: 'Extracting figures', validate: 'Checking for issues', index: 'Indexing text', store: 'Saving', done: 'Finished' };

export function JobProgress({ job }) {
  if (!job) return null;
  const logs = (job.logs || []).slice(-30);
  const label = job.status === 'queued' ? (job.queue_position > 0 ? `Waiting, ${job.queue_position} ahead in the queue` : 'Waiting for the report reader')
    : job.status === 'running' ? STAGES[job.stage] || 'Processing'
    : job.status === 'succeeded' ? 'Finished' : job.status === 'failed' ? 'Could not read this report' : job.status;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="row">
        <span className="strong">{label}</span>
        {job.attempts > 1 && <span className="small muted">attempt {job.attempts} of {job.max_attempts}</span>}
        <span className="spacer" />
        <span className="small muted">{job.progress}%</span>
      </div>
      <div className="progress" role="progressbar" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${job.progress}%` }} /></div>
      {job.error && <Notice tone="error">{job.error}</Notice>}
      {logs.length > 0 && (
        <details>
          <summary className="small muted" style={{ cursor: 'pointer' }}>Processing log</summary>
          <div className="log" style={{ marginTop: 8 }}>
            {logs.map((l, i) => <div key={i} className={l.level}><time>{new Date(l.at).toLocaleTimeString()}</time>{l.message}</div>)}
          </div>
        </details>
      )}
    </div>
  );
}

function FigureRow({ m, reportId, reviewer, onChange }) {
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
        <div className="name">{m.label}</div>
        <div className="sub">
          FY{m.fiscal_year}{m.period_label && !/^FY\d{4}$/.test(m.period_label) ? ` (${m.period_label})` : ''}{m.boundary ? `, ${m.boundary}` : ''}
        </div>
        {!m.is_primary && m.status !== 'rejected' && m.value != null && <div className="sub">Alternative reading, not used</div>}
        {m.status === 'rejected' && <div className="sub" style={{ color: 'var(--red)' }}>Rejected</div>}
      </td>
      <td className="num">
        {edit ? (
          <form className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); patch({ value: Number(value) }); }}>
            <input className="input" style={{ width: 130, height: 28, textAlign: 'right' }} type="number" step="any" min="0" value={value} onChange={(e) => setValue(e.target.value)} autoFocus aria-label="Corrected value" />
            <button className="btn btn-sm btn-primary" disabled={busy || value === ''}>Save</button>
          </form>
        ) : (
          <>
            <div className="strong">{m.value == null ? <span className="muted">Reported as nil</span> : <>{fmtFull(m.value)} <span className="figure-unit">{fmtUnit(m.unit)}</span></>}</div>
            {m.raw_value && <div className="sub">printed as {m.raw_value}{m.raw_unit ? ` ${m.raw_unit}` : ''}</div>}
          </>
        )}
      </td>
      <td style={{ maxWidth: 420 }}>
        <Source reportId={reportId} page={m.page} method={m.method} quote={m.quote} />
        {m.quote && <div className="quote">{m.quote}</div>}
        {m.notes && <div className="sub" style={{ marginTop: 4 }}>{m.notes}</div>}
      </td>
      <td><Basis method={m.method} confidence={m.confidence} status={m.status} /></td>
      {reviewer && (
        <td className="nowrap">
          <div className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
            {m.status !== 'verified' && m.value != null && <button className="btn btn-sm btn-ghost icon-btn" title="Mark as checked" aria-label="Mark as checked" disabled={busy} onClick={() => patch({ status: 'verified' })}><Check /></button>}
            {m.status !== 'rejected' && <button className="btn btn-sm btn-ghost icon-btn" title="Reject this reading" aria-label="Reject" disabled={busy} onClick={() => patch({ status: 'rejected' })}><X /></button>}
            {m.status === 'rejected' && <button className="btn btn-sm btn-ghost icon-btn" title="Restore" aria-label="Restore" disabled={busy} onClick={() => patch({ status: 'extracted' })}><RotateCcw /></button>}
            <button className="btn btn-sm btn-ghost" onClick={() => setEdit((v) => !v)}>{edit ? 'Cancel' : 'Correct'}</button>
          </div>
          {err && <div className="small" style={{ color: 'var(--red)' }}>{err}</div>}
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
  const r = data?.report;
  // The evidence view opens at the first page a figure was read from.
  const firstPage = Math.min(...(data?.metrics || []).map((m) => m.page).filter(Boolean), r?.assurance_page || Infinity);
  const title = r ? r.title || (r.fiscal_year ? `FY${r.fiscal_year} report` : 'Report') : '…';
  useCrumbs([{ to: '/companies', label: 'Companies' }, ...(r ? [{ to: `/companies/${r.company.slug}`, label: r.company.name }] : []), { label: title }]);

  if (loading && !data) return <div className="content"><Skel h={28} w="45%" /><Skel h={300} style={{ marginTop: 24 }} /></div>;
  if (error) return <div className="content"><ErrorNotice error={error} onRetry={reload} /></div>;
  if (!data) return null;
  const { metrics, flags, job } = data;
  const rejected = metrics.filter((m) => m.status === 'rejected').length;
  const visible = metrics
    .filter((m) => showRejected || m.status !== 'rejected')
    .sort((a, b) => ORDER.indexOf(a.metric) - ORDER.indexOf(b.metric) || b.fiscal_year - a.fiscal_year || (b.is_primary - a.is_primary));
  const openFlags = flags.filter((f) => f.status === 'open').length;

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
    if (!window.confirm('Delete this report, and every figure and flag taken from it? This cannot be undone.')) return;
    try {
      await api(`/reports/${id}`, { method: 'DELETE' });
      navigate(`/companies/${r.company.slug}`);
    } catch (e) {
      setActionErr(e.message);
    }
  };
  const s = r.stats || {};

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>{r.company.name}: {title}</h1>
          <div className="facts">
            <StatusTag status={r.status} />
            {r.status === 'processed' && <Assurance level={r.assurance_level} provider={r.assurance_provider} />}
            {r.assurance_page && <Source reportId={r.id} page={r.assurance_page} label={`Assurance statement, p. ${r.assurance_page}`} />}
            {r.page_count && <span><b>{r.page_count}</b> pages</span>}
            {r.frameworks?.length > 0 && <span>Frameworks <b>{r.frameworks.join(', ')}</b></span>}
            <span>Added <b>{fmtDate(r.created_at)}</b></span>
            {r.processed_at && <span>Read <b>{timeAgo(r.processed_at)}</b></span>}
          </div>
          {r.file_name && <div className="small faint" style={{ marginTop: 6 }}>{r.file_name}</div>}
        </div>
        <div className="page-actions">
          {r.status === 'processed' && (
            <Link className="btn" to={`/reports/${r.id}/pages/${Number.isFinite(firstPage) ? firstPage : 1}`}>Read the pages</Link>
          )}
          {(r.has_file || r.source_url) && <a className="btn" href={fileUrl(r.id)} target="_blank" rel="noreferrer">Open PDF</a>}
          {reviewer.isReviewer && !active && r.status !== 'legacy' && <button className="btn" onClick={reprocess}><RotateCcw aria-hidden /> Read again</button>}
          {reviewer.isReviewer && <button className="btn btn-danger" onClick={remove}><Trash2 aria-hidden /> Delete</button>}
        </div>
      </div>

      {actionErr && <Notice tone="error">{actionErr}</Notice>}
      {r.status === 'legacy' && <Notice tone="warn">These figures were imported from GreenOrb v3 without page sources. Add the original PDF to replace them with sourced figures.</Notice>}
      {r.status === 'failed' && r.error && <Notice tone="error">This report could not be read: {r.error}</Notice>}
      {(active || (job && job.status !== 'succeeded' && r.status !== 'processed')) && (
        <Panel title="Reading this report" style={{ marginBottom: 20 }}><JobProgress job={job} /></Panel>
      )}

      <Panel
        title="Extracted figures"
        hint="Each value with the page and the exact text it was read from. Greyed rows are alternative readings that are not used."
        flush
        action={rejected > 0 && <button className="btn btn-sm btn-ghost" onClick={() => setShowRejected((v) => !v)}>{showRejected ? 'Hide' : 'Show'} {rejected} rejected</button>}
      >
        {visible.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Metric</th><th className="num">Value</th><th>Source</th><th>How it was read</th>{reviewer.isReviewer && <th>Review</th>}</tr></thead>
              <tbody>{visible.map((m) => <FigureRow key={m.id} m={m} reportId={r.id} reviewer={reviewer.isReviewer} onChange={() => reload(true)} />)}</tbody>
            </table>
          </div>
        ) : <Empty>{active ? 'Figures appear here when reading finishes.' : 'No figures were found in this report. They may only appear in charts or images.'}</Empty>}
      </Panel>

      <div className="grid grid-2 mt-20">
        <Panel title="Flags" hint={openFlags ? `${openFlags} open` : 'Nothing open'} flush>
          {flags.length ? flags.map((f) => <FlagItem key={f.id} flag={{ ...f, report_id: r.id }} onChange={() => reload(true)} />) : <Empty>No flags for this report.</Empty>}
        </Panel>
        <div style={{ display: 'grid', gap: 20, alignContent: 'start' }}>
          {r.status === 'processed' && <Panel title="Ask about this report"><AskPanel company={r.company.slug} reportId={r.id} /></Panel>}
          {Object.keys(s).length > 0 && (
            <Panel title="How this report was read" flush>
              <table className="table">
                <tbody>
                  <tr><td>Figures read from tables</td><td className="num">{s.table_readings}</td></tr>
                  <tr><td>Figures read by AI</td><td className="num">{s.llm_readings ?? 0}</td></tr>
                  <tr><td>AI readings rejected (not found on page)</td><td className="num">{s.llm_rejected ?? 0}</td></tr>
                  <tr><td>Number format</td><td className="num">{s.locale === 'eu' ? 'European (1.234,5)' : 'International / Indian'}</td></tr>
                  <tr><td>Report year taken from</td><td className="num">{{ tables: 'Table headings', brsr_statement: 'BRSR statement', cover_pages: 'Cover pages', hint: 'Submission form' }[s.year_method] || s.year_method}</td></tr>
                  {s.ocr_pages > 0 && <tr><td>Scanned pages read with OCR</td><td className="num">{s.ocr_pages}</td></tr>}
                  <tr><td>Time taken</td><td className="num">{s.seconds}s</td></tr>
                </tbody>
              </table>
              {s.llm_notes?.length > 0 && <div className="panel-foot">{s.llm_notes.join(' ')}</div>}
            </Panel>
          )}
        </div>
      </div>
      {r.source_url && <p className="small muted mt-20">Original source: <a href={r.source_url} target="_blank" rel="noreferrer">{r.source_url}</a></p>}
    </div>
  );
}
