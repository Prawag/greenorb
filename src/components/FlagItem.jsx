import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useReviewer } from './Reviewer.jsx';
import { Cite, FlagCode, Severity } from './ui.jsx';
import { timeAgo } from '../format.js';

export default function FlagItem({ flag, showCompany = false, onChange }) {
  const reviewer = useReviewer();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [noting, setNoting] = useState(null);
  const ev = flag.evidence || {};

  const review = async (status) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api(`/flags/${flag.id}/review`, { method: 'POST', body: { status, note: note || undefined } });
      setNoting(null);
      setNote('');
      onChange?.(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`flag flag-${flag.severity}${flag.status !== 'open' ? ' reviewed' : ''}`}>
      <div className="row">
        <Severity level={flag.severity} />
        <FlagCode code={flag.code} />
        {flag.status !== 'open' && <span className={`go-badge ${flag.status === 'confirmed' ? 'go-badge-high' : 'go-badge-success'}`}>{flag.status}</span>}
        <span className="spacer" />
        {showCompany && <Link to={`/companies/${flag.company_slug}`} className="small" style={{ fontWeight: 700 }}>{flag.company_name}</Link>}
        <span className="small muted">{flag.fiscal_year ? `FY${flag.fiscal_year} · ` : ''}{timeAgo(flag.created_at)}</span>
      </div>
      <div className="flag-title">{flag.title}</div>
      {flag.detail && <div className="flag-detail">{flag.detail}</div>}
      {(ev.quote || ev.page) && (
        <div>
          {ev.page && flag.report_id && <Cite reportId={flag.report_id} page={ev.page} />}
          {ev.quote && <div className="quote">{ev.quote}</div>}
        </div>
      )}
      {flag.review_note && <div className="small muted">Reviewer note: {flag.review_note}</div>}
      <div className="row" style={{ marginTop: 4 }}>
        {flag.report_id && <Link to={`/reports/${flag.report_id}`} className="go-btn go-btn-ghost go-btn-sm">Open report</Link>}
        <span className="spacer" />
        {reviewer.isReviewer ? (
          flag.status === 'open' ? (
            noting ? (
              <>
                <input className="go-input" style={{ maxWidth: 280, padding: '6px 10px', fontSize: 13 }} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
                <button className="go-btn go-btn-outline go-btn-sm" disabled={busy} onClick={() => review(noting)}>Save {noting === 'confirmed' ? 'confirm' : 'dismiss'}</button>
                <button className="go-btn go-btn-ghost go-btn-sm" onClick={() => setNoting(null)}>Cancel</button>
              </>
            ) : (
              <>
                <button className="go-btn go-btn-danger go-btn-sm" disabled={busy} onClick={() => setNoting('confirmed')}>Confirm issue</button>
                <button className="go-btn go-btn-outline go-btn-sm" disabled={busy} onClick={() => setNoting('dismissed')}>Dismiss</button>
              </>
            )
          ) : (
            <button className="go-btn go-btn-ghost go-btn-sm" disabled={busy} onClick={() => review('open')}>Reopen</button>
          )
        ) : (
          flag.status === 'open' && <button className="go-btn go-btn-ghost go-btn-sm" onClick={reviewer.open}>Sign in to review</button>
        )}
      </div>
      {error && <div className="go-status go-status-error small">{error}</div>}
    </div>
  );
}
