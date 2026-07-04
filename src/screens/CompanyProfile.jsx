import React, { useState, useEffect } from "react";

import { API_SERVER as API } from "../utils.js";
import FALLBACK_COMPANIES from "../data/fallbackData.js";

function scoreColor(val) {
  if (val == null) return "";
  const n = parseFloat(val);
  if (n >= 70) return "score-good";
  if (n >= 40) return "score-mid";
  return "score-bad";
}

function fmt(val, fallback = "—") {
  if (val == null || val === "" || val === "N/A") return fallback;
  return val;
}

function fmtNum(val, decimals = 1) {
  if (val == null || val === "") return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtCO2(val) {
  if (val == null || val === "") return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + " Mt";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + " kt";
  return n.toFixed(1) + " t";
}

function actionBadge(action) {
  if (!action) return null;
  const upper = action.toUpperCase();
  let cls = "go-badge go-badge-outline";
  if (upper === "BUY") cls = "go-badge go-badge-success";
  if (upper === "AVOID") cls = "go-badge go-badge-destructive";
  if (upper === "HOLD") cls = "go-badge go-badge-warning";
  return <span className={cls}>{upper}</span>;
}

function EmissionBar({ label, value, maxVal }) {
  const n = parseFloat(value) || 0;
  const pct = maxVal > 0 ? Math.min((n / maxVal) * 100, 100) : 0;
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontFamily: "var(--body)",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ink)",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 13,
            color: "var(--body-text)",
          }}
        >
          {fmtCO2(value)}
        </span>
      </div>
      <div
        style={{
          height: 10,
          background: "var(--bd)",
          borderRadius: 5,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "var(--primary-dark)",
            borderRadius: 5,
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}

const TABS = ["overview", "emissions", "risk", "strategy"];

export default function CompanyProfile({ companyId, onSelectReport, onBack }) {
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    if (!companyId) {
        setLoading(false);
        return;
    }
    setLoading(true);
    setError(null);
    fetch(`${API}/api/data`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const sourceData = Array.isArray(data) && data.length > 0 ? data : FALLBACK_COMPANIES;
        const match = sourceData.find(
          (c) => c.name && c.name.toLowerCase() === companyId.toLowerCase()
        );
        setCompany(match || null);
      })
      .catch((e) => {
        const match = FALLBACK_COMPANIES.find(
          (c) => c.name && c.name.toLowerCase() === companyId.toLowerCase()
        );
        setCompany(match || null);
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  // --- Loading / Error / Empty states ---
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
          Loading company profile…
        </p>
      </div>
    );
  }



  if (!company) {
    return (
      <div style={{ padding: 48 }}>
        <button className="go-btn go-btn-ghost" onClick={onBack}>
          ← Back to Directory
        </button>
        <div className="go-card" style={{ marginTop: 24 }}>
          <div className="go-card-content" style={{ textAlign: "center", padding: 48 }}>
            <h3 style={{ fontFamily: "var(--disp)", marginBottom: 8 }}>
              Company not found
            </h3>
            <p style={{ fontFamily: "var(--body)", color: "var(--body-text)" }}>
              No data found for "{companyId}". It may not have been analyzed yet.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --- Derived values ---
  const s1 = parseFloat(company.s1) || 0;
  const s2 = parseFloat(company.s2) || 0;
  const s3 = parseFloat(company.s3) || 0;
  const maxScope = Math.max(s1, s2, s3, 1);

  const stats = [
    { label: "ESG Score", value: company.score },
    { label: "E Score", value: company.e_score },
    { label: "S Score", value: company.s_score },
    { label: "G Score", value: company.g_score },
  ];

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1100 }}>
      {/* Back button */}
      <button
        className="go-btn go-btn-ghost"
        onClick={onBack}
        style={{ marginBottom: 24 }}
      >
        ← Back to Directory
      </button>

      {error && (
        <div className="go-status go-status-error" style={{ marginBottom: 24, backgroundColor: 'var(--bg-hover)', color: 'var(--ink)', border: '1px solid var(--semantic-warn)' }}>
          ⚠ Using offline data (API unreachable)
        </div>
      )}

      {/* Company header */}
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
              <h1
                style={{
                  fontFamily: "var(--disp)",
                  fontSize: 32,
                  marginBottom: 10,
                }}
              >
                {company.name}
              </h1>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {company.sector && (
                  <span className="go-badge go-badge-accent">{company.sector}</span>
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
            </div>
            {company.score != null && (
              <div style={{ textAlign: "right" }}>
                <div
                  className={scoreColor(company.score)}
                  style={{
                    fontFamily: "var(--disp)",
                    fontSize: 48,
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {fmtNum(company.score, 0)}
                </div>
                <div
                  style={{
                    fontFamily: "var(--body)",
                    fontSize: 12,
                    color: "var(--body-text)",
                    marginTop: 4,
                  }}
                >
                  Greendex Score
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stat cards row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <div className={`stat-value ${scoreColor(s.value)}`}>
              {s.value != null ? fmtNum(s.value, 0) : "—"}
            </div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div className="go-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={`go-tab ${tab === t ? "go-tab-active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && <OverviewTab company={company} onSelectReport={onSelectReport} />}
      {tab === "emissions" && <EmissionsTab company={company} s1={s1} s2={s2} s3={s3} maxScope={maxScope} />}
      {tab === "risk" && <RiskTab company={company} />}
      {tab === "strategy" && <StrategyTab company={company} />}
    </div>
  );
}

/* ── Overview Tab ──────────────────────────────────────────── */
function OverviewTab({ company, onSelectReport }) {
  const rows = [
    ["Company", company.name],
    ["Sector", fmt(company.sector)],
    ["Country", fmt(company.country)],
    ["Total CO₂", fmtCO2(company.co2)],
    ["Methodology", fmt(company.methodology)],
    ["Report Year", fmt(company.report_year)],
    ["ESG Grade", fmt(company.esg)],
    ["Products", fmt(company.products)],
  ];

  return (
    <div className="go-card">
      <div className="go-card-content">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px 32px",
          }}
        >
          {rows.map(([label, value]) => (
            <div key={label}>
              <div
                style={{
                  fontFamily: "var(--body)",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--body-text)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 4,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontFamily: "var(--body)",
                  fontSize: 14,
                  color: "var(--ink)",
                  lineHeight: 1.5,
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* View report link */}
        {onSelectReport && (
          <button
            className="go-btn go-btn-ghost"
            style={{ marginTop: 24 }}
            onClick={() => onSelectReport(company.name)}
          >
            View Full Report →
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Emissions Tab ────────────────────────────────────────── */
function EmissionsTab({ company, s1, s2, s3, maxScope }) {
  const totalCO2 = parseFloat(company.co2) || s1 + s2 + s3;

  return (
    <div className="go-card">
      <div className="go-card-content">
        <h3 style={{ fontFamily: "var(--disp)", marginBottom: 20 }}>
          Scope 1 / 2 / 3 Emissions
        </h3>

        <EmissionBar label="Scope 1 — Direct" value={company.s1} maxVal={maxScope} />
        <EmissionBar label="Scope 2 — Indirect (Energy)" value={company.s2} maxVal={maxScope} />
        <EmissionBar label="Scope 3 — Value Chain" value={company.s3} maxVal={maxScope} />

        <div
          style={{
            marginTop: 24,
            padding: 20,
            background: "var(--bg)",
            borderRadius: "var(--radius)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--body)",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--body-text)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 6,
            }}
          >
            Total CO₂ Footprint
          </div>
          <div
            style={{
              fontFamily: "var(--disp)",
              fontSize: 28,
              fontWeight: 700,
              color: "var(--ink)",
            }}
          >
            {fmtCO2(totalCO2)}
          </div>
        </div>

        {!company.s1 && !company.s2 && !company.s3 && (
          <div
            className="go-status go-status-loading"
            style={{ marginTop: 16 }}
          >
            Scope breakdown not yet available. Total CO₂ shown from aggregate
            data.
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Risk Tab ─────────────────────────────────────────────── */
function RiskTab({ company }) {
  const riskFields = [
    { label: "Greenwash Level", value: company.greenwash },
    { label: "Regulatory Risk", value: company.reg_risk },
    { label: "Climate Exposure", value: company.climate_exp },
    { label: "Data Quality", value: company.data_quality },
    { label: "Red Flags", value: company.red_flags },
    { label: "Compliance", value: company.compliance },
  ];

  const hasAny = riskFields.some((f) => f.value != null && f.value !== "");

  if (!hasAny) {
    return (
      <div className="go-card">
        <div
          className="go-card-content"
          style={{ textAlign: "center", padding: 48 }}
        >
          <h3
            style={{
              fontFamily: "var(--disp)",
              marginBottom: 8,
              color: "var(--body-text)",
            }}
          >
            Risk Assessment Pending
          </h3>
          <p
            style={{
              fontFamily: "var(--body)",
              fontSize: 13,
              color: "var(--body-text)",
            }}
          >
            The Risk Agent has not yet analyzed this company. Check back after
            the next pipeline run.
          </p>
        </div>
      </div>
    );
  }

  function riskBadgeCls(val) {
    if (!val) return "go-badge go-badge-outline";
    const l = val.toString().toLowerCase();
    if (l.includes("high") || l.includes("severe") || l.includes("poor"))
      return "go-badge go-badge-destructive";
    if (l.includes("medium") || l.includes("moderate"))
      return "go-badge go-badge-warning";
    return "go-badge go-badge-success";
  }

  return (
    <div className="go-card">
      <div className="go-card-content">
        <h3 style={{ fontFamily: "var(--disp)", marginBottom: 20 }}>
          Risk Profile
        </h3>
        <table className="go-table">
          <thead>
            <tr>
              <th>Factor</th>
              <th>Assessment</th>
            </tr>
          </thead>
          <tbody>
            {riskFields.map((f) => (
              <tr key={f.label}>
                <td>{f.label}</td>
                <td>
                  {f.value ? (
                    <span className={riskBadgeCls(f.value)}>
                      {f.value}
                    </span>
                  ) : (
                    <span style={{ color: "var(--body-text)", fontSize: 13 }}>
                      —
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Strategy Tab ─────────────────────────────────────────── */
function StrategyTab({ company }) {
  const fields = [
    { label: "Confidence", value: company.confidence },
    { label: "Price Impact", value: company.price_impact },
    { label: "Catalyst", value: company.catalyst },
    { label: "Timeline", value: company.timeline },
  ];

  const hasAny =
    company.action || company.rationale || fields.some((f) => f.value != null);

  if (!hasAny) {
    return (
      <div className="go-card">
        <div
          className="go-card-content"
          style={{ textAlign: "center", padding: 48 }}
        >
          <h3
            style={{
              fontFamily: "var(--disp)",
              marginBottom: 8,
              color: "var(--body-text)",
            }}
          >
            Strategy Not Yet Generated
          </h3>
          <p
            style={{
              fontFamily: "var(--body)",
              fontSize: 13,
              color: "var(--body-text)",
            }}
          >
            The Strategy Agent will generate investment guidance after risk
            analysis is complete.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="go-card">
      <div className="go-card-content">
        <h3 style={{ fontFamily: "var(--disp)", marginBottom: 20 }}>
          Investment Strategy
        </h3>

        {/* Action badge */}
        {company.action && (
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                fontFamily: "var(--body)",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--body-text)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 8,
              }}
            >
              Recommended Action
            </div>
            <div style={{ fontSize: 22 }}>{actionBadge(company.action)}</div>
          </div>
        )}

        {/* Rationale */}
        {company.rationale && (
          <div
            style={{
              padding: 16,
              background: "var(--bg)",
              borderRadius: "var(--radius)",
              marginBottom: 20,
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
                marginBottom: 8,
              }}
            >
              Rationale
            </div>
            <p
              style={{
                fontFamily: "var(--body)",
                fontSize: 14,
                color: "var(--ink)",
                lineHeight: 1.6,
              }}
            >
              {company.rationale}
            </p>
          </div>
        )}

        {/* Detail fields */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px 32px",
          }}
        >
          {fields.map((f) => (
            <div key={f.label}>
              <div
                style={{
                  fontFamily: "var(--body)",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--body-text)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 4,
                }}
              >
                {f.label}
              </div>
              <div
                style={{
                  fontFamily: "var(--body)",
                  fontSize: 14,
                  color: "var(--ink)",
                }}
              >
                {fmt(f.value)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
