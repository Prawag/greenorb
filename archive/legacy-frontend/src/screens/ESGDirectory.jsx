import React, { useState, useEffect, useCallback } from "react";

import { API_SERVER as API_BASE } from "../utils.js";
import FALLBACK_COMPANIES from "../data/fallbackData.js";

export default function ESGDirectory({ onSelectCompany }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sectors, setSectors] = useState(["All"]);
  const itemsPerPage = 20;

  // Debounced search value
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, sectorFilter]);

  // Fetch data from server with pagination
  const fetchPage = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage,
        limit: itemsPerPage,
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (sectorFilter !== "All") params.set("sector", sectorFilter);

      const res = await fetch(`${API_BASE}/api/esg/companies?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      // Handle paginated response
      if (json.data && Array.isArray(json.data)) {
        setData(json.data);
        setTotalPages(json.totalPages || 1);
        setTotalCount(json.total || json.data.length);
        if (json.sectors) setSectors(["All", ...json.sectors]);
      } else if (Array.isArray(json)) {
        // Backward compat: old API returns plain array
        setData(json.length > 0 ? json : FALLBACK_COMPANIES);
        setTotalPages(1);
        setTotalCount(json.length);
      }
      setError(null);
    } catch (e) {
      console.error("ESGDirectory fetch error:", e);
      setData(FALLBACK_COMPANIES);
      setError(e.message);
      setTotalPages(1);
      setTotalCount(FALLBACK_COMPANIES.length);
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch, sectorFilter]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

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

  // Generate page numbers for pagination
  function getPageNumbers() {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);
    if (start > 1) { pages.push(1); if (start > 2) pages.push("..."); }
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages) { if (end < totalPages - 1) pages.push("..."); pages.push(totalPages); }
    return pages;
  }

  return (
    <div style={{ padding: "40px 48px", maxWidth: 1280, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: "var(--disp)", fontSize: 32, marginBottom: 6 }}>
          ESG Report Directory
        </h1>
        <p style={{ fontFamily: "var(--body)", fontSize: 15, color: "var(--body-text)" }}>
          {totalCount} {totalCount === 1 ? "company" : "companies"}
          {sectorFilter !== "All" ? ` in ${sectorFilter}` : " indexed"}
          {debouncedSearch ? ` matching "${debouncedSearch}"` : ""}
          {totalPages > 1 && ` · Page ${currentPage} of ${totalPages}`}
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="go-status go-status-error" style={{ marginBottom: 24, backgroundColor: 'var(--bg-hover)', color: 'var(--ink)', border: '1px solid var(--semantic-warn)' }}>
          ⚠ Using offline data (API unreachable: {error})
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
            {loading && (
              <span style={{ fontSize: 13, color: "var(--muted)", fontFamily: "var(--body)" }}>
                Loading…
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="go-card">
        {data.length === 0 && !loading ? (
          <div className="go-card-content" style={{ textAlign: "center", padding: "40px 24px" }}>
            <p style={{ fontFamily: "var(--body)", fontSize: 14, color: "var(--muted)" }}>
              {totalCount === 0
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
                {data.map((c, i) => (
                  <tr
                    key={c.name || i}
                    data-clickable="true"
                    onClick={() => onSelectCompany && onSelectCompany(c.name)}
                    style={loading ? { opacity: 0.5 } : {}}
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

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div style={{
          display: "flex", justifyContent: "center", alignItems: "center",
          gap: 4, marginTop: 24, flexWrap: "wrap"
        }}>
          <button
            className="go-btn go-btn-ghost"
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            style={{ padding: "6px 10px", fontSize: 13 }}
          >
            ⟨⟨
          </button>
          <button
            className="go-btn go-btn-ghost"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            style={{ padding: "6px 12px", fontSize: 13 }}
          >
            ← Prev
          </button>
          {getPageNumbers().map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} style={{ padding: "6px 4px", color: "var(--muted)", fontSize: 13 }}>…</span>
            ) : (
              <button
                key={p}
                className={`go-btn ${p === currentPage ? 'go-btn-primary' : 'go-btn-ghost'}`}
                onClick={() => setCurrentPage(p)}
                style={{ padding: "6px 12px", fontSize: 13, minWidth: 36 }}
              >
                {p}
              </button>
            )
          )}
          <button
            className="go-btn go-btn-ghost"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            style={{ padding: "6px 12px", fontSize: 13 }}
          >
            Next →
          </button>
          <button
            className="go-btn go-btn-ghost"
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages}
            style={{ padding: "6px 10px", fontSize: 13 }}
          >
            ⟩⟩
          </button>
        </div>
      )}
    </div>
  );
}
