import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Building2, ChevronRight, ClipboardCheck, FileUp, Globe2, Search } from 'lucide-react';
import { Logo } from './Logo.jsx';
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
    const last = crumbs[crumbs.length - 1]?.label;
    document.title = last && last !== 'Overview' ? `${last} – GreenOrb` : 'GreenOrb – ESG report intelligence';
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
        placeholder="Search companies"
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
      <kbd className="kbd" aria-hidden>/</kbd>
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
  let tone = 'idle';
  let text = 'Checking status';
  let detail = '';
  if (error) { tone = 'bad'; text = 'API unreachable'; }
  else if (data) {
    const w = data.worker || {};
    tone = w.stalled ? 'warn' : 'ok';
    text = w.stalled ? 'Reader not responding' : w.running ? 'Reading a report' : w.queued ? `${w.queued} report${w.queued === 1 ? '' : 's'} queued` : 'All systems normal';
    detail = [w.last_seen ? `Last report read ${timeAgo(w.last_seen)}` : '', data.database_size_mb != null ? `Database ${data.database_size_mb} MB` : '']
      .filter(Boolean).join('. ');
  }
  return (
    <span className="status-chip" title={detail || text} role="status">
      <span className={`status-dot ${tone}`} aria-hidden />{text}
    </span>
  );
}

export function Frame({ children }) {
  const [crumbs, setCrumbs] = useState([]);
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  const flags = useApi('/flags?limit=1', { poll: 60000 }).data;
  const open = flags?.total || 0;
  const nav = [
    { to: '/', label: 'Overview', icon: Globe2, end: true },
    { to: '/companies', label: 'Companies', icon: Building2 },
    { to: '/review', label: 'Review queue', icon: ClipboardCheck, count: open },
    { to: '/ingest', label: 'Add a report', icon: FileUp },
  ];
  return (
    <CrumbCtx.Provider value={{ set: setCrumbs }}>
      <div className={`app${isHome ? ' home' : ''}`}>
        <div className="backdrop" aria-hidden />
        <header className="topbar">
          <Link to="/" className="brand" aria-label="GreenOrb overview"><Logo height={30} /></Link>
          <CompanySearch />
          <div className="topbar-right">
            <SystemStatus />
            <ReviewerButton />
          </div>
        </header>
        <nav className="rail" aria-label="Main">
          {nav.map(({ to, label, icon: Icon, end, count }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} title={label}>
              <Icon aria-hidden strokeWidth={1.9} />
              <span className="label">{label}</span>
              {count > 0 && <span className="nav-count" aria-label={`${count} open`}>{count > 99 ? '99+' : count}</span>}
            </NavLink>
          ))}
        </nav>
        <main className="main">
          {!isHome && crumbs.length > 1 && (
            <div className="content">
              <nav className="crumbs" aria-label="Breadcrumb">
                {crumbs.map((c, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <ChevronRight className="sep" aria-hidden size={14} />}
                    {c.to && i < crumbs.length - 1 ? <Link to={c.to}>{c.label}</Link> : <span className="here">{c.label}</span>}
                  </React.Fragment>
                ))}
              </nav>
            </div>
          )}
          {children}
        </main>
      </div>
    </CrumbCtx.Provider>
  );
}
