import React, { useState, useEffect } from "react";

import { API_SERVER as API_BASE } from "../utils.js";

export default function AuditFlags({ onSelectCompany }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const res = await fetch(`${API_BASE}/api/data`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(Array.isArray(json) ? json : []);
      } catch (e) {
        console.error("AuditFlags fetch error:", e);
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, []);

  // Derive flags from data
  function classifyFlag(company) {
    const greenwash = (company.greenwash || "").toString().toUpperCase();
    const hasRedFlags = company.red_flags &&
      (typeof company.red_flags === "string" ? company.red_flags.trim().length > 0 : Array.isArray(company.red_flags) && company.red_flags.length > 0);

    if (greenwash === "HIGH" || (hasRedFlags && greenwash !== "LOW")) return "high";
    if (greenwash === "MEDIUM" || hasRedFlags) return "medium";
    if (greenwash === "LOW") return "low";
    return null; // not flagged
  }

  function getFlagReason(company) {
    const parts = [];
    if (company.greenwash) {
      parts.push(`Greenwash: ${company.greenwash}`);
    }
    if (company.red_flags) {
      const flags = typeof company.red_flags === "string"
        ? company.red_flags
        : Array.isArray(company.red_flags)
          ? company.red_flags.join("; ")
          : "";
      if (flags) parts.push(flags);
    }
    return parts.join(" · ") || "Flagged for review";
  }

  // Build flagged items
  const flaggedItems = data
    .map(c => {
      const severity = classifyFlag(c);
      if (!severity) return null;
      return { ...c, severity, reason: getFlagReason(c) };
    })
    .filter(Boolean);

  // Counts
  const counts = { all: flaggedItems.length, high: 0, medium: 0, low: 0 };
  flaggedItems.forEach(f => { counts[f.severity]++; });

  // Filter
  const displayed = activeFilter === "all"
    ? flaggedItems
    : flaggedItems.filter(f => f.severity === activeFilter);

  // Severity badge component
  function SeverityBadge({ severity }) {
    if (severity === "high") return <span className="go-badge go-badge-destructive">HIGH</span>;
    if (severity === "medium") return <span className="go-badge go-badge-warning">MEDIUM</span>;
    return <span className="go-badge go-badge-outline">LOW</span>;
  }

  // Severity card class
  function flagCardClass(severity) {
    if (severity === "high") return "flag-card flag-high";
    if (severity === "medium") return "flag-card flag-medium";
    return "flag-card flag-low";
  }

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <div className="go-status go-status-loading" style={{ display: "inline-block" }}>
          Scanning for audit flags…
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "40px 48px", maxWidth: 1280, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: "var(--disp)", fontSize: 32, marginBottom: 6 }}>
          Audit Flags
        </h1>
        <p style={{ fontFamily: "var(--body)", fontSize: 15, color: "var(--body-text)" }}>
          {flaggedItems.length} {flaggedItems.length === 1 ? "company" : "companies"} flagged for
          greenwashing risk or reporting gaps
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="go-status go-status-error" style={{ marginBottom: 24 }}>
          ⚠ Could not reach API — showing empty state. ({error})
        </div>
      )}

      {/* Summary filter cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        {[
          { key: "all", label: "All Flags", color: "var(--ink)" },
          { key: "high", label: "High Severity", color: "var(--semantic-down)" },
          { key: "medium", label: "Medium", color: "var(--semantic-warn)" },
          { key: "low", label: "Low", color: "var(--body-text)" },
        ].map(({ key, label, color }) => (
          <div
            key={key}
            className="stat-card"
            onClick={() => setActiveFilter(key)}
            style={{
              cursor: "pointer",
              borderColor: activeFilter === key ? color : undefined,
              borderWidth: activeFilter === key ? 2 : 1,
              transition: "border-color 0.2s",
            }}
          >
            <div className="stat-value" style={{ color }}>
              {counts[key]}
            </div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {/* Flag list */}
      {displayed.length === 0 ? (
        <div className="go-card">
          <div className="go-card-content" style={{ textAlign: "center", padding: "48px 24px" }}>
            <p style={{ fontFamily: "var(--body)", fontSize: 14, color: "var(--muted)" }}>
              {data.length === 0
                ? "No data loaded yet — sync your ESG reports to surface audit flags."
                : activeFilter !== "all"
                  ? `No ${activeFilter}-severity flags found.`
                  : "All companies passed audit checks — no flags detected. 🎉"}
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {displayed.map((flag, i) => (
            <div
              key={flag.name || i}
              className={flagCardClass(flag.severity)}
              onClick={() => onSelectCompany && onSelectCompany(flag.name)}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontFamily: "var(--body)", fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>
                      {flag.name}
                    </span>
                    <SeverityBadge severity={flag.severity} />
                  </div>
                  <p style={{
                    fontFamily: "var(--body)",
                    fontSize: 13,
                    color: "var(--body-text)",
                    lineHeight: 1.5,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}>
                    {flag.reason}
                  </p>
                  {flag.sector && (
                    <span className="go-badge go-badge-outline" style={{ marginTop: 8, display: "inline-flex" }}>
                      {flag.sector}
                    </span>
                  )}
                </div>
                <div style={{
                  fontFamily: "var(--body)",
                  fontSize: 12,
                  color: "var(--muted)",
                  whiteSpace: "nowrap",
                  paddingTop: 2,
                }}>
                  {flag.action || "Review"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
