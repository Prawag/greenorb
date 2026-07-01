import React, { useState } from "react";

import { API_SERVER as API } from "../utils.js";

const PIPELINE_STEPS = [
  {
    num: "1",
    title: "Crawl & Extract",
    desc: "The PDF is fetched, parsed, and raw text is extracted for analysis.",
  },
  {
    num: "2",
    title: "Scout Agent",
    desc: "Identifies the company, sector, country, and report year from extracted data.",
  },
  {
    num: "3",
    title: "Analyst Agent",
    desc: "Scores Environmental, Social, and Governance metrics. Extracts Scope 1/2/3.",
  },
  {
    num: "4",
    title: "Risk Agent",
    desc: "Detects greenwashing signals, regulatory gaps, and data quality issues.",
  },
  {
    num: "5",
    title: "Strategy Agent",
    desc: "Generates BUY / HOLD / AVOID recommendation based on aggregate ESG risk.",
  },
];

export default function UploadReport() {
  const [url, setUrl] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [reportYear, setReportYear] = useState("");
  const [status, setStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [message, setMessage] = useState("");

  const canSubmit = url.trim() !== "" && companyName.trim() !== "" && status !== "loading";

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch(`${API}/api/crawl`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-internal-key": import.meta.env.VITE_INTERNAL_API_KEY || ""
        },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server returned ${res.status}`);
      }

      const data = await res.json();
      setStatus("success");
      setMessage(
        data.message ||
          `Report submitted successfully for ${companyName}. The pipeline is now processing it.`
      );
      // Reset form on success
      setUrl("");
      setCompanyName("");
      setReportYear("");
    } catch (err) {
      setStatus("error");
      setMessage(err.message || "An unexpected error occurred.");
    }
  };

  return (
    <div style={{ padding: "32px 40px", maxWidth: 720 }}>
      {/* Page title */}
      <h1
        style={{
          fontFamily: "var(--disp)",
          fontSize: 32,
          marginBottom: 8,
        }}
      >
        Submit a Report
      </h1>
      <p
        style={{
          fontFamily: "var(--body)",
          fontSize: 14,
          color: "var(--body-text)",
          marginBottom: 32,
          lineHeight: 1.6,
        }}
      >
        Provide a public sustainability report PDF URL. Our agent pipeline will
        crawl, extract, and analyze it automatically.
      </p>

      {/* Form card */}
      <div className="go-card" style={{ marginBottom: 24 }}>
        <div className="go-card-content">
          <form onSubmit={handleSubmit}>
            {/* URL field */}
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: "block",
                  fontFamily: "var(--body)",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--ink)",
                  marginBottom: 6,
                }}
              >
                Report PDF URL <span style={{ color: "var(--semantic-down)" }}>*</span>
              </label>
              <input
                className="go-input go-input-accent"
                type="url"
                placeholder="https://example.com/sustainability-report-2024.pdf"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </div>

            {/* Company name field */}
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: "block",
                  fontFamily: "var(--body)",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--ink)",
                  marginBottom: 6,
                }}
              >
                Company Name <span style={{ color: "var(--semantic-down)" }}>*</span>
              </label>
              <input
                className="go-input"
                type="text"
                placeholder="e.g. Apple Inc"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              />
            </div>

            {/* Report year field */}
            <div style={{ marginBottom: 24 }}>
              <label
                style={{
                  display: "block",
                  fontFamily: "var(--body)",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--ink)",
                  marginBottom: 6,
                }}
              >
                Reporting Year{" "}
                <span
                  style={{
                    fontWeight: 400,
                    color: "var(--body-text)",
                    fontSize: 11,
                  }}
                >
                  (optional)
                </span>
              </label>
              <input
                className="go-input"
                type="number"
                placeholder="2024"
                min="2000"
                max="2030"
                value={reportYear}
                onChange={(e) => setReportYear(e.target.value)}
              />
            </div>

            {/* Submit button */}
            <button
              className="go-btn go-btn-primary"
              type="submit"
              disabled={!canSubmit}
              style={{ width: "100%" }}
            >
              {status === "loading" ? (
                <>
                  <span
                    style={{
                      display: "inline-block",
                      width: 16,
                      height: 16,
                      border: "2px solid rgba(151,255,161,0.3)",
                      borderTopColor: "var(--primary)",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                  Processing…
                </>
              ) : (
                "Submit Report"
              )}
            </button>
          </form>

          {/* Status feedback */}
          {status === "success" && (
            <div
              className="go-status go-status-success"
              style={{ marginTop: 16 }}
            >
              ✓ {message}
            </div>
          )}
          {status === "error" && (
            <div
              className="go-status go-status-error"
              style={{ marginTop: 16 }}
            >
              ✕ {message}
            </div>
          )}
          {status === "loading" && (
            <div
              className="go-status go-status-loading"
              style={{ marginTop: 16 }}
            >
              Crawling and extracting report data. This may take a minute for
              large PDFs…
            </div>
          )}
        </div>
      </div>

      {/* Pipeline explainer */}
      <div className="go-card">
        <div className="go-card-header">
          <div className="go-card-title">What happens next?</div>
        </div>
        <div className="go-card-content">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {PIPELINE_STEPS.map((step) => (
              <div className="pipeline-step" key={step.num}>
                <span className="pipeline-number">{step.num}</span>
                <div>
                  <div
                    style={{
                      fontFamily: "var(--body)",
                      fontWeight: 600,
                      fontSize: 13,
                      color: "var(--ink)",
                      marginBottom: 2,
                    }}
                  >
                    {step.title}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--body)",
                      fontSize: 13,
                      color: "var(--body-text)",
                      lineHeight: 1.5,
                    }}
                  >
                    {step.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
