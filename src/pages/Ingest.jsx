import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileUp, Link2 } from 'lucide-react';
import { api } from '../api.js';
import { useApi } from '../hooks/useApi.js';
import { ReviewerButton, useReviewer } from '../components/Reviewer.jsx';
import { Card, PageHeader } from '../components/ui.jsx';
import { JobProgress } from './Report.jsx';
import { timeAgo } from '../format.js';

const STEPS = [
  ['Fetch', 'The PDF is downloaded (public URLs only) or taken from your upload.'],
  ['Read layout', 'Pages are rebuilt into rows and columns so table cells stay aligned with their year headers.'],
  ['Extract', 'A deterministic table parser reads Scope 1/2/3, energy, water and waste. If an LLM is configured, it reads the key pages too.'],
  ['Ground', 'Every LLM value must appear verbatim on the cited page, or it is rejected. Units are converted by fixed rules, never by the model.'],
  ['Validate', 'Assurance, totals, year-on-year swings, restatements, net-zero targets and offsets are checked and raised as flags.'],
  ['Index', 'Report text is split into passages for Ask-the-report with page citations.'],
];

function CompanyInput({ value, onChange, onPick }) {
  const [open, setOpen] = useState(false);
  const { data } = useApi(value.trim().length >= 2 ? `/companies/suggest?q=${encodeURIComponent(value.trim())}` : null);
  return (
    <div style={{ position: 'relative' }}>
      <input
        id="company"
        className="go-input"
        placeholder="e.g. Tata Steel Ltd"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
        required
      />
      {open && data?.length > 0 && (
        <div className="go-card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4, padding: 6 }}>
          {data.map((c) => (
            <button type="button" key={c.id} className="go-btn go-btn-ghost" style={{ width: '100%', justifyContent: 'space-between' }} onMouseDown={() => { onPick(c); setOpen(false); }}>
              <span>{c.name}</span><span className="small muted">{c.country || ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Ingest() {
  const [params] = useSearchParams();
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
  useEffect(() => {
    if (preset?.company && !company) setCompany(preset.company.name);
  }, [preset]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (job.data && result && job.data.status !== result.status) setResult((r) => ({ ...r, status: job.data.status }));
  }, [job.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxMb = health?.features?.max_upload_mb || 40;
  const canIngest = reviewer.isReviewer || health?.features?.public_ingest;
  const pickFile = (f) => {
    setError(null);
    if (!f) return;
    if (f.type && f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) return setError('Please choose a PDF file.');
    if (f.size > maxMb * 1024 * 1024) return setError(`The file is larger than ${maxMb} MB.`);
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
      setError(err.status === 401 ? 'Sign in as a reviewer to submit reports.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  const ready = company.trim().length >= 2 && (mode === 'upload' ? !!file : /^https?:\/\//i.test(url.trim()));

  return (
    <div className="page">
      <PageHeader title="Ingest a report" subtitle="Upload a sustainability, BRSR or annual report PDF, or paste a link to one. GreenOrb extracts the figures with page citations and flags anything that needs review.">
        <ReviewerButton />
      </PageHeader>

      {health?.worker?.stalled && (
        <div className="go-status go-status-warn section">Reports have been waiting in the queue for over two minutes. Check that the worker is running (<span className="mono">python -m greenorb_worker run</span>).</div>
      )}

      <div className="grid-21">
        <div className="stack" style={{ gap: 24 }}>
          <Card>
            {!canIngest && (
              <div className="go-status go-status-warn" style={{ marginBottom: 16 }}>
                Submitting reports needs the reviewer token. <button className="go-btn go-btn-ghost go-btn-sm" onClick={reviewer.open}>Sign in</button>
              </div>
            )}
            <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
              <div className="seg" role="group" aria-label="Source">
                <button type="button" className={mode === 'upload' ? 'on' : ''} onClick={() => setMode('upload')}><FileUp size={13} /> Upload PDF</button>
                <button type="button" className={mode === 'url' ? 'on' : ''} onClick={() => setMode('url')}><Link2 size={13} /> From URL</button>
              </div>
              {mode === 'upload' ? (
                <div
                  className={`dropzone${over ? ' over' : ''}`}
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                  onDragLeave={() => setOver(false)}
                  onDrop={(e) => { e.preventDefault(); setOver(false); pickFile(e.dataTransfer.files?.[0]); }}
                  role="button"
                  tabIndex={0}
                >
                  <input ref={fileInput} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
                  {file ? <><b>{file.name}</b><div className="small muted">{(file.size / 1048576).toFixed(1)} MB · click to change</div></> : <><b>Drop a PDF here or click to choose</b><div className="small muted">Up to {maxMb} MB</div></>}
                </div>
              ) : (
                <div className="field">
                  <label htmlFor="url">Report URL</label>
                  <input id="url" className="go-input" type="url" placeholder="https://company.com/sustainability-report-2024.pdf" value={url} onChange={(e) => setUrl(e.target.value)} />
                  <span className="hint">A direct PDF link works best. If you paste a web page, GreenOrb follows its most report-like PDF link.</span>
                </div>
              )}
              <div className="grid-2" style={{ gap: 16 }}>
                <div className="field">
                  <label htmlFor="company">Company</label>
                  <CompanyInput value={company} onChange={(v) => { setCompany(v); setSlug(''); }} onPick={(c) => { setCompany(c.name); setSlug(c.slug); }} />
                  <span className="hint">{slug ? 'Adding to an existing company.' : 'A new company is created if no match is found.'}</span>
                </div>
                <div className="grid-2" style={{ gap: 12 }}>
                  <div className="field">
                    <label htmlFor="country">Country</label>
                    <input id="country" className="go-input" placeholder="optional" value={country} onChange={(e) => setCountry(e.target.value)} disabled={!!slug} />
                  </div>
                  <div className="field">
                    <label htmlFor="year">Fiscal year</label>
                    <input id="year" className="go-input" type="number" min="1990" max="2100" placeholder="auto" value={year} onChange={(e) => setYear(e.target.value)} />
                  </div>
                </div>
              </div>
              {error && <div className="go-status go-status-error">{error}</div>}
              <div className="row">
                <button className="go-btn go-btn-primary" disabled={!ready || busy || !canIngest}>{busy ? 'Submitting…' : 'Extract metrics'}</button>
                <span className="small muted">Takes roughly 5–60 seconds per report once the worker picks it up.</span>
              </div>
            </form>
          </Card>

          {result && (
            <Card title={result.duplicate ? 'Already ingested' : 'Processing'} action={<Link className="go-btn go-btn-ghost" to={`/reports/${result.report_id}`}>Open report →</Link>}>
              {result.duplicate && <div className="go-status go-status-warn" style={{ marginBottom: 12 }}>This document was already submitted for {result.company.name}. Showing the existing report's status.</div>}
              {job.data ? <JobProgress job={job.data} /> : <div className="muted small">Waiting for status…</div>}
              {job.data?.status === 'succeeded' && (
                <div className="row" style={{ marginTop: 12 }}>
                  <Link className="go-btn go-btn-primary" to={`/reports/${result.report_id}`}>See extracted values</Link>
                  <Link className="go-btn go-btn-outline" to={`/companies/${result.company.slug}`}>Company profile</Link>
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="stack" style={{ gap: 24 }}>
          <Card title="What happens">
            <div className="steps">
              {STEPS.map(([t, d], i) => <div key={t} className="step"><span className="step-n">{i + 1}</span><div><b>{t}.</b> {d}</div></div>)}
            </div>
            {health && (
              <div className="small muted" style={{ marginTop: 14 }}>
                LLM on this server: {health.features.llm.length ? health.features.llm.map((p) => p.name).join(' → ') : 'none (table parser only)'}
              </div>
            )}
          </Card>
          <Card title="Recent jobs" flush>
            {recent.data?.data?.length ? (
              <table className="go-table">
                <tbody>
                  {recent.data.data.map((j) => (
                    <tr key={j.id}>
                      <td>
                        {j.report_id ? <Link to={`/reports/${j.report_id}`} style={{ fontWeight: 700 }}>{j.company_name}</Link> : j.company_name}
                        <div className="small muted">{j.stage || j.status} · {timeAgo(j.updated_at)}</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`go-badge ${j.status === 'succeeded' ? 'go-badge-success' : j.status === 'failed' ? 'go-badge-high' : 'go-badge-info'}`}>{j.status === 'running' ? `${j.progress}%` : j.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="empty">No jobs yet.</div>}
          </Card>
        </div>
      </div>
    </div>
  );
}
