import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { KeyRound, UserCheck } from 'lucide-react';
import { Notice } from './ui.jsx';
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
        setError(r.enabled ? 'That token was not accepted. Check for extra spaces and try again.' : 'Reviewer sign-in is turned off on this server (ADMIN_TOKEN is not set).');
      } else onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={save} aria-labelledby="rv-title">
        <div className="modal-body">
          <h2 id="rv-title">Sign in as reviewer</h2>
          <p className="small muted">
            Reviewers can add reports, confirm or dismiss flags, and correct figures. Paste the reviewer token your
            administrator gave you. It stays in this browser only.
          </p>
          {!enabled && <Notice tone="warn">Reviewer sign-in is turned off on this server.</Notice>}
          <div className="field">
            <label htmlFor="tok">Reviewer token</label>
            <input id="tok" className="input" type="password" autoFocus autoComplete="off" value={token} onChange={(e) => setTok(e.target.value)} />
          </div>
          {error && <Notice tone="error">{error}</Notice>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!token.trim() || busy}>{busy ? 'Checking…' : 'Sign in'}</button>
        </div>
      </form>
    </div>
  );
}

export function ReviewerButton() {
  const r = useReviewer();
  if (r.isReviewer) {
    return (
      <button className="btn btn-sm" onClick={r.signOut} title="Click to sign out of reviewer mode on this browser">
        <UserCheck aria-hidden /> <span className="rv-label">Signed in as reviewer</span>
      </button>
    );
  }
  return (
    <button className="btn btn-sm" onClick={r.open} aria-label="Reviewer sign-in">
      <KeyRound aria-hidden /> <span className="rv-label">Reviewer sign-in</span>
    </button>
  );
}
