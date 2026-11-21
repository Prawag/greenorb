import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { useCrumbs } from '../components/Frame.jsx';
import FlagItem from '../components/FlagItem.jsx';
import { useReviewer } from '../components/Reviewer.jsx';
import { Empty, ErrorNotice, Notice, PageHead, Pager, Panel, SkelRows } from '../components/ui.jsx';
import { FLAG_LABELS } from '../format.js';

const STATUS = [['open', 'Open'], ['confirmed', 'Confirmed'], ['dismissed', 'Dismissed'], ['all', 'All']];

export default function Review() {
  useCrumbs([{ label: 'Review queue' }]);
  const [params, setParams] = useSearchParams();
  const reviewer = useReviewer();
  const status = params.get('status') || 'open';
  const severity = params.get('severity') || '';
  const code = params.get('code') || '';
  const page = Number(params.get('page') || 1);
  const limit = 20;
  const set = (patch) => {
    const n = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k)));
    if (!('page' in patch)) n.delete('page');
    setParams(n, { replace: true });
  };
  const qs = new URLSearchParams({ status, page, limit });
  if (severity) qs.set('severity', severity);
  if (code) qs.set('code', code);
  const { data, error, loading, reload } = useApi(`/flags?${qs}`);
  const counts = data?.open_by_severity || {};

  return (
    <div className="content">
      <PageHead title="Review queue">
        Possible problems found while reading reports, such as missing assurance, totals that don’t add up, or large unexplained changes. Each flag shows its evidence. Confirm real issues and dismiss false alarms; decisions are kept if a report is read again.
      </PageHead>
      {!reviewer.isReviewer && (
        <Notice tone="info" action={<button className="btn btn-sm" onClick={reviewer.open}>Reviewer sign-in</button>}>You can browse flags. Sign in as a reviewer to confirm or dismiss them.</Notice>
      )}
      <ErrorNotice error={error} onRetry={reload} />

      <Panel flush>
        <div className="toolbar">
          <div className="segmented" role="group" aria-label="Status">
            {STATUS.map(([v, l]) => <button key={v} className={status === v ? 'on' : ''} aria-pressed={status === v} onClick={() => set({ status: v === 'open' ? '' : v })}>{l}</button>)}
          </div>
          <select className="select" value={severity} onChange={(e) => set({ severity: e.target.value })} aria-label="Severity">
            <option value="">Any severity</option>
            {[['high', 'High'], ['medium', 'Medium'], ['low', 'Low'], ['info', 'Note']].map(([v, l]) => <option key={v} value={v}>{l}{counts[v] ? ` (${counts[v]} open)` : ''}</option>)}
          </select>
          <select className="select" value={code} onChange={(e) => set({ code: e.target.value })} aria-label="Flag type">
            <option value="">Any type</option>
            {Object.entries(FLAG_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {(severity || code) && <button className="btn btn-sm btn-ghost" onClick={() => set({ severity: '', code: '' })}>Clear filters</button>}
        </div>
        {loading && !data ? <SkelRows rows={8} /> : data?.data?.length ? (
          data.data.map((f) => <FlagItem key={f.id} flag={f} showCompany onChange={() => reload(true)} />)
        ) : (
          <Empty title={status === 'open' ? 'Nothing to review' : 'No flags'}>{status === 'open' ? 'There are no open flags matching these filters.' : 'No flags match these filters.'}</Empty>
        )}
        {data && <Pager page={data.page} totalPages={data.totalPages} total={data.total} limit={limit} onChange={(p) => set({ page: String(p) })} />}
      </Panel>
    </div>
  );
}
