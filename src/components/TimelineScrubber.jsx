// A compact timeline control bar:
// [|< Rewind]  [< -1d] [■ Play] [+1d >]  [● Live]
//  ───────────────●──────────────────────────
//  7d ago       5d ago      3d ago      Now

import { useState, useEffect, useCallback } from 'react';

const RANGE_DAYS = 7;

export function TimelineScrubber({ onDateChange, onLive }) {
  const [playing,  setPlaying]  = useState(false);
  const [dayOffset, setOffset]  = useState(0);   // 0 = live, -7 = 7 days ago
  const [isLive,   setIsLive]   = useState(true);

  const goLive = useCallback(() => {
    setOffset(0); setIsLive(true); setPlaying(false);
    onLive();
  }, [onLive]);

  const seek = useCallback((delta) => {
    setOffset(prev => {
      const next = Math.max(-RANGE_DAYS, Math.min(0, prev + delta));
      setIsLive(next === 0);
      const date = new Date();
      date.setDate(date.getDate() + next);
      onDateChange(date.toISOString().split('T')[0]);
      return next;
    });
  }, [onDateChange]);

  // Auto-play: advance 1 day every 2 seconds
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setOffset(prev => {
        if (prev >= 0) { setPlaying(false); setIsLive(true); return 0; }
        const next = prev + 1;
        const date = new Date();
        date.setDate(date.getDate() + next);
        onDateChange(date.toISOString().split('T')[0]);
        return next;
      });
    }, 2000);
    return () => clearInterval(t);
  }, [playing, onDateChange]);

  const displayDate = dayOffset === 0
    ? 'Live'
    : new Date(Date.now() + dayOffset * 86400000).toLocaleDateString();

  return (
    <div className="timeline-scrubber">
      <button onClick={() => seek(-7)} title="Jump to 7 days ago">|&lt;</button>
      <button onClick={() => seek(-1)}>-1d</button>
      <button onClick={() => setPlaying(p => !p)}>
        {playing ? '■' : '▶'}
      </button>
      <button onClick={() => seek(+1)}>+1d</button>
      <button
        onClick={goLive}
        className={isLive ? 'active' : ''}
      >● Live</button>
      <div className="timeline-scrubber__track">
        <input
          type="range"
          min={-RANGE_DAYS} max={0} value={dayOffset}
          onChange={e => seek(parseInt(e.target.value) - dayOffset)}
          style={{ flex: 1 }}
        />
        <span className="timeline-scrubber__date">{displayDate}</span>
      </div>
    </div>
  );
}
