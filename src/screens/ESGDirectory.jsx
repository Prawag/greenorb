import React, { useState, useEffect } from "react";

import { API_SERVER as API_BASE } from "../utils.js";

export default function ESGDirectory({ onSelectCompany }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("All");

  useEffect(() => {
    let cancelled = false;
    async function fetchCompanies() {
      try {
        const res = await fetch(`${API_BASE}/api/esg/companies`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(Array.isArray(json) ? json : []);
      } catch (e) {
        console.error("ESGDirectory fetch error:", e);
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchCompanies();
    return () => { cancelled = true; };
  }, []);

  // Derive sectors
  const sectors = ["All", ...Array.from(new Set(data.map(c => c.sector).filter(Boolean))).sort()];

  // Filter data
  const filtered = data.filter(c => {
    const matchesSearch = !search ||
      (c.name && c.name.toLowerCase().includes(search.toLowerCase())) ||
      (c.country && c.country.toLowerCase().includes(search.toLowerCase()));
    const matchesSector = sectorFilter === "All" || c.sector === sectorFilter;
    return matchesSearch && matchesSector;
  });

  // Format CO2
  function fmtCO2(val) {
    if (val === null || val === undefined) return "—";
    const n = Number(val);
    if (isNaN(n)) return "—";
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
    return n.toLocaleString();
  }

  // Format ESG score with color
  function scoreClass(val) {
    const n = Number(val);
    if (isNaN(n)) return "";
    if (n >= 70) return "score-good";
    if (n >= 40) return "score-mid";
    return "score-bad";
  }

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <div className="go-status go-status-loading" style={{ display: "inline-block" }}>
          Loading ESG directory…
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "40px 48px", maxWidth: 1280, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: "var(--disp)", fontSize: 32, marginBottom: 6 }}>
          ESG Report Directory
        </h1>
        <p style={{ fontFamily: "var(--body)", fontSize: 15, color: "var(--body-text)" }}>
          {filtered.length} {filtered.length === 1 ? "company" : "companies"}
          {sectorFilter !== "All" ? ` in ${sectorFilter}` : " indexed"}
          {search ? ` matching "${search}"` : ""}
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="go-status go-status-error" style={{ marginBottom: 24 }}>
          ⚠ Could not load company data — API may be offline. ({error})
        </div>
      )}

      {/* Filters */}
      <div className="go-card" style={{ marginBottom: 24 }}>
        <div className="go-card-content" style={{ padding: "16px 24px" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <input
              className="go-input"
              type="text"
              placeholder="Search companies or countries…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ maxWidth: 360 }}
            />
            <select
              className="go-select"
              value={sectorFilter}
              onChange={e => setSectorFilter(e.target.value)}
            >
              {sectors.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {(search || sectorFilter !== "All") && (
              <button
                className="go-btn go-btn-ghost"
                onClick={() => { setSearch(""); setSectorFilter("All"); }}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="go-card">
        {filtered.length === 0 ? (
          <div className="go-card-content" style={{ textAlign: "center", padding: "40px 24px" }}>
            <p style={{ fontFamily: "var(--body)", fontSize: 14, color: "var(--muted)" }}>
              {data.length === 0
                ? "No companies loaded yet. Sync data from the backend to get started."
                : "No companies match your current filters."}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="go-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Sector</th>
                  <th>Country</th>
                  <th>CO₂ (tCO₂e)</th>
                  <th>ESG Score</th>
                  <th>Year</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr
                    key={c.name || i}
                    data-clickable="true"
                    onClick={() => onSelectCompany && onSelectCompany(c.name)}
                  >
                    <td>
                      <span style={{ fontWeight: 600 }}>{c.name || "Unknown"}</span>
                    </td>
                    <td>
                      <span className="go-badge go-badge-outline">{c.sector || "—"}</span>
                    </td>
                    <td>{c.country || "—"}</td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 13 }}>
                      {fmtCO2(c.co2)}
                    </td>
                    <td>
                      {c.esg != null && !isNaN(Number(c.esg)) ? (
                        <span className={scoreClass(c.esg)} style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>
                          {Number(c.esg).toFixed(1)}
                        </span>
                      ) : (
                        <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--body-text)" }}>
                      {c.report_year || "—"}
                    </td>
                    <td>
                      {c.greenwash ? (
                        <span className="go-badge go-badge-destructive">🚩 Flag</span>
                      ) : (
                        <span className="go-badge go-badge-success">✓ Clean</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
