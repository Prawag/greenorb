import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useReviewer } from './Reviewer.jsx';
import { FlagName, Severity, Source } from './ui.jsx';
import { fmtDate } from '../format.js';

export default function FlagItem({ flag, showCompany = false, onChange }) {
  const reviewer = useReviewer();
  const [note, setNote] = useState('');
  const [mode, setMode] = useState(null); // 'confirmed' | 'dismissed' while writing a note
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ev = flag.evidence || {};

  const review = async (status) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api(`/flags/${flag.id}/review`, { method: 'POST', body: { status, note: note || undefined } });
      setMode(null);
      setNote('');
      onChange?.(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`flag${flag.status !== 'open' ? ' reviewed' : ''}`}>
      <div className="flag-top">
        <Severity level={flag.severity} />
        <FlagName code={flag.code} />
        {flag.status === 'confirmed' && <span className="tag tag-high">Confirmed issue</span>}
        {flag.status === 'dismissed' && <span className="tag tag-ok">Dismissed</span>}
        {showCompany && <Link to={`/companies/${flag.company_slug}`} className="strong">{flag.company_name}</Link>}
        {flag.fiscal_year && <span>FY{flag.fiscal_year}</span>}
        <span className="spacer" />
        <span>Raised {fmtDate(flag.created_at)}</span>
      </div>
      <div className="flag-title">{flag.title}</div>
      {flag.detail && <div className="flag-detail">{flag.detail}</div>}
      {(ev.quote || (ev.page && flag.report_id)) && (
        <div>
          {ev.page && flag.report_id && <Source reportId={flag.report_id} page={ev.page} quote={ev.quote} label={`Evidence, p. ${ev.page}`} />}
          {ev.quote && <div className="quote">{ev.quote}</div>}
        </div>
      )}
      {flag.review_note && <div className="small muted">Reviewer note: {flag.review_note}</div>}
      <div className="flag-actions">
        {flag.report_id && <Link to={`/reports/${flag.report_id}`} className="btn btn-sm">Open report</Link>}
        <span className="spacer" />
        {reviewer.isReviewer ? (
          flag.status === 'open' ? (
            mode ? (
              <>
                <input className="input" style={{ maxWidth: 300, height: 28 }} placeholder="Add a note (optional)" value={note} onChange={(e) => setNote(e.target.value)} autoFocus aria-label="Review note" />
                <button className={`btn btn-sm${mode === 'confirmed' ? ' btn-danger' : ' btn-primary'}`} disabled={busy} onClick={() => review(mode)}>
                  {mode === 'confirmed' ? 'Confirm issue' : 'Dismiss flag'}
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setMode(null)}>Cancel</button>
              </>
            ) : (
              <>
                <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => setMode('confirmed')}>Confirm issue</button>
                <button className="btn btn-sm" disabled={busy} onClick={() => setMode('dismissed')}>Dismiss</button>
              </>
            )
          ) : (
            <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => review('open')}>Reopen</button>
          )
        ) : (
          flag.status === 'open' && <button className="btn btn-sm btn-ghost" onClick={reviewer.open}>Sign in to review</button>
        )}
      </div>
      {error && <div className="small" style={{ color: 'var(--red)' }}>{error}</div>}
    </article>
  );
}
