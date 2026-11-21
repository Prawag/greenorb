import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, FileText } from 'lucide-react';
import { fileUrl } from '../api.js';
import { FLAG_LABELS, METHOD_LABELS } from '../format.js';

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

export function Card({ title, action, children, flush = false, style }) {
  return (
    <div className="go-card" style={style}>
      {(title || action) && (
        <div className="go-card-header">
          {title && <div className="go-card-title">{title}</div>}
          {action}
        </div>
      )}
      <div className={`go-card-content${flush ? ' flush' : ''}`}>{children}</div>
    </div>
  );
}

export function Stat({ value, label, sub, tone }) {
  return (
    <div className="stat-card">
      <div className="stat-value" style={tone ? { color: tone } : undefined}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', style }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }} />;
}

export function SkeletonRows({ rows = 6, h = 18 }) {
  return (
    <div className="stack" style={{ padding: '8px 0' }}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} h={h} w={`${92 - (i % 3) * 9}%`} />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="go-status go-status-error row" role="alert">
      <span>{error.message || String(error)}</span>
      <span className="spacer" />
      {onRetry && (
        <button className="go-btn go-btn-outline go-btn-sm" onClick={() => onRetry()}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      {title && <h3>{title}</h3>}
      <div>{children}</div>
    </div>
  );
}

export function Severity({ level }) {
  return <span className={`go-badge go-badge-${level}`}>{level}</span>;
}

export function FlagCode({ code }) {
  return <span className="go-badge">{FLAG_LABELS[code] || code}</span>;
}

export function Confidence({ value, method }) {
  const pct = Math.round((value ?? 0) * 100);
  return (
    <span className="conf" title={`${METHOD_LABELS[method] || method || ''} · confidence ${pct}%`}>
      <span className="conf-bar"><span style={{ width: `${pct}%` }} /></span>
      {pct}%
    </span>
  );
}

/** A page citation that opens the PDF at that page (stored file, or the original URL). */
export function Cite({ reportId, page, label }) {
  if (!reportId) return null;
  return (
    <a className="cite" href={fileUrl(reportId, page)} target="_blank" rel="noreferrer" title="Open the source PDF at this page">
      <FileText size={11} /> {label || (page ? `p.${page}` : 'PDF')}
    </a>
  );
}

export function ReportLink({ id, children }) {
  return (
    <Link to={`/reports/${id}`} className="cite">
      {children || `Report #${id}`}
    </Link>
  );
}

export function ExternalSource({ url }) {
  if (!url) return null;
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    /* keep raw */
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="row small" style={{ gap: 4, color: 'var(--body-text)' }}>
      <ExternalLink size={12} /> {host}
    </a>
  );
}

export function Pagination({ page, totalPages, onChange }) {
  if (!totalPages || totalPages <= 1) return null;
  const pages = [];
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  for (let p = start; p <= Math.min(totalPages, start + 4); p++) pages.push(p);
  return (
    <div className="row" style={{ justifyContent: 'center', marginTop: 20 }}>
      <button className="go-btn go-btn-ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>← Prev</button>
      {start > 1 && <span className="muted small">1 …</span>}
      {pages.map((p) => (
        <button key={p} className={`go-btn go-btn-sm ${p === page ? 'go-btn-primary' : 'go-btn-ghost'}`} onClick={() => onChange(p)}>
          {p}
        </button>
      ))}
      {pages[pages.length - 1] < totalPages && <span className="muted small">… {totalPages}</span>}
      <button className="go-btn go-btn-ghost" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next →</button>
    </div>
  );
}

export function ScoreRing({ value, size = 64 }) {
  if (value === null || value === undefined) return <span className="muted">–</span>;
  return (
    <div className="score-ring" style={{ '--v': value, width: size, height: size }} title="Disclosure score (0–100)">
      <span style={{ width: size - 14, height: size - 14 }}>{value}</span>
    </div>
  );
}

export function AssuranceBadge({ level, provider }) {
  const tone = { reasonable: 'success', limited: 'info', none: 'high', unknown: 'low' }[level] || 'low';
  const text = { reasonable: 'Reasonable assurance', limited: 'Limited assurance', none: 'Not assured', unknown: provider ? 'Assured (level n/a)' : 'Assurance unknown' }[level] || level;
  return (
    <span className={`go-badge go-badge-${tone}`} title={provider ? `Assurance provider: ${provider}` : undefined}>
      {text}{provider ? ` · ${provider}` : ''}
    </span>
  );
}
