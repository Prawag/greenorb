import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FileUp, Link2 } from 'lucide-react';
import { api } from '../api.js';
import { useApi } from '../hooks/useApi.js';
import { useCrumbs } from '../components/Frame.jsx';
import { useReviewer } from '../components/Reviewer.jsx';
import { Empty, Notice, PageHead, Panel, StatusTag } from '../components/ui.jsx';
import { JobProgress } from './Report.jsx';
import { timeAgo } from '../format.js';

function CompanyInput({ value, onChange, onPick }) {
  const [open, setOpen] = useState(false);
  const { data } = useApi(value.trim().length >= 2 ? `/companies/suggest?q=${encodeURIComponent(value.trim())}` : null);
  return (
    <div style={{ position: 'relative' }}>
      <input id="company" className="input" placeholder="Start typing, e.g. Tata Steel" value={value} autoComplete="off" required
        onChange={(e) => { onChange(e.target.value); setOpen(true); }} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && data?.length > 0 && (
        <div className="menu">
          {data.map((c) => (
            <button type="button" key={c.id} className="menu-item" onMouseDown={() => { onPick(c); setOpen(false); }}>
              <span>{c.name}</span><span className="small muted">{c.country || ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Ingest() {
  useCrumbs([{ label: 'Add a report' }]);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const reviewer = useReviewer();
  const health = useApi('/health').data;
  const recent = useApi('/jobs?limit=8', { poll: 5000 });
  const [mode, setMode] = useState('upload');
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');
  const [company, setCompany] = useState('');
  const [slug, setSlug] = useState(params.get('company') || '');
  const [country, setCountry] = useState('');
  const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [over, setOver] = useState(false);
  const fileInput = useRef(null);
  const job = useApi(result?.job_id ? `/jobs/${result.job_id}` : null, { poll: result && !['succeeded', 'failed'].includes(result.status) ? 2000 : 0 });
  const preset = useApi(slug && !company ? `/companies/${slug}` : null).data;

  useEffect(() => { if (preset?.company && !company) setCompany(preset.company.name); }, [preset]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (job.data && result && job.data.status !== result.status) setResult((r) => ({ ...r, status: job.data.status })); }, [job.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxMb = health?.features?.max_upload_mb || 40;
  const canSubmit = reviewer.isReviewer || health?.features?.public_ingest;
  const pickFile = (f) => {
    setError(null);
    if (!f) return;
    if (f.type && f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) return setError('Choose a PDF file. Other formats aren’t supported.');
    if (f.size > maxMb * 1024 * 1024) return setError(`This file is ${(f.size / 1048576).toFixed(0)} MB; the limit is ${maxMb} MB.`);
    setFile(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    const form = new FormData();
    if (slug && preset?.company?.name === company) form.set('company_slug', slug);
    else form.set('company_name', company.trim());
    if (country.trim()) form.set('country', country.trim());
    if (year) form.set('fiscal_year', year);
    if (mode === 'upload') form.set('file', file);
    else form.set('url', url.trim());
    try {
      const r = await api('/ingest', { method: 'POST', form });
      setResult(r);
      recent.reload(true);
    } catch (err) {
      setError(err.status === 401 ? 'Sign in as a reviewer to add reports.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  const ready = company.trim().length >= 2 && (mode === 'upload' ? !!file : /^https?:\/\//i.test(url.trim()));

  return (
    <div className="content">
      <PageHead title="Add a report">
        Upload a sustainability, BRSR or annual report, or paste a link to one. GreenOrb reads the emissions, energy, water and waste figures and links each one to its page.
      </PageHead>
      {health?.worker?.stalled && <Notice tone="warn">Reports have waited over two minutes. The report reader (worker) may not be running.</Notice>}
      {!canSubmit && <Notice tone="info" action={<button className="btn btn-sm" onClick={reviewer.open}>Reviewer sign-in</button>}>Adding reports requires reviewer access.</Notice>}

      <div className="grid grid-main">
        <div style={{ display: 'grid', gap: 20, alignContent: 'start' }}>
          <Panel title="Report">
            <form style={{ display: 'grid', gap: 16 }} onSubmit={submit}>
              <div className="segmented" role="group" aria-label="Source" style={{ justifySelf: 'start' }}>
                <button type="button" className={mode === 'upload' ? 'on' : ''} aria-pressed={mode === 'upload'} onClick={() => setMode('upload')}><FileUp size={14} aria-hidden /> Upload a PDF</button>
                <button type="button" className={mode === 'url' ? 'on' : ''} aria-pressed={mode === 'url'} onClick={() => setMode('url')}><Link2 size={14} aria-hidden /> Paste a link</button>
              </div>
              {mode === 'upload' ? (
                <div className={`dropzone${over ? ' over' : ''}`} role="button" tabIndex={0}
                  onClick={() => fileInput.current?.click()}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
                  onDrop={(e) => { e.preventDefault(); setOver(false); pickFile(e.dataTransfer.files?.[0]); }}>
                  <input ref={fileInput} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
                  <FileUp aria-hidden />
                  {file ? <><div className="strong">{file.name}</div><div className="small muted">{(file.size / 1048576).toFixed(1)} MB. Click to choose a different file.</div></>
                    : <><div className="strong">Drop a PDF here, or click to choose one</div><div className="small muted">Up to {maxMb} MB</div></>}
                </div>
              ) : (
                <div className="field">
                  <label htmlFor="url">Link to the report</label>
                  <input id="url" className="input" type="url" placeholder="https://www.company.com/sustainability-report-2024.pdf" value={url} onChange={(e) => setUrl(e.target.value)} />
                  <span className="hint">A direct PDF link works best. If you paste a web page, GreenOrb follows the link on it that looks most like a report.</span>
                </div>
              )}
              <div className="field">
                <label htmlFor="company">Company</label>
                <CompanyInput value={company} onChange={(v) => { setCompany(v); setSlug(''); }} onPick={(c) => { setCompany(c.name); setSlug(c.slug); }} />
                <span className="hint">{slug ? 'This report will be added to the existing company.' : 'Pick an existing company from the list, or type a new name to create one.'}</span>
              </div>
              <div className="grid grid-2" style={{ gap: 16 }}>
                <div className="field">
                  <label htmlFor="country">Country <span className="muted">(optional)</span></label>
                  <input id="country" className="input" placeholder="e.g. India" value={country} onChange={(e) => setCountry(e.target.value)} disabled={!!slug} />
                </div>
                <div className="field">
                  <label htmlFor="year">Reporting year <span className="muted">(optional)</span></label>
                  <input id="year" className="input" type="number" min="1990" max="2100" placeholder="Detected automatically" value={year} onChange={(e) => setYear(e.target.value)} />
                </div>
              </div>
              {error && <Notice tone="error">{error}</Notice>}
              <div className="row">
                <button className="btn btn-primary" disabled={!ready || busy || !canSubmit}>{busy ? 'Adding…' : 'Add report'}</button>
                <span className="small muted">Reading usually takes under a minute once it starts.</span>
              </div>
            </form>
          </Panel>

          {result && (
            <Panel title={result.duplicate ? 'This report was added before' : 'Reading the report'} action={<Link className="btn btn-sm" to={`/reports/${result.report_id}`}>Open report</Link>}>
              {result.duplicate && <Notice tone="info">The same document is already in GreenOrb for {result.company.name}. Showing its status instead of adding a copy.</Notice>}
              {job.data ? <JobProgress job={job.data} /> : <div className="small muted">Checking status…</div>}
              {job.data?.status === 'succeeded' && (
                <div className="row" style={{ marginTop: 14 }}>
                  <button className="btn btn-primary" onClick={() => navigate(`/reports/${result.report_id}`)}>View extracted figures</button>
                  <Link className="btn" to={`/companies/${result.company.slug}`}>Go to {result.company.name}</Link>
                </div>
              )}
            </Panel>
          )}
        </div>

        <div style={{ display: 'grid', gap: 20, alignContent: 'start' }}>
          <Panel title="What happens next">
            <ol className="steps">
              <li><div><b>Read.</b> Pages are rebuilt into rows and columns so each number stays with its year heading.</div></li>
              <li><div><b>Extract.</b> Scope 1, 2 and 3, energy, water and waste are read from the tables.{health?.features?.llm?.length ? ' An AI model reads the key pages too.' : ''}</div></li>
              <li><div><b>Check.</b> Every AI reading must appear word-for-word on its page, or it’s rejected. Units are converted by fixed rules.</div></li>
              <li><div><b>Flag.</b> Missing assurance, totals that don’t add up and large swings are raised for review.</div></li>
            </ol>
          </Panel>
          <Panel title="Recent activity" flush>
            {recent.data?.data?.length ? (
              <table className="table">
                <tbody>
                  {recent.data.data.map((j) => (
                    <tr key={j.id} className={j.report_id ? 'link' : ''} onClick={() => j.report_id && navigate(`/reports/${j.report_id}`)}>
                      <td>
                        <div className="name">{j.company_name}</div>
                        <div className="sub">{timeAgo(j.updated_at)}</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>{j.status === 'running' ? <span className="tag tag-info">{j.progress}%</span> : <StatusTag status={j.status} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty>No reports added yet.</Empty>}
          </Panel>
        </div>
      </div>
    </div>
  );
}
