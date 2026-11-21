import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import { api, getToken, setToken } from '../api.js';

const ReviewerCtx = createContext({ isReviewer: false, enabled: false, open: () => {}, signOut: () => {} });

export function ReviewerProvider({ children }) {
  const [state, setState] = useState({ isReviewer: false, enabled: false, checked: false });
  const [dialog, setDialog] = useState(false);

  const check = useCallback(async () => {
    try {
      const r = await api('/auth/check');
      setState({ isReviewer: r.reviewer, enabled: r.enabled, checked: true });
    } catch {
      setState((s) => ({ ...s, checked: true }));
    }
  }, []);

  useEffect(() => {
    check();
    const on = () => check();
    window.addEventListener('greenorb:token', on);
    return () => window.removeEventListener('greenorb:token', on);
  }, [check]);

  const value = {
    ...state,
    open: () => setDialog(true),
    signOut: () => setToken(''),
  };
  return (
    <ReviewerCtx.Provider value={value}>
      {children}
      {dialog && <TokenDialog onClose={() => setDialog(false)} enabled={state.enabled} />}
    </ReviewerCtx.Provider>
  );
}

export const useReviewer = () => useContext(ReviewerCtx);

function TokenDialog({ onClose, enabled }) {
  const [token, setTok] = useState(getToken());
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setToken(token.trim());
    try {
      const r = await api('/auth/check');
      if (!r.reviewer) {
        setToken('');
        setError(r.enabled ? 'That token was not accepted.' : 'Reviewer actions are disabled on this server (ADMIN_TOKEN is not set).');
      } else onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={save}>
        <h3>Reviewer access</h3>
        <p className="small muted">
          Paste the reviewer token (the API's <span className="mono">ADMIN_TOKEN</span>). It is kept in this browser only and is
          required to submit reports, review flags and verify values.
        </p>
        {!enabled && <div className="go-status go-status-warn small">This server has no ADMIN_TOKEN configured.</div>}
        <div className="field">
          <label htmlFor="tok">Token</label>
          <input id="tok" className="go-input mono" type="password" autoFocus value={token} onChange={(e) => setTok(e.target.value)} />
        </div>
        {error && <div className="go-status go-status-error small">{error}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="go-btn go-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="go-btn go-btn-primary" disabled={!token.trim() || busy}>{busy ? 'Checking…' : 'Unlock'}</button>
        </div>
      </form>
    </div>
  );
}

export function ReviewerButton() {
  const r = useReviewer();
  if (r.isReviewer) {
    return (
      <button className="go-btn go-btn-outline go-btn-sm" onClick={r.signOut} title="Forget the reviewer token">
        <LogOut size={13} /> Reviewer
      </button>
    );
  }
  return (
    <button className="go-btn go-btn-outline go-btn-sm" onClick={r.open}>
      <KeyRound size={13} /> Reviewer sign-in
    </button>
  );
}
