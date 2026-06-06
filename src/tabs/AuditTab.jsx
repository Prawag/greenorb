import React, { useState, useEffect } from "react";
import { API_BASE, fetchApi } from "../utils";

// Pure CSS micro-animations for high-fidelity interactive elements
const STYLES = `
@keyframes pulseGlow {
    0% { box-shadow: 0 0 10px rgba(0,232,122,0.1); }
    50% { box-shadow: 0 0 25px rgba(0,232,122,0.3); }
    100% { box-shadow: 0 0 10px rgba(0,232,122,0.1); }
}
@keyframes float {
    0% { transform: translateY(0px); }
    50% { transform: translateY(-4px); }
    100% { transform: translateY(0px); }
}
@keyframes scanline {
    0% { top: 0%; }
    50% { top: 100%; }
    100% { top: 0%; }
}
.framework-badge {
    transition: all 0.2s ease;
}
.framework-badge:hover {
    transform: scale(1.05);
    filter: brightness(1.2);
}
@media print {
    body * {
        visibility: hidden;
    }
    #printable-gap-report, #printable-gap-report * {
        visibility: visible;
    }
    #printable-gap-report {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        background: white !important;
        color: black !important;
        padding: 40px !important;
    }
    .no-print {
        display: none !important;
    }
}
`;

export default function AuditTab() {
    const [companies, setCompanies] = useState([]);
    const [peers, setPeers] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState(null);
    const [loading, setLoading] = useState(true);

    // Progressive pipeline states
    const [scanPhase, setScanPhase] = useState("idle"); // idle | reading | extracting | scoring | done | error
    const [scanProgress, setScanProgress] = useState(0);
    const [scanFileName, setScanFileName] = useState("");
    const [scanError, setScanError] = useState("");
    const [gapReport, setGapReport] = useState(null);

    // CBAM calculator inputs
    const [cbamExportTonnes, setCbamExportTonnes] = useState(10000);
    const [cbamProductType, setCbamProductType] = useState('Steel');

    // Drag-and-drop state
    const [dragOver, setDragOver] = useState(false);

    // Inject custom animation styles once on mount
    useEffect(() => {
        const styleSheet = document.createElement("style");
        styleSheet.type = "text/css";
        styleSheet.innerText = STYLES;
        document.head.appendChild(styleSheet);
        return () => document.head.removeChild(styleSheet);
    }, []);

    // Initial Load - constructs basic company and comparison dataset
    useEffect(() => {
        async function init() {
            setLoading(true);
            try {
                const compData = await fetchApi('/compare');
                setPeers(compData || []);
                
                const unified = await fetchApi('/data');
                if (unified && Array.isArray(unified)) {
                    const unique = Array.from(new Set(unified.map(c => c.name)))
                        .map(n => unified.find(u => u.name === n));
                    setCompanies(unique);
                    if (unique.length > 0) {
                        setSelectedCompany(unique[0]);
                    }
                } else if (compData && compData.length > 0) {
                    setCompanies(compData);
                    setSelectedCompany(compData[0]);
                }
            } catch (err) {
                console.error("Audit Tab initialization failed", err);
            }
            setLoading(false);
        }
        init();
    }, []);

    // When a company changes, reset the scan state
    useEffect(() => {
        setGapReport(null);
        setScanPhase("idle");
        setScanProgress(0);
        setScanError("");
    }, [selectedCompany]);

    const toBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = () => reject(new Error("File reading failed"));
        reader.readAsDataURL(file);
    });

    const runBrsrAuditPipeline = async (file) => {
        if (!file) return;
        if (file.type !== "application/pdf") {
            setScanError("Please upload a valid SEBI BRSR PDF file.");
            setScanPhase("error");
            return;
        }

        setScanFileName(file.name);
        setScanError("");
        setScanPhase("reading");
        setScanProgress(15);

        // Simulation intervals to keep UX alive through actual 4-stage pipeline
        const pInterval = setInterval(() => {
            setScanProgress(prev => {
                if (prev < 40) return prev + 3; // Phase 1: Ingestion
                if (prev < 70) {
                    setScanPhase("extracting"); // Phase 2: AI extraction
                    return prev + 2;
                }
                if (prev < 90) {
                    setScanPhase("scoring"); // Phase 3: Auditing & scoring
                    return prev + 1;
                }
                return prev;
            });
        }, 150);

        try {
            const base64Data = await toBase64(file);
            setScanProgress(45);
            setScanPhase("extracting");

            const res = await fetch(`${API_BASE}/audit/brsr-pdf`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    pdfData: base64Data,
                    companyName: selectedCompany.name,
                    sector: selectedCompany.sector
                })
            });

            clearInterval(pInterval);

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "BRSR audit pipeline failed");
            }

            const report = await res.json();
            if (report.error) {
                throw new Error(report.error);
            }

            setScanProgress(100);
            setScanPhase("done");
            setGapReport(report);

        } catch (err) {
            clearInterval(pInterval);
            console.error("Audit error:", err);
            setScanError(err.message || "An unexpected error occurred during the audit pipeline.");
            setScanPhase("error");
        }
    };

    const getScoreColor = (score) => {
        if (score === undefined || score === null) return "var(--tx3)";
        if (score >= 80) return "#00E87A"; // Jade Green
        if (score >= 50) return "#F59E0B"; // Amber
        return "#EF4444"; // Red
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setDragOver(true);
    };

    const handleDragLeave = () => {
        setDragOver(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) runBrsrAuditPipeline(file);
    };

    // CBAM calculations
    const EU_ETS = 80;
    const INDIA_CCTS = 10;
    const NET_TARIFF = EU_ETS - INDIA_CCTS; // €70/tonne

    const CBAM_BENCHMARKS = {
       "Steel": 2.1,
       "Cement": 0.82,
       "Aluminium": 14.5,
       "Fertilizers": 2.5
    };

    const isCbamApplicable = selectedCompany && ["Steel", "Aluminium", "Cement", "Fertilizers"].includes(selectedCompany.sector);

    return (
        <div style={{ display: "flex", height: "calc(100vh - 120px)", fontFamily: "var(--sf)", color: "var(--tx)" }}>
            
            {/* LEFT PANEL: Company List Directory */}
            <div style={{ width: "320px", borderRight: "1px solid var(--bd)", display: "flex", flexDirection: "column", background: "var(--bg)", zIndex: 10 }} className="no-print">
                <div style={{ padding: "16px", borderBottom: "1px solid var(--bd2)" }}>
                    <div style={{ fontSize: "15px", fontWeight: "700", marginBottom: "4px" }}>Audit Directory</div>
                    <div style={{ fontSize: "12px", color: "var(--tx3)" }}>Select an enterprise to run automated BRSR audits & verifications.</div>
                </div>
                
                <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
                    {loading && <div style={{ padding: "16px", fontSize: "12px", color: "var(--tx3)", textAlign: "center" }}>Loading audit database...</div>}
                    {!loading && companies.map(c => {
                        const gScore = c.score || c.esg_score || 0; 
                        return (
                            <div 
                                key={c.name} 
                                onClick={() => setSelectedCompany(c)}
                                style={{ 
                                    padding: "12px", 
                                    marginBottom: "8px", 
                                    borderRadius: "8px", 
                                    cursor: "pointer",
                                    background: selectedCompany?.name === c.name ? "var(--bg3)" : "var(--bg2)",
                                    border: `1px solid ${selectedCompany?.name === c.name ? "rgba(0,232,122,0.3)" : "var(--bd2)"}`,
                                    display: "flex", justifyContent: "space-between", alignItems: "center",
                                    transition: "all 0.2s"
                                }}
                            >
                                <div>
                                    <div style={{ fontSize: "13px", fontWeight: "600", color: selectedCompany?.name === c.name ? "var(--jade)" : "var(--tx)" }}>{c.name}</div>
                                    <div style={{ fontSize: "11px", color: "var(--tx3)", marginTop: "2px" }}>{c.sector}</div>
                                </div>
                                {gScore > 0 && (
                                    <div style={{ 
                                        padding: "3px 7px", borderRadius: "12px", fontSize: "10px", fontWeight: "700", fontFamily: "var(--mono)",
                                        background: `${getScoreColor(gScore)}18`, color: getScoreColor(gScore), border: `1px solid ${getScoreColor(gScore)}50`
                                    }}>
                                        GX {gScore}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* RIGHT PANEL: Details & Gap Report view */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px", background: "var(--bg)" }}>
                {!selectedCompany && (
                    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--tx3)", fontSize: "14px" }}>
                        Select enterprise directory to initiate audit
                    </div>
                )}

                {selectedCompany && (
                    <div style={{ maxWidth: "880px", margin: "0 auto" }}>
                        
                        {/* Audit intake header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }} className="no-print">
                            <div>
                                <h1 style={{ margin: 0, fontSize: "24px", fontWeight: "800", letterSpacing: "-0.5px" }}>
                                    BRSR Compliance Audit: <span style={{ color: "var(--jade)" }}>{selectedCompany.name}</span>
                                </h1>
                                <div style={{ fontSize: "13px", color: "var(--tx2)", marginTop: "4px" }}>
                                    Enterprise Core: {selectedCompany.sector} · {selectedCompany.country}
                                </div>
                            </div>
                            {gapReport && (
                                <button 
                                    onClick={() => window.print()}
                                    style={{
                                        padding: "8px 16px", background: "var(--jade)", color: "#000", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "800", boxShadow: "0 0 15px rgba(0,232,122,0.3)"
                                    }}
                                >
                                    🖨️ Export PDF Gap Report
                                </button>
                            )}
                        </div>

                        {/* STAGE 1: Intake & Upload Panel */}
                        {!gapReport && scanPhase !== "reading" && scanPhase !== "extracting" && scanPhase !== "scoring" && (
                            <div style={{ marginBottom: "32px" }} className="no-print">
                                <div 
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    style={{
                                        border: `2px dashed ${dragOver ? "var(--jade)" : "rgba(255,255,255,0.15)"}`,
                                        background: dragOver ? "rgba(0,232,122,0.04)" : "rgba(255,255,255,0.01)",
                                        borderRadius: "16px",
                                        padding: "48px 24px",
                                        textAlign: "center",
                                        transition: "all 0.3s ease",
                                        boxShadow: "inset 0 0 20px rgba(0,0,0,0.2)",
                                        animation: "pulseGlow 4s infinite"
                                    }}
                                >
                                    <div style={{ fontSize: "48px", marginBottom: "16px", animation: "float 3s infinite ease-in-out" }}>📄</div>
                                    <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "8px" }}>
                                        Ingest BRSR Sustainability PDF
                                    </h3>
                                    <p style={{ fontSize: "13px", color: "var(--tx3)", marginBottom: "24px", maxWidth: "450px", margin: "0 auto 24px" }}>
                                        Drag & drop the official SEBI BRSR PDF filing here, or choose a file to run the multi-stage extraction and compliance auditing pipeline.
                                    </p>
                                    
                                    <div style={{ display: "flex", justifyContent: "center", gap: "12px", flexWrap: "wrap" }}>
                                        <label 
                                            htmlFor="brsr-file-upload" 
                                            style={{
                                                padding: "12px 24px", background: "var(--jade)", color: "#000", fontFamily: "var(--disp)", fontWeight: "800", fontSize: "14px", borderRadius: "10px", cursor: "pointer", display: "inline-block", transition: "all 0.2s"
                                            }}
                                        >
                                            ⬆ Choose Filing PDF
                                            <input 
                                                id="brsr-file-upload" 
                                                type="file" 
                                                accept="application/pdf" 
                                                onChange={e => {
                                                    const file = e.target.files?.[0];
                                                    if (file) runBrsrAuditPipeline(file);
                                                    e.target.value = "";
                                                }}
                                                style={{ display: "none" }} 
                                            />
                                        </label>
                                        
                                        <button 
                                            onClick={async () => {
                                                const url = prompt("Enter public PDF URL for SEBI BRSR report:");
                                                if (url) {
                                                    runBrsrAuditPipeline({ name: url.split("/").pop() || "brsr-filing.pdf", type: "application/pdf" }, url);
                                                }
                                            }}
                                            style={{
                                                padding: "12px 24px", background: "rgba(255,255,255,0.06)", color: "var(--tx2)", border: "1px solid var(--bd)", borderRadius: "10px", fontSize: "14px", fontWeight: "700", cursor: "pointer"
                                            }}
                                        >
                                            🌐 Fetch from URL
                                        </button>
                                    </div>
                                    
                                    {scanPhase === "error" && (
                                        <div style={{ marginTop: "16px", color: "#EF4444", fontSize: "12px", fontWeight: "600", padding: "8px", background: "rgba(239,68,68,0.08)", borderRadius: "6px" }}>
                                            ⚠️ {scanError}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Pipeline Scanning UX state */}
                        {(scanPhase === "reading" || scanPhase === "extracting" || scanPhase === "scoring") && (
                            <div style={{
                                padding: "32px", background: "var(--bg2)", border: "1px solid var(--bd2)", borderRadius: "16px", marginBottom: "32px", position: "relative", overflow: "hidden"
                            }} className="no-print">
                                {/* Simulated green scan line */}
                                <div style={{
                                    position: "absolute", left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, transparent, var(--jade), transparent)", animation: "scanline 2s infinite linear", zIndex: 1
                                }} />
                                
                                <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
                                    <div style={{ width: "48px", height: "48px", borderRadius: "10px", background: "rgba(0,232,122,0.1)", border: "1px solid var(--jade)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>
                                        {scanPhase === "reading" ? "📂" : scanPhase === "extracting" ? "🧠" : "📊"}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: "10px", fontWeight: "800", color: "var(--jade)", letterSpacing: "1.5px", textTransform: "uppercase" }}>
                                            Pipeline Stage {scanPhase === "reading" ? "1" : scanPhase === "extracting" ? "2" : "3"} of 4
                                        </div>
                                        <h3 style={{ margin: "2px 0 0", fontSize: "15px", fontWeight: "700" }}>
                                            {scanPhase === "reading" ? "Stage 1: Intake & Ingestion..." : scanPhase === "extracting" ? "Stage 2: Precision LLM Metric Extraction & Tagging..." : "Stage 3: Peer Baseline Audit & Discrepancy Scoring..."}
                                        </h3>
                                        <span style={{ fontSize: "11px", color: "var(--tx3)" }}>Filing: {scanFileName}</span>
                                    </div>
                                    <div style={{ fontFamily: "var(--mono)", fontSize: "16px", fontWeight: "700", color: "var(--jade)" }}>
                                        {scanProgress}%
                                    </div>
                                </div>

                                <div style={{ height: "6px", background: "rgba(255,255,255,0.05)", borderRadius: "3px", overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${scanProgress}%`, background: "var(--jade)", transition: "width 0.4s ease-out" }} />
                                </div>
                            </div>
                        )}

                        {/* STAGE 4: Final output - Compliance Gap Report */}
                        {gapReport && (
                            <div id="printable-gap-report" style={{ animation: "fadeUp 0.5s ease" }}>
                                
                                {/* 1. COMPLIANCE HERO BLOCK */}
                                <div style={{
                                    display: "flex", gap: "24px", alignItems: "center", padding: "24px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--bd2)", borderRadius: "16px", marginBottom: "32px"
                                }}>
                                    {/* Radial Progress Gauge */}
                                    <div style={{ position: "relative", width: "100px", height: "100px", flexShrink: 0 }}>
                                        <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
                                            <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                                            <circle 
                                                cx="50" cy="50" r="44" fill="none" 
                                                stroke={getScoreColor(gapReport.metadata.compliance_score)} 
                                                strokeWidth="8"
                                                strokeDasharray={`${(gapReport.metadata.compliance_score / 100) * 276.4} 276.4`} 
                                                strokeLinecap="round"
                                                style={{ transition: "stroke-dasharray 1.5s ease-out-in" }}
                                            />
                                        </svg>
                                        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                                            <span style={{ fontFamily: "var(--mono)", fontSize: "24px", fontWeight: "800", color: getScoreColor(gapReport.metadata.compliance_score), lineHeight: 1 }}>
                                                {gapReport.metadata.compliance_score}
                                            </span>
                                            <span style={{ fontSize: "8px", color: "var(--tx3)", marginTop: "2px" }}>AUDIT SCORE</span>
                                        </div>
                                    </div>

                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: "11px", fontWeight: "800", color: "var(--tx3)", letterSpacing: "1px", textTransform: "uppercase" }}>
                                            Audit Status: COMPLETED
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "4px 0 8px" }}>
                                            <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "800" }}>
                                                Rating: {gapReport.metadata.compliance_rating} Compliance
                                            </h2>
                                            <span style={{
                                                padding: "3px 8px", borderRadius: "12px", fontSize: "10px", fontWeight: "800",
                                                background: `${getScoreColor(gapReport.metadata.compliance_score)}18`,
                                                color: getScoreColor(gapReport.metadata.compliance_score),
                                                border: `1px solid ${getScoreColor(gapReport.metadata.compliance_score)}50`
                                            }}>
                                                {gapReport.metadata.compliance_rating.toUpperCase()} RATING
                                            </span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: "12px", color: "var(--tx2)", lineHeight: 1.6 }}>
                                            Reported Year: <span style={{ color: "var(--tx)", fontWeight: "600" }}>{gapReport.metadata.reporting_year}</span> · 
                                            Audited On: <span style={{ color: "var(--tx)", fontWeight: "600" }}>{new Date(gapReport.metadata.audit_date).toLocaleDateString()}</span>
                                        </p>
                                    </div>
                                    
                                    <div className="no-print">
                                        <button 
                                            onClick={() => {
                                                setGapReport(null);
                                                setScanPhase("idle");
                                            }}
                                            style={{
                                                padding: "8px 12px", background: "rgba(255,255,255,0.05)", color: "var(--tx2)", border: "1px solid var(--bd)", borderRadius: "6px", cursor: "pointer", fontSize: "11px", fontWeight: "700"
                                            }}
                                        >
                                            Reset Audit
                                        </button>
                                    </div>
                                </div>

                                {/* 2. SECTION A: BRSR REPORTED METRICS & FRAMEWORK TAGGING */}
                                <div style={{ marginBottom: "36px" }}>
                                    <h3 style={{ fontSize: "14px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "1px", color: "var(--jade)", borderBottom: "1px solid var(--bd2)", paddingBottom: "8px", marginBottom: "16px" }}>
                                        Section A: Core Disclosed Metrics & Regulatory Tags
                                    </h3>
                                    
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "16px" }}>
                                        {Object.entries(gapReport.metrics).map(([key, val]) => {
                                            const tags = gapReport.framework_tags[key] || {};
                                            const hasValue = val !== null && val !== undefined;
                                            
                                            return (
                                                <div 
                                                    key={key} 
                                                    style={{ 
                                                        padding: "16px", background: "rgba(255,255,255,0.01)", border: `1px solid ${hasValue ? "var(--bd2)" : "rgba(239,68,68,0.2)"}`, borderRadius: "10px",
                                                        display: "flex", flexDirection: "column", justifyContent: "space-between", height: "130px"
                                                    }}
                                                >
                                                    <div>
                                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                                            <span style={{ fontSize: "11px", color: "var(--tx3)", textTransform: "uppercase", fontWeight: "600", letterSpacing: "0.5px" }}>
                                                                {key.replace(/_/g, " ")}
                                                            </span>
                                                            {!hasValue && (
                                                                <span style={{ fontSize: "9px", fontWeight: "800", color: "#EF4444", background: "rgba(239,68,68,0.08)", padding: "2px 6px", borderRadius: "4px" }}>
                                                                    OMITTED
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: "20px", fontWeight: "800", fontFamily: "var(--mono)", margin: "8px 0", color: hasValue ? "var(--tx)" : "rgba(255,255,255,0.15)" }}>
                                                            {hasValue ? `${val.toLocaleString()} ${key.includes("pct") || key.includes("percent") ? "%" : key.includes("withdrawal") ? "KL" : key.includes("waste") ? "MT" : key.includes("energy") ? "GJ" : "tCO2e"}` : "Not Disclosed"}
                                                        </div>
                                                    </div>

                                                    {/* Regulatory Framework Alignment Tags */}
                                                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                                        {Object.entries(tags).map(([fw, info]) => {
                                                            if (typeof info !== 'object') return null;
                                                            return (
                                                                <span 
                                                                    key={fw} 
                                                                    className="framework-badge"
                                                                    title={`${info.indicator || info.standard}: ${info.description}`}
                                                                    style={{ 
                                                                        padding: "2px 6px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--bd)", borderRadius: "4px", fontSize: "9px", fontFamily: "var(--mono)", color: "var(--tx2)", cursor: "help"
                                                                    }}
                                                                >
                                                                    {fw}: {info.indicator || info.standard || "P6"}
                                                                </span>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* 3. SECTION B: REPORTING GAPS (ABSENCE SIGNALS) */}
                                <div style={{ marginBottom: "36px" }}>
                                    <h3 style={{ fontSize: "14px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "1px", color: "#EF4444", borderBottom: "1px solid var(--bd2)", paddingBottom: "8px", marginBottom: "16px" }}>
                                        Section B: Reporting Gaps & Absence Signals
                                    </h3>
                                    
                                    {gapReport.reporting_gaps.length === 0 ? (
                                        <div style={{ padding: "16px", background: "rgba(0,232,122,0.04)", border: "1px solid rgba(0,232,122,0.2)", borderRadius: "8px", fontSize: "13px", color: "var(--jade)", fontWeight: "600" }}>
                                            ✓ Perfect Sector Baseline Matching. No reporting gaps detected.
                                        </div>
                                    ) : (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                            {gapReport.reporting_gaps.map((gap, i) => (
                                                <div 
                                                    key={i} 
                                                    style={{ 
                                                        padding: "16px", background: "rgba(239,68,68,0.02)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: "8px",
                                                        display: "flex", gap: "16px", alignItems: "center"
                                                    }}
                                                >
                                                    <div style={{ width: "32px", height: "32px", borderRadius: "6px", background: "rgba(239,68,68,0.1)", border: "1px solid #EF4444", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", color: "#EF4444", fontWeight: "800", flexShrink: 0 }}>
                                                        !
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                                                            <h4 style={{ margin: 0, fontSize: "14px", fontWeight: "700" }}>{gap.metric_label} Omission</h4>
                                                            <span style={{ fontSize: "10px", fontWeight: "700", color: "#EF4444" }}>
                                                                PEER DISCLOSURE: {gap.peer_disclosure_rate}%
                                                            </span>
                                                        </div>
                                                        <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--tx2)", lineHeight: 1.5 }}>
                                                            {gap.message} Omission under high disclosure baselines indicates compliance risk.
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* 4. SECTION C: VERIFICATION & ANOMALY DETECTION */}
                                <div style={{ marginBottom: "36px" }}>
                                    <h3 style={{ fontSize: "14px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "1px", color: "#F59E0B", borderBottom: "1px solid var(--bd2)", paddingBottom: "8px", marginBottom: "16px" }}>
                                        Section C: Verifications & Anomaly Flags
                                    </h3>
                                    
                                    {gapReport.anomaly_flags.length === 0 ? (
                                        <div style={{ padding: "16px", background: "rgba(0,232,122,0.04)", border: "1px solid rgba(0,232,122,0.2)", borderRadius: "8px", fontSize: "13px", color: "var(--jade)", fontWeight: "600" }}>
                                            ✓ Mathematics & Grid Intensities verified. No anomalies flagged.
                                        </div>
                                    ) : (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                            {gapReport.anomaly_flags.map((flag, i) => (
                                                <div 
                                                    key={i} 
                                                    style={{ 
                                                        padding: "16px", background: "rgba(245,158,11,0.02)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: "8px",
                                                        display: "flex", gap: "16px", alignItems: "center"
                                                    }}
                                                >
                                                    <div style={{ width: "32px", height: "32px", borderRadius: "6px", background: "rgba(245,158,11,0.1)", border: "1px solid #F59E0B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", color: "#F59E0B", fontWeight: "800", flexShrink: 0 }}>
                                                        ⚠️
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                                                            <h4 style={{ margin: 0, fontSize: "14px", fontWeight: "700" }}>{flag.type.replace(/_/g, " ")}</h4>
                                                            <span style={{ fontSize: "10px", fontWeight: "700", color: "#F59E0B" }}>
                                                                SEVERITY: {flag.severity}
                                                            </span>
                                                        </div>
                                                        <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--tx2)", lineHeight: 1.5 }}>
                                                            {flag.message}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* 5. SECTION D: CBAM EXPOSURE RISK CALCULATOR */}
                                {isCbamApplicable && gapReport.cbam_risk.applicable && (
                                    <div style={{ marginBottom: "36px", background: "var(--bg2)", border: "1px solid var(--bd2)", borderRadius: "10px", padding: "20px" }}>
                                        <h3 style={{ fontSize: "14px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "1px", color: "var(--tx2)", borderBottom: "1px solid var(--bd)", paddingBottom: "8px", marginBottom: "16px", marginTop: 0 }}>
                                            Section D: EU Border Adjustment (CBAM) Financial Exposure
                                        </h3>
                                        
                                        <div style={{ display: "flex", gap: "16px", marginBottom: "16px", alignItems: 'center' }} className="no-print">
                                            <div style={{ flex: 1 }}>
                                               <label style={{ display:'block', fontSize:'11px', marginBottom:'4px', color: "var(--tx2)" }}>Fictional Volume Exported (Tonnes)</label>
                                               <input type="number" value={cbamExportTonnes} onChange={e=>setCbamExportTonnes(Number(e.target.value))} style={{ padding: '8px 12px', background: 'var(--bg)', color: 'white', border: '1px solid var(--bd)', borderRadius: "6px", width: '100%' }} />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                               <label style={{ display:'block', fontSize:'11px', marginBottom:'4px', color: "var(--tx2)" }}>Product Category</label>
                                               <select value={cbamProductType} onChange={e=>setCbamProductType(e.target.value)} style={{ padding: '8px 12px', background: 'var(--bg)', color: 'white', border: '1px solid var(--bd)', borderRadius: "6px", width: '100%' }}>
                                                  <option value="Steel">Steel</option>
                                                  <option value="Cement">Cement</option>
                                                  <option value="Aluminium">Aluminium</option>
                                                  <option value="Fertilizers">Fertilizers</option>
                                               </select>
                                            </div>
                                            <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
                                               <div style={{ fontSize: "10px", color: "var(--tx3)", textTransform: "uppercase" }}>Calculated Net Liability</div>
                                               <div style={{ fontSize: "22px", fontWeight: "800", color: "#EF4444", fontFamily: "var(--mono)", marginTop: "4px" }}>
                                                  €{(cbamExportTonnes * CBAM_BENCHMARKS[cbamProductType] * NET_TARIFF).toLocaleString()}
                                               </div>
                                            </div>
                                        </div>

                                        <div style={{ display: "flex", gap: "16px" }}>
                                            <div style={{ flex: 1, padding: "16px", background: "rgba(255,255,255,0.01)", border: "1px solid var(--bd2)", borderRadius: "8px" }}>
                                                <div style={{ fontSize: "11px", color: "var(--tx3)", marginBottom: "4px" }}>
                                                    Scope 1 Liability Offset (Verified)
                                                </div>
                                                <div style={{ fontSize: "18px", fontWeight: "800", color: "var(--jade)", fontFamily: "var(--mono)" }}>
                                                    €{gapReport.cbam_risk.verified_offset_eur.toLocaleString()}
                                                </div>
                                            </div>
                                            <div style={{ flex: 1, padding: "16px", background: "rgba(255,255,255,0.01)", border: "1px solid var(--bd2)", borderRadius: "8px" }}>
                                                <div style={{ fontSize: "11px", color: "var(--tx3)", marginBottom: "4px" }}>Total Unverified Penalty Exposure</div>
                                                <div style={{ fontSize: "18px", fontWeight: "800", color: "#EF4444", fontFamily: "var(--mono)" }}>
                                                    €{gapReport.cbam_risk.penalty_liability_eur.toLocaleString()}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* 6. AUDIT RECOMMENDATIONS */}
                                <div style={{ marginBottom: "20px" }}>
                                    <h3 style={{ fontSize: "14px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "1px", color: "var(--jade)", borderBottom: "1px solid var(--bd2)", paddingBottom: "8px", marginBottom: "16px" }}>
                                        Section E: Strategic Compliance Recommendations
                                    </h3>
                                    
                                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                        {gapReport.recommendations.map((rec, i) => (
                                            <div 
                                                key={i} 
                                                style={{ 
                                                    padding: "16px", background: "rgba(255,255,255,0.01)", border: "1px solid var(--bd2)", borderRadius: "8px",
                                                    display: "flex", gap: "16px", alignItems: "flex-start"
                                                }}
                                            >
                                                <span style={{
                                                    padding: "2px 8px", borderRadius: "10px", fontSize: "9px", fontWeight: "800",
                                                    background: rec.priority === "HIGH" ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.05)",
                                                    color: rec.priority === "HIGH" ? "#EF4444" : "var(--tx2)",
                                                    border: `1px solid ${rec.priority === "HIGH" ? "rgba(239,68,68,0.2)" : "var(--bd)"}`
                                                }}>
                                                    {rec.category}
                                                </span>
                                                <div style={{ flex: 1, fontSize: "12px", color: "var(--tx2)", lineHeight: 1.6 }}>
                                                    {rec.message}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                            </div>
                        )}

                    </div>
                )}
            </div>
        </div>
    );
}
