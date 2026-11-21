import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { ClipboardCheck, FileUp, Globe2, LayoutGrid, Search, Table2 } from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import { ReviewerButton } from './Reviewer.jsx';
import { timeAgo } from '../format.js';

const CrumbCtx = createContext({ set: () => {} });

/** Pages declare their breadcrumb trail: useCrumbs([{ to: '/companies', label: 'Companies' }, { label: 'Tata Steel' }]) */
export function useCrumbs(crumbs) {
  const { set } = useContext(CrumbCtx);
  const key = JSON.stringify(crumbs);
  useEffect(() => {
    set(crumbs);
    document.title = `${crumbs[crumbs.length - 1]?.label || 'GreenOrb'} · GreenOrb`;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

function CompanySearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const ref = useRef(null);
  const term = q.trim();
  const { data } = useApi(term.length >= 2 ? `/companies/suggest?q=${encodeURIComponent(term)}` : null);
  const items = term.length >= 2 ? data || [] : [];

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (slug) => {
    setQ('');
    setOpen(false);
    ref.current?.blur();
    navigate(slug ? `/companies/${slug}` : `/companies?q=${encodeURIComponent(term)}&has_data=all`);
  };

  return (
    <div className="topbar-search">
      <Search aria-hidden />
      <input
        ref={ref}
        value={q}
        placeholder="Find a company  ( / )"
        aria-label="Find a company"
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter' && term) go(items[active]?.slug);
          if (e.key === 'Escape') { setOpen(false); ref.current?.blur(); }
        }}
      />
      {open && term.length >= 2 && (
        <div className="menu" role="listbox">
          {items.map((c, i) => (
            <button key={c.id} className={`menu-item${i === active ? ' on' : ''}`} onMouseDown={() => go(c.slug)}>
              <span>{c.name}</span><span className="muted small">{c.country || ''}</span>
            </button>
          ))}
          <button className={`menu-item${active === items.length ? ' on' : ''}`} onMouseDown={() => go(null)}>
            <span className="muted">Search all companies for “{term}”</span>
          </button>
        </div>
      )}
    </div>
  );
}

function SystemStatus() {
  const { data, error } = useApi('/health', { poll: 60000 });
  if (error) return <div><span className="status-dot" style={{ background: '#e5675c' }} />API unreachable</div>;
  if (!data) return <div><span className="status-dot" style={{ background: '#8fa1b5' }} />Checking status</div>;
  const w = data.worker || {};
  const queueText = w.running ? `${w.running} report processing` : w.queued ? `${w.queued} report${w.queued === 1 ? '' : 's'} queued` : 'Queue empty';
  return (
    <>
      <div><span className="status-dot" style={{ background: w.stalled ? '#e0a33a' : '#5fbf8f' }} />{w.stalled ? 'Worker not responding' : 'All systems normal'}</div>
      <div>{queueText}</div>
      {w.last_seen && <div>Last report read {timeAgo(w.last_seen)}</div>}
    </>
  );
}

export function Frame({ children }) {
  const [crumbs, setCrumbs] = useState([]);
  const flags = useApi('/flags?limit=1', { poll: 60000 }).data;
  const open = flags?.total || 0;
  const nav = [
    { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
    { to: '/companies', label: 'Companies', icon: Table2 },
    { to: '/review', label: 'Review queue', icon: ClipboardCheck, count: open },
    { to: '/ingest', label: 'Add a report', icon: FileUp },
    { to: '/globe', label: 'Map', icon: Globe2 },
  ];
  return (
    <CrumbCtx.Provider value={{ set: setCrumbs }}>
      <div className="shell">
        <aside className="sidebar">
          <Link to="/" className="brand" aria-label="GreenOrb home">
            <span className="brand-mark" aria-hidden />
            <span><span className="brand-name">GreenOrb</span><span className="brand-sub">Emissions disclosure data</span></span>
          </Link>
          <nav aria-label="Main" className="nav-list">
            {nav.map(({ to, label, icon: Icon, end, count }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                <Icon aria-hidden strokeWidth={1.8} />
                {label}
                {count > 0 && <span className="nav-count" aria-label={`${count} open`}>{count > 999 ? '999+' : count}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-foot"><SystemStatus /></div>
        </aside>
        <div className="main">
          <header className="topbar">
            <nav className="crumbs" aria-label="Breadcrumb">
              {crumbs.map((c, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="sep" aria-hidden>/</span>}
                  {c.to && i < crumbs.length - 1 ? <Link to={c.to}>{c.label}</Link> : <span className="here">{c.label}</span>}
                </React.Fragment>
              ))}
            </nav>
            <CompanySearch />
            <ReviewerButton />
          </header>
          {children}
        </div>
      </div>
    </CrumbCtx.Provider>
  );
}
