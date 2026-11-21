import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import FlagItem from '../components/FlagItem.jsx';
import { ReviewerButton, useReviewer } from '../components/Reviewer.jsx';
import { Card, Empty, ErrorState, PageHeader, Pagination, SkeletonRows } from '../components/ui.jsx';
import { FLAG_LABELS } from '../format.js';

export default function Review() {
  const [params, setParams] = useSearchParams();
  const reviewer = useReviewer();
  const status = params.get('status') || 'open';
  const severity = params.get('severity') || '';
  const code = params.get('code') || '';
  const page = Number(params.get('page') || 1);
  const set = (patch) => {
    const n = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k)));
    if (!('page' in patch)) n.delete('page');
    setParams(n, { replace: true });
  };
  const qs = new URLSearchParams({ status, page, limit: 20 });
  if (severity) qs.set('severity', severity);
  if (code) qs.set('code', code);
  const { data, error, loading, reload } = useApi(`/flags?${qs}`);
  const counts = data?.open_by_severity || {};

  return (
    <div className="page">
      <PageHeader
        title="Review queue"
        subtitle="Integrity and greenwashing signals raised while reading reports. Each one shows its evidence. Confirm real issues and dismiss false alarms; your decisions are kept when a report is reprocessed."
      >
        <ReviewerButton />
      </PageHeader>
      {!reviewer.isReviewer && <div className="go-status go-status-warn section">You can browse flags. Sign in as a reviewer to confirm or dismiss them.</div>}

      <Card style={{ marginBottom: 20 }}>
        <div className="row" style={{ gap: 12 }}>
          <div className="seg" role="group" aria-label="Status">
            {['open', 'confirmed', 'dismissed', 'all'].map((s) => <button key={s} className={status === s ? 'on' : ''} onClick={() => set({ status: s === 'open' ? '' : s })}>{s}</button>)}
          </div>
          <select className="go-select" value={severity} onChange={(e) => set({ severity: e.target.value })} aria-label="Severity">
            <option value="">All severities</option>
            {['high', 'medium', 'low', 'info'].map((s) => <option key={s} value={s}>{s}{counts[s] ? ` (${counts[s]} open)` : ''}</option>)}
          </select>
          <select className="go-select" value={code} onChange={(e) => set({ code: e.target.value })} aria-label="Flag type">
            <option value="">All flag types</option>
            {Object.entries(FLAG_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="spacer" />
          {data && <span className="small muted">{data.total} flag{data.total === 1 ? '' : 's'}</span>}
        </div>
      </Card>

      <ErrorState error={error} onRetry={reload} />
      {loading && !data ? <SkeletonRows rows={8} h={60} /> : data?.data?.length ? (
        <div className="stack">
          {data.data.map((f) => <FlagItem key={f.id} flag={f} showCompany onChange={() => reload(true)} />)}
        </div>
      ) : (
        <Card><Empty title="Nothing here">{status === 'open' ? 'No open flags match these filters.' : 'No flags match these filters.'}</Empty></Card>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={(p) => set({ page: String(p) })} />}
    </div>
  );
}
