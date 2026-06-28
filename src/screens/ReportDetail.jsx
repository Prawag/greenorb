import React, { useState, useEffect } from "react";

const API = "http://localhost:5000";

function fmtCO2(val) {
  if (val == null || val === "") return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + " Mt CO₂e";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + " kt CO₂e";
  return n.toFixed(1) + " t CO₂e";
}

function fmt(val, fallback = "—") {
  if (val == null || val === "" || val === "N/A") return fallback;
  return val;
}

export default function ReportDetail({ reportId, onSelectReport, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API}/api/data`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // --- Loading ---
  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <div
          style={{
            width: 28,
            height: 28,
            border: "3px solid var(--bd)",
            borderTopColor: "var(--ink)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 16px",
          }}
        />
        <p style={{ fontFamily: "var(--body)", color: "var(--body-text)" }}>
          Loading reports…
        </p>
      </div>
    );
  }

  // --- Error ---
  if (error) {
    return (
      <div style={{ padding: 48 }}>
        <button className="go-btn go-btn-ghost" onClick={onBack}>
          ← Back
        </button>
        <div className="go-status go-status-error" style={{ marginTop: 24 }}>
          Failed to load data: {error}
        </div>
      </div>
    );
  }

  // --- List View (if no reportId is selected) ---
  if (!reportId) {
    const reports = data.filter((c) => c.esg || c.url || c.co2);
    
    return (
      <div style={{ padding: 32, maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ marginBottom: 8 }}>ESG Reports</h1>
          <p style={{ color: "var(--body-text)", margin: 0 }}>
            {reports.length} reports available in the database.
          </p>
        </div>

        <div className="go-card">
          <div className="go-card-content" style={{ padding: 0 }}>
            <table className="go-table" style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ padding: 12, borderBottom: "1px solid var(--bd)" }}>Company</th>
                  <th style={{ padding: 12, borderBottom: "1px solid var(--bd)" }}>Sector</th>
                  <th style={{ padding: 12, borderBottom: "1px solid var(--bd)" }}>Year</th>
                  <th style={{ padding: 12, borderBottom: "1px solid var(--bd)" }}>ESG Score</th>
                  <th style={{ padding: 12, borderBottom: "1px solid var(--bd)" }}>Total Emissions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr 
                    key={r.name} 
                    style={{ cursor: "pointer", borderBottom: "1px solid var(--bd)" }}
                    onClick={() => onSelectReport && onSelectReport(r.name)}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: 12, fontWeight: 600 }}>{r.name}</td>
                    <td style={{ padding: 12 }}>{fmt(r.sector)}</td>
                    <td style={{ padding: 12 }}>{fmt(r.report_year, "2024")}</td>
                    <td style={{ padding: 12 }}>{fmt(r.esg)}</td>
                    <td style={{ padding: 12 }}>{fmtCO2(r.co2)}</td>
                  </tr>
                ))}
                {reports.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
                      No reports found in the database.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // --- Single Report Detail View ---
  const company = data.find((c) => c.name && c.name.toLowerCase() === reportId.toLowerCase());

  if (!company) {
    return (
      <div style={{ padding: 48 }}>
        <button className="go-btn go-btn-ghost" onClick={() => onSelectReport(null)}>
          ← Back to Reports
        </button>
        <div className="go-card" style={{ marginTop: 24 }}>
          <div className="go-card-content" style={{ textAlign: "center", padding: 48 }}>
            <h3 style={{ fontFamily: "var(--disp)", marginBottom: 8 }}>Report not found</h3>
            <p style={{ fontFamily: "var(--body)", color: "var(--body-text)" }}>
              No report data available for "{reportId}".
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --- Determine PDF url ---
  let pdfUrl = company.url;
  let hasPdf = false;
  
  if (pdfUrl && pdfUrl !== "N/A") {
    if (pdfUrl.startsWith("http://") || pdfUrl.startsWith("https://")) {
      hasPdf = true;
    } else if (pdfUrl.startsWith("./") || pdfUrl.startsWith("/")) {
      hasPdf = true;
      pdfUrl = pdfUrl.startsWith("./") ? `${API}${pdfUrl.slice(1)}` : `${API}${pdfUrl}`;
    }
  }

  // --- Compute total CO2 ---
  const s1 = parseFloat(company.s1) || 0;
  const s2 = parseFloat(company.s2) || 0;
  const s3 = parseFloat(company.s3) || 0;
  const totalCO2 = parseFloat(company.co2) || s1 + s2 + s3;

  // --- Metrics table ---
  const metrics = [
    {
      metric: "Scope 1",
      value: company.s1 != null ? fmtCO2(company.s1) : "—",
      unit: "Direct emissions",
    },
    {
      metric: "Scope 2",
      value: company.s2 != null ? fmtCO2(company.s2) : "—",
      unit: "Indirect (energy)",
    },
    {
      metric: "Scope 3",
      value: company.s3 != null ? fmtCO2(company.s3) : "—",
      unit: "Value chain",
    },
    {
      metric: "Total CO₂",
      value: fmtCO2(totalCO2),
      unit: "All scopes combined",
    },
    {
      metric: "ESG Score",
      value: company.score != null ? parseFloat(company.score).toFixed(0) : fmt(company.esg),
      unit: "Composite rating",
    },
    {
      metric: "E Score",
      value: company.e_score != null ? parseFloat(company.e_score).toFixed(0) : "—",
      unit: "Environmental",
    },
    {
      metric: "S Score",
      value: company.s_score != null ? parseFloat(company.s_score).toFixed(0) : "—",
      unit: "Social",
    },
    {
      metric: "G Score",
      value: company.g_score != null ? parseFloat(company.g_score).toFixed(0) : "—",
      unit: "Governance",
    },
  ];

  return (
    <div style={{ padding: "32px 40px", maxWidth: 900 }}>
      {/* Back button */}
      <button
        className="go-btn go-btn-ghost"
        onClick={() => onSelectReport(null)}
        style={{ marginBottom: 24 }}
      >
        ← Back to Reports
      </button>

      {/* Report header card */}
      <div className="go-card" style={{ marginBottom: 24 }}>
        <div className="go-card-content" style={{ padding: "28px 32px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: 16,
            }}
          >
            <div>
              <h2
                style={{
                  fontFamily: "var(--disp)",
                  fontSize: 24,
                  marginBottom: 8,
                }}
              >
                {company.name}
              </h2>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                {company.report_year && (
                  <span className="go-badge go-badge-outline">
                    {company.report_year}
                  </span>
                )}
                {company.sector && (
                  <span className="go-badge go-badge-accent">
                    {company.sector}
                  </span>
                )}
                {company.country && (
                  <span
                    style={{
                      fontFamily: "var(--body)",
                      fontSize: 13,
                      color: "var(--body-text)",
                    }}
                  >
                    {company.country}
                  </span>
                )}
              </div>

              {/* Source URL */}
              {hasPdf && (
                <div style={{ marginTop: 12 }}>
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontFamily: "var(--body)",
                      fontSize: 12,
                      color: "var(--body-text)",
                      wordBreak: "break-all",
                    }}
                  >
                    {pdfUrl.length > 80
                      ? pdfUrl.substring(0, 80) + "…"
                      : pdfUrl}
                  </a>
                </div>
              )}
            </div>

            {/* View PDF button */}
            {hasPdf && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="go-btn go-btn-primary"
                style={{ textDecoration: "none", flexShrink: 0 }}
              >
                View PDF ↗
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Extracted Metrics Table */}
      <div className="go-card">
        <div className="go-card-header">
          <div className="go-card-title">Extracted Metrics</div>
        </div>
        <div className="go-card-content" style={{ paddingTop: 8 }}>
          <table className="go-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Value</th>
                <th>Category</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.metric}>
                  <td>
                    <span
                      style={{
                        fontFamily: "var(--body)",
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      {m.metric}
                    </span>
                  </td>
                  <td>
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 13,
                      }}
                    >
                      {m.value}
                    </span>
                    {m.value !== "—" ? (
                      <span
                        className="go-badge go-badge-success"
                        style={{ marginLeft: 8 }}
                      >
                        Reported
                      </span>
                    ) : (
                      <span
                        className="go-badge go-badge-outline"
                        style={{ marginLeft: 8 }}
                      >
                        N/A
                      </span>
                    )}
                  </td>
                  <td>
                    <span
                      style={{
                        fontFamily: "var(--body)",
                        fontSize: 12,
                        color: "var(--body-text)",
                      }}
                    >
                      {m.unit}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Methodology note */}
          {company.methodology && company.methodology !== "N/A" && (
            <div
              style={{
                marginTop: 20,
                padding: 16,
                background: "var(--bg)",
                borderRadius: "var(--radius)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--body)",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--body-text)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 6,
                }}
              >
                Methodology
              </div>
              <p
                style={{
                  fontFamily: "var(--body)",
                  fontSize: 13,
                  color: "var(--ink)",
                  lineHeight: 1.6,
                }}
              >
                {company.methodology}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
