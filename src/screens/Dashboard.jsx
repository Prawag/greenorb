import React, { useState, useEffect } from "react";

import { API_SERVER as API_BASE } from "../utils.js";

export default function Dashboard({ onNavigateToDirectory, onNavigateToCompany }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const res = await fetch(`${API_BASE}/api/data`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(Array.isArray(json) ? json : []);
      } catch (e) {
        console.error("Dashboard fetch error:", e);
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, []);

  // Derived stats
  const companyCount = data.length;
  const reportsCount = data.filter(c => c.esg || c.co2).length;
  const metricsCount = data.reduce((sum, c) => {
    let n = 0;
    if (c.co2) n++;
    if (c.s1) n++;
    if (c.s2) n++;
    if (c.s3) n++;
    if (c.e_score) n++;
    if (c.s_score) n++;
    if (c.g_score) n++;
    return sum + n;
  }, 0);
  const flaggedCompanies = data.filter(
    c => c.red_flags && c.red_flags.length > 0
  );
  const flagCount = flaggedCompanies.length;

  // Sector breakdown
  const sectorCounts = {};
  data.forEach(c => {
    const s = c.sector || "Unknown";
    sectorCounts[s] = (sectorCounts[s] || 0) + 1;
  });
  const sectorEntries = Object.entries(sectorCounts).sort((a, b) => b[1] - a[1]);
  const maxSectorCount = sectorEntries.length > 0 ? sectorEntries[0][1] : 1;

  // Format large numbers
  function fmtNum(n) {
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return String(n);
  }

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <div className="go-status go-status-loading" style={{ display: "inline-block" }}>
          Loading ESG intelligence…
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "40px 48px", maxWidth: 1280, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 36 }}>
        <h1 style={{ fontFamily: "var(--disp)", fontSize: 32, marginBottom: 6 }}>
          ESG Intelligence
        </h1>
        <p style={{ fontFamily: "var(--body)", fontSize: 15, color: "var(--body-text)" }}>
          Real-time sustainability metrics across {companyCount} companies
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="go-status go-status-error" style={{ marginBottom: 24 }}>
          ⚠ Could not reach API — showing empty state. ({error})
        </div>
      )}

      {/* Stat cards row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 36 }}>
        <div className="stat-card">
          <div className="stat-value">{fmtNum(companyCount)}</div>
          <div className="stat-label">Companies Indexed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{fmtNum(reportsCount)}</div>
          <div className="stat-label">Reports Parsed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{fmtNum(metricsCount)}</div>
          <div className="stat-label">Metrics Extracted</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: flagCount > 0 ? "var(--semantic-down)" : undefined }}>
            {flagCount}
          </div>
          <div className="stat-label">Audit Flags</div>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 40 }}>
        {/* Left: Recent Audit Flags */}
        <div className="go-card">
          <div className="go-card-header">
            <div className="go-card-title">Recent Audit Flags</div>
          </div>
          <div className="go-card-content">
            {flaggedCompanies.length === 0 ? (
              <p style={{ fontFamily: "var(--body)", fontSize: 13, color: "var(--muted)", padding: "12px 0" }}>
                No audit flags detected — all companies look clean.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {flaggedCompanies.slice(0, 8).map((c, i) => (
                  <div
                    key={i}
                    onClick={() => onNavigateToCompany && onNavigateToCompany(c.name)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: "1px solid var(--bd)",
                      cursor: "pointer",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--bg-hover)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <div>
                      <div style={{ fontFamily: "var(--body)", fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
                        {c.name}
                      </div>
                      <div style={{ fontFamily: "var(--body)", fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                        {typeof c.red_flags === "string"
                          ? c.red_flags.slice(0, 60) + (c.red_flags.length > 60 ? "…" : "")
                          : Array.isArray(c.red_flags)
                            ? c.red_flags.slice(0, 2).join(", ")
                            : "Flagged"}
                      </div>
                    </div>
                    <span className="go-badge go-badge-destructive">🚩 Flag</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Companies by Sector */}
        <div className="go-card">
          <div className="go-card-header">
            <div className="go-card-title">Companies by Sector</div>
          </div>
          <div className="go-card-content">
            {sectorEntries.length === 0 ? (
              <p style={{ fontFamily: "var(--body)", fontSize: 13, color: "var(--muted)", padding: "12px 0" }}>
                No sector data available yet.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {sectorEntries.map(([sector, count]) => (
                  <div key={sector} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      fontFamily: "var(--body)",
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--body-text)",
                      width: 110,
                      flexShrink: 0,
                      textAlign: "right",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {sector}
                    </div>
                    <div style={{ flex: 1, height: 22, background: "rgba(0,0,0,0.04)", borderRadius: 6, overflow: "hidden" }}>
                      <div style={{
                        width: `${(count / maxSectorCount) * 100}%`,
                        height: "100%",
                        background: "var(--primary)",
                        borderRadius: 6,
                        minWidth: 8,
                        transition: "width 0.4s ease",
                      }} />
                    </div>
                    <div style={{
                      fontFamily: "var(--mono)",
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--ink)",
                      width: 28,
                      textAlign: "right",
                    }}>
                      {count}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ textAlign: "center" }}>
        <button
          className="go-btn go-btn-primary"
          onClick={() => onNavigateToDirectory && onNavigateToDirectory()}
          style={{ fontSize: 16, padding: "14px 36px" }}
        >
          Browse ESG Directory →
        </button>
      </div>
    </div>
  );
}
