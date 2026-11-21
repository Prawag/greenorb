import React, { useRef, useState } from 'react';
import { api } from '../api.js';
import { Source } from './ui.jsx';

const SUGGESTIONS = ['What were Scope 1 and 2 emissions?', 'What climate targets are set?', 'Who assured the emissions data?', 'How much renewable energy is used?'];

export default function AskPanel({ company, reportId = null }) {
  const [log, setLog] = useState([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);

  const ask = async (question) => {
    const text = (question ?? q).trim();
    if (text.length < 3 || busy) return;
    setQ('');
    setBusy(true);
    setLog((l) => [...l, { q: text }]);
    try {
      const r = await api('/ask', { method: 'POST', body: { company, question: text, ...(reportId ? { report_id: Number(reportId) } : {}) } });
      setLog((l) => [...l.slice(0, -1), { q: text, a: r }]);
    } catch (e) {
      setLog((l) => [...l.slice(0, -1), { q: text, err: e.message }]);
    } finally {
      setBusy(false);
      setTimeout(() => end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {log.length === 0 && (
        <div className="small muted">
          Answers come only from this company's reports and cite the page they rely on.
          <div className="suggest">
            {SUGGESTIONS.map((s) => <button key={s} className="btn btn-sm" onClick={() => ask(s)}>{s}</button>)}
          </div>
        </div>
      )}
      {log.length > 0 && (
        <div className="ask-log" aria-live="polite">
          {log.map((m, i) => (
            <div key={i}>
              <div className="ask-q">{m.q}</div>
              {m.a && (
                <div className="ask-a">
                  {m.a.answer}
                  {m.a.sources?.length > 0 && (
                    <div className="ask-src">
                      <span className="muted">{m.a.mode === 'extractive' ? 'Most relevant passages' : 'Sources'}</span>
                      {m.a.sources.slice(0, m.a.mode === 'extractive' ? 4 : 6).map((s) => (
                        <div key={s.chunk_id}>
                          <span className="row" style={{ gap: 6 }}>
                            <span className="muted">[{s.n}]</span>
                            <Source reportId={s.report_id} page={s.page} label={`FY${s.fiscal_year ?? '?'} report, p. ${s.page}`} />
                          </span>
                          {m.a.mode === 'extractive' && <div className="quote">{s.excerpt}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {m.err && <div className="small" style={{ color: 'var(--red)' }}>{m.err}</div>}
              {!m.a && !m.err && <div className="ask-a muted">Reading the reports…</div>}
            </div>
          ))}
          <div ref={end} />
        </div>
      )}
      <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <input className="input" placeholder="Ask about this company's reports" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} aria-label="Question" />
        <button className="btn btn-primary" disabled={busy || q.trim().length < 3}>Ask</button>
      </form>
    </div>
  );
}
