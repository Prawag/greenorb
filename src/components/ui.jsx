import { Link } from 'react-router-dom';
import React from 'react';
import { AlertTriangle, CheckCircle2, FileText, Info, XCircle } from 'lucide-react';
import { FLAG_LABELS, METHOD_LABELS, fmtCompact, fmtFull, fmtUnit } from '../format.js';

export function PageHead({ title, children, actions }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Panel({ title, hint, action, children, flush = false, foot, style, className = '' }) {
  return (
    <section className={`panel ${className}`} style={style}>
      {(title || action) && (
        <div className="panel-head">
          <div>
            {title && <h2>{title}</h2>}
            {hint && <div className="hint">{hint}</div>}
          </div>
          {action}
        </div>
      )}
      <div className={`panel-body${flush ? ' flush' : ''}`}>{children}</div>
      {foot && <div className="panel-foot">{foot}</div>}
    </section>
  );
}

export function Skel({ h = 14, w = '100%', style }) {
  return <div className="skel" style={{ height: h, width: w, ...style }} />;
}

export function SkelRows({ rows = 6 }) {
  return (
    <div style={{ display: 'grid', gap: 14, padding: '16px 18px' }}>
      {Array.from({ length: rows }, (_, i) => <Skel key={i} w={`${90 - (i % 3) * 12}%`} />)}
    </div>
  );
}

const NOTICE_ICONS = { warn: AlertTriangle, error: XCircle, info: Info };
export function Notice({ tone = 'info', children, action }) {
  const Icon = NOTICE_ICONS[tone] || Info;
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon aria-hidden />
      <div>{children}</div>
      {action}
    </div>
  );
}

export function ErrorNotice({ error, onRetry }) {
  if (!error) return null;
  return (
    <Notice tone="error" action={onRetry && <button className="btn btn-sm" onClick={() => onRetry()}>Try again</button>}>
      {error.message || String(error)}
    </Notice>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      {title && <h3>{title}</h3>}
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

const SEV_LABEL = { high: 'High', medium: 'Medium', low: 'Low', info: 'Note' };
export function Severity({ level, withText = true }) {
  return (
    <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }} title={`${SEV_LABEL[level] || level} severity`}>
      <span className={`sev sev-${level}`} aria-hidden />
      {withText && <span>{SEV_LABEL[level] || level}</span>}
    </span>
  );
}

export function FlagName({ code }) {
  return <span className="tag">{FLAG_LABELS[code] || code}</span>;
}

export function StatusTag({ status }) {
  const tone = { processed: 'ok', succeeded: 'ok', failed: 'high', legacy: 'medium', queued: 'info', processing: 'info', running: 'info' }[status] || 'quiet';
  const label = { processed: 'Processed', succeeded: 'Done', failed: 'Failed', legacy: 'Imported (v3)', queued: 'Queued', processing: 'Processing', running: 'Processing' }[status] || status;
  return <span className={`tag tag-${tone}`}>{label}</span>;
}

/** How a figure was obtained, in plain words, with the confidence. */
export function Basis({ method, confidence, status }) {
  if (status === 'verified') return <span className="basis"><b>Checked by a reviewer</b></span>;
  if (method === 'legacy') return <span className="basis" style={{ color: 'var(--amber)' }}>Unverified import from v3</span>;
  const label = { table: 'Read from table', llm: 'Read by AI, found on page', 'table+llm': 'Table and AI agree', manual: 'Entered manually' }[method] || METHOD_LABELS[method] || method;
  return <span className="basis" title="How sure GreenOrb is that this reading is correct"><b>{label}</b> ({Math.round((confidence ?? 0) * 100)}% confidence)</span>;
}

/** Link to the evidence view for a page; the quote (if any) is highlighted there. */
export function evidenceHref(reportId, page, quote) {
  const q = quote ? `?q=${encodeURIComponent(String(quote).replace(/\s+/g, ' ').trim().slice(0, 300))}` : '';
  return `/reports/${reportId}/pages/${page}${q}`;
}

/** Provenance mark: the page a figure came from; opens the page text with the quote highlighted. */
export function Source({ reportId, page, method, label, quote }) {
  if (!reportId) return null;
  if (!page) return <span className="src none">{method === 'legacy' ? 'No source' : 'No page'}</span>;
  return (
    <Link className={`src${method === 'legacy' ? ' weak' : ''}`} to={evidenceHref(reportId, page, quote)} title="Show this page with the quoted text highlighted">
      <FileText aria-hidden /> {label || `p. ${page}`}
    </Link>
  );
}

export function Figure({ value, unit, compact = true, raw }) {
  if (value === null || value === undefined) {
    return raw ? <span className="muted" title={`Printed as “${raw}”`}>Reported as nil</span> : <span className="faint">Not reported</span>;
  }
  return (
    <span className="figure">
      <span className="strong">{compact ? fmtCompact(value) : fmtFull(value)}</span>
      <span className="figure-unit">{fmtUnit(unit)}</span>
    </span>
  );
}

export function Assurance({ level, provider }) {
  if (level === 'reasonable') return <span className="tag tag-ok"><CheckCircle2 size={13} aria-hidden /> Reasonable assurance{provider ? `, ${provider}` : ''}</span>;
  if (level === 'limited') return <span className="tag tag-ok"><CheckCircle2 size={13} aria-hidden /> Limited assurance{provider ? `, ${provider}` : ''}</span>;
  if (level === 'none') return <span className="tag tag-high">Not externally assured</span>;
  return <span className="tag tag-quiet">{provider ? `Assured by ${provider}, level not stated` : 'Assurance not found'}</span>;
}

export function Pager({ page, totalPages, total, limit, onChange }) {
  if (!total) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <div className="pager">
      <span>{from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}</span>
      <span className="row">
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
        <span>Page {page} of {totalPages}</span>
        <button className="btn btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next</button>
      </span>
    </div>
  );
}
