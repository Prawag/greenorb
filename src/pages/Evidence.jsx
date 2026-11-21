import React, { useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ExternalLink, FileText } from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import { fileUrl } from '../api.js';
import { useCrumbs } from '../components/Frame.jsx';
import { Basis, Empty, ErrorNotice, Figure, Notice, PageHead, Panel, Skel, evidenceHref } from '../components/ui.jsx';

/**
 * Find where a quote sits in the page text. Quotes come from table rows, so cells may be joined by
 * " | " while the page text has spaces or line breaks. Returns [start, end] ranges in the page text.
 */
export function locate(text, quote) {
  if (!text || !quote) return [];
  // Searchable copy of the page: lowercase, separators collapsed, with a map back to original offsets.
  const map = [];
  let norm = '';
  let space = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (/[\s|]/.test(ch)) {
      if (!space && norm) { norm += ' '; map.push(i); }
      space = true;
    } else {
      norm += ch.toLowerCase();
      map.push(i);
      space = false;
    }
  }
  const q = quote.replace(/^[.…\s]+|[.…\s]+$/g, '').replace(/[\s|]+/g, ' ').toLowerCase().trim();
  const span = (a, b) => [map[a], map[Math.min(b, map.length) - 1] + 1];
  if (q.length >= 6) {
    const at = norm.indexOf(q);
    if (at >= 0) return [span(at, at + q.length)];
    // Long quotes: take the longest leading part that is on the page.
    for (let len = Math.min(q.length - 1, 160); len >= 24; len -= 8) {
      const k = norm.indexOf(q.slice(0, len));
      if (k >= 0) return [span(k, k + len)];
    }
  }
  // Fall back to the figures in the quote (e.g. "8,56,434"), wherever they appear on the page.
  const out = [];
  const numbers = [...new Set(q.match(/\d[\d,.]{2,}\d/g) || [])];
  for (const n of numbers) {
    let from = 0;
    for (;;) {
      const k = norm.indexOf(n, from);
      if (k < 0) break;
      out.push(span(k, k + n.length));
      from = k + n.length;
    }
  }
  return out.sort((a, b) => a[0] - b[0]);
}

function Highlighted({ text, ranges }) {
  const parts = [];
  let last = 0;
  ranges.forEach(([a, b], i) => {
    if (a < last) return;
    if (a > last) parts.push(text.slice(last, a));
    parts.push(<mark key={i} className={i === 0 ? 'first' : ''}>{text.slice(a, b)}</mark>);
    last = b;
  });
  parts.push(text.slice(last));
  return <div className="page-text">{parts}</div>;
}

export default function Evidence() {
  const { id, page } = useParams();
  const [params] = useSearchParams();
  const q = params.get('q') || '';
  const navigate = useNavigate();
  const { data, error, reload } = useApi(`/reports/${id}/pages/${page}`);
  const r = data?.report;
  useCrumbs([
    { to: '/companies', label: 'Companies' },
    ...(r ? [{ to: `/companies/${r.company.slug}`, label: r.company.name }, { to: `/reports/${r.id}`, label: `FY${r.fiscal_year ?? '?'} report` }] : []),
    { label: `Page ${page}` },
  ]);

  const ranges = useMemo(() => locate(data?.text, q), [data?.text, q]);
  const body = useRef(null);
  useEffect(() => {
    const m = body.current?.querySelector('mark');
    if (m) m.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [ranges]);

  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (e.key === 'ArrowLeft' && data?.prev_page) navigate(`/reports/${id}/pages/${data.prev_page}`);
      if (e.key === 'ArrowRight' && data?.next_page) navigate(`/reports/${id}/pages/${data.next_page}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, id, navigate]);

  if (error) return <div className="content"><ErrorNotice error={error} onRetry={reload} /></div>;
  const pdf = r && (r.has_file || r.source_url);

  return (
    <div className="content">
      <PageHead
        title={r ? `${r.company.name}, page ${page}` : `Page ${page}`}
        actions={
          <div className="segmented" role="group" aria-label="Pages">
            <button disabled={!data?.prev_page} onClick={() => navigate(`/reports/${id}/pages/${data.prev_page}`)} aria-label="Previous page"><ChevronLeft /> {data?.prev_page ? `p. ${data.prev_page}` : 'Start'}</button>
            <button disabled={!data?.next_page} onClick={() => navigate(`/reports/${id}/pages/${data.next_page}`)} aria-label="Next page">{data?.next_page ? `p. ${data.next_page}` : 'End'} <ChevronRight /></button>
          </div>
        }
      >
        {r ? `${r.title || r.file_name || 'Report'}${r.fiscal_year ? `, FY${r.fiscal_year}` : ''}. The text below is what GreenOrb read from this page.` : 'Loading the page…'}
      </PageHead>

      <div className="grid grid-main">
        <Panel
          title={q ? (ranges.length ? 'Quoted text is highlighted' : 'Quoted text') : 'Page text'}
          hint={q && !ranges.length && data ? 'The exact wording wasn’t found in the text layer, which can happen with tables. The quote is shown below.' : undefined}
        >
          {q && !ranges.length && data && <div className="quote" style={{ marginTop: 0, marginBottom: 14 }}>{q}</div>}
          <div ref={body}>
            {!data ? <><Skel h={14} /><Skel h={14} style={{ marginTop: 10 }} /><Skel h={14} w="70%" style={{ marginTop: 10 }} /></>
              : data.has_text ? <Highlighted text={data.text} ranges={ranges} />
              : <Empty title="No text was kept for this page">It may be an image without a text layer, or the report was read before page text was stored. Read the report again to rebuild it.</Empty>}
          </div>
        </Panel>

        <div className="grid">
          <Panel title="Figures read from this page" flush>
            {!data ? <div className="panel-body"><Skel h={60} /></div> : data.metrics.length ? (
              <table className="table">
                <tbody>
                  {data.metrics.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <div className="name">{m.label}</div>
                        <div className="sub">FY{m.fiscal_year}</div>
                        <Basis method={m.method} confidence={m.confidence} status={m.status} />
                      </td>
                      <td className="num">
                        <Figure value={m.value} unit={m.unit} raw={m.raw_value} />
                        {m.quote && (
                          <div style={{ marginTop: 6 }}>
                            <Link className="btn btn-sm btn-ghost" to={evidenceHref(id, page, m.quote)} replace>Show on page</Link>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="panel-body small muted">No figures were taken from this page.</div>}
          </Panel>

          <Panel title="Original document">
            {!r ? <Skel h={40} /> : pdf ? (
              <>
                <p className="small muted" style={{ marginBottom: 12 }}>Open the PDF at this page to see it as printed, including charts and layout.</p>
                <a className="btn" href={fileUrl(r.id, page)} target="_blank" rel="noreferrer"><FileText /> Open PDF at page {page} <ExternalLink /></a>
                {r.source_url && <p className="small faint" style={{ marginTop: 10, wordBreak: 'break-all' }}>From {new URL(r.source_url).hostname}</p>}
              </>
            ) : (
              <Notice tone="info">
                This report was read from a folder on the computer that processed it, so GreenOrb doesn’t hold the PDF.
                The page text above is the evidence it kept.
              </Notice>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
