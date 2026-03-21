import React, { useState } from "react";
import { Cd, M, Rw, Bdg, Dot, Spin, SHd, GlassBtn } from "../components/primitives";
import { submitVerdict as apiSubmitVerdict } from "../hooks/useEmissionsData";

const MOCK_AUDITS = [
    {
        id: "a1",
        company: "Tata Steel",
        year: 2024,
        status: "verified",
        time: "12m ago",
        agent: "Analyst-v2.1",
        llm_provider: "gemini",
        linguistic_flags: [
            { sentence: "We are deeply committed to a greener, more sustainable future.", greenwashing_risk: "HIGH", confidence: 0.87 },
        ],
        absence_signals: [
            { metric_label: "Scope 3 (value chain) emissions", peer_rate: 82, severity: "MEDIUM", message: "82% of Steel companies disclose Scope 3, but this report omits it." }
        ],
        framework_tags: { scope_1: { BRSR: { principle: "P6", indicator: "Essential Indicator 1" }, GRI: { indicator: "305-1" } } },
        metrics: [
            {
                id: "m1",
                name: "Scope 1 Total Emissions",
                claim: "5,400,000 tCO₂e",
                source: "Sustainability Report 2024 (Page 42, Table 3.2). Text: 'Direct emissions from our manufacturing facilities generated 3.1M tCO₂e and mobile combustion added 2.3M tCO₂e.'",
                math: "Extracted: [3,100,000, 2,300,000]. Deterministic Sum: 5,400,000. \nCross-referenced with Climatiq factor: (Steel/India/Default).",
                verdict: "Matches perfectly. No hallucination detected.",
                state: "pass"
            },
            {
                id: "m2",
                name: "Renewable Energy Mix",
                claim: "45%",
                source: "Page 18, 'Energy Mix Overview'. Text: 'Total energy consumed: 100 GWh. Solar: 20 GWh, Wind: 15 GWh. Grid: 65 GWh.'",
                math: "Extracted: [100 (Total), 20 (Solar), 15 (Wind)]. \nMath Execution: (20 + 15) / 100 = 35%. Claimed 45% implies 10% unverified RECs.",
                verdict: "10% Discrepancy. Flagged for Risk Agent review.",
                state: "warn"
            }
        ]
    },
    {
        id: "a2",
        company: "Reliance Ind.",
        year: 2024,
        status: "failed",
        time: "Just now",
        agent: "Analyst-v2.1",
        llm_provider: null,
        error: "Gemini API Timeout (120s limit exceeded). PDF exceeds context window.",
        failed_at: "2026-03-21T02:00:00Z",
        metrics: []
    },
    {
        id: "a3",
        company: "Infosys",
        year: 2024,
        status: "verified",
        time: "3h ago",
        agent: "Analyst-v2.1",
        llm_provider: "groq",
        linguistic_flags: [],
        absence_signals: [],
        metrics: [
            {
                id: "m3",
                name: "Net Zero Target",
                claim: "2040",
                source: "ESG Report (Page 5). 'We are committed to achieving Net Zero by 2040 across all scopes.'",
                math: "Target year extraction regex matched integer: 2040.",
                verdict: "Verified commitment. SBTi alignment confirmed via external API.",
                state: "pass"
            }
        ]
    }
];

const PROVIDER_LABELS = {
    gemini: { label: "Gemini Flash", color: "#3b82f6" },
    groq:   { label: "Groq Llama 3.1", color: "#f59e0b" },
    ollama: { label: "Local Ollama", color: "#10b981" },
    schema: { label: "Schema (no LLM)", color: "#8b5cf6" },
};

const RISK_COLORS = { HIGH: "#ef4444", MEDIUM: "#f59e0b", LOW: "#10b981" };

export default function TrustDashboard() {
    const [selAudit, setSelAudit] = useState(null);
    const [viewMode, setViewMode] = useState("developer");
    const [verdicts, setVerdicts] = useState({});

    const submitVerdict = async (auditId, verdict) => {
        const audit = MOCK_AUDITS.find(a => a.id === auditId);
        setVerdicts(prev => ({ ...prev, [auditId]: verdict }));
        // POST to /api/verdicts for persistence
        const result = await apiSubmitVerdict(auditId, verdict, audit?.company || '');
        console.log(`[TrustDashboard] Verdict submitted: ${auditId} → ${verdict}`, result);
    };

    const handleRetry = (auditId) => {
        console.log(`[TrustDashboard] Retry triggered for: ${auditId}`);
    };

    const getStatusBadge = (status) => {
        if (status === "verified") return <Bdg color="jade">COMPLETED</Bdg>;
        if (status === "failed") return <Bdg style={{ background: "rgba(239,68,68,.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,.3)" }}>FAILED</Bdg>;
        return <Bdg color="amb">EXTRACTING</Bdg>;
    };

    const getProviderBadge = (provider) => {
        if (!provider) return null;
        const p = PROVIDER_LABELS[provider] || { label: provider, color: "#6b7280" };
        return (
            <span style={{ display: "inline-block", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: `${p.color}15`, color: p.color, border: `1px solid ${p.color}30` }}>
                via {p.label}
            </span>
        );
    };

    return (
        <div style={{ padding: "80px 16px 40px", maxWidth: 800, margin: "0 auto" }}>
            {!selAudit ? (
                // --- LIST VIEW ---
                <div style={{ animation: "fadeUp .4s ease" }}>
                    <SHd tag="AgentHQ" title="Audit Observability" sub="Monitor the multi-agent network in real-time. Inspect the reasoning chain (Claim → Source → Math → Verdict) to guarantee AI trustworthiness and deterministic math." />

                    <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
                        <Cd glass style={{ padding: "12px 16px", flex: 1 }}>
                            <M size={11} color="var(--tx3)" style={{ display: "block", marginBottom: 4 }}>Active Agents</M>
                            <Rw style={{ gap: 6 }}>
                                <Dot color="var(--jade)" pulse />
                                <span style={{ fontFamily: "var(--disp)", fontSize: 20, fontWeight: 700, color: "var(--tx)" }}>4</span>
                            </Rw>
                        </Cd>
                        <Cd glass style={{ padding: "12px 16px", flex: 1 }}>
                            <M size={11} color="var(--tx3)" style={{ display: "block", marginBottom: 4 }}>Processed (24h)</M>
                            <span style={{ fontFamily: "var(--disp)", fontSize: 20, fontWeight: 700, color: "var(--tx)" }}>142 Docs</span>
                        </Cd>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {MOCK_AUDITS.map(a => (
                            <Cd key={a.id} style={{ padding: 16, cursor: a.status === "processing" ? "default" : "pointer", transition: "all .2s" }} onClick={() => a.status !== "processing" && setSelAudit(a)}>
                                <Rw style={{ justifyContent: "space-between", marginBottom: 8 }}>
                                    <Rw style={{ gap: 8 }}>
                                        <div style={{ width: 36, height: 36, borderRadius: 10, background: a.status === "failed" ? "rgba(239,68,68,.1)" : "var(--bg2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                                            {a.status === "processing" ? <Spin size={16} /> : a.status === "failed" ? "❌" : "📄"}
                                        </div>
                                        <div>
                                            <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 16, color: "var(--tx)", marginBottom: 2 }}>{a.company}</div>
                                            <Rw style={{ gap: 6 }}>
                                                <M size={11} color="var(--tx3)">{a.year} Report</M>
                                                <M size={11} color="var(--tx3)">•</M>
                                                <M size={11} color="var(--tx3)">{a.agent}</M>
                                                {a.llm_provider && <>{getProviderBadge(a.llm_provider)}</>}
                                            </Rw>
                                        </div>
                                    </Rw>
                                    <div style={{ textAlign: "right" }}>
                                        {getStatusBadge(a.status)}
                                        <M size={11} color="var(--tx3)" style={{ display: "block", marginTop: 4 }}>{a.time}</M>
                                    </div>
                                </Rw>
                                {/* FAILED state: show error + retry */}
                                {a.status === "failed" && (
                                    <div style={{ background: "rgba(239,68,68,.05)", border: "1px solid rgba(239,68,68,.15)", borderRadius: 8, padding: 12, marginTop: 8 }}>
                                        <M size={12} color="#ef4444" style={{ fontWeight: 600, display: "block", marginBottom: 4 }}>Error: {a.error}</M>
                                        {a.failed_at && <M size={10} color="var(--tx3)">Failed at: {new Date(a.failed_at).toLocaleString()}</M>}
                                        <div style={{ marginTop: 8 }}>
                                            <GlassBtn onClick={(e) => { e.stopPropagation(); handleRetry(a.id); }} style={{ padding: "6px 14px", fontSize: 12, background: "rgba(239,68,68,.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,.2)" }}>
                                                🔄 Retry Audit
                                            </GlassBtn>
                                        </div>
                                    </div>
                                )}
                            </Cd>
                        ))}
                    </div>
                </div>
            ) : (
                // --- DETAIL VIEW ---
                <div style={{ animation: "fadeRight .3s ease" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, cursor: "pointer" }} onClick={() => setSelAudit(null)}>
                        <div style={{ width: 32, height: 32, borderRadius: 16, background: "var(--bg3)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--tx2)", fontSize: 16 }}>←</div>
                        <M size={14} color="var(--tx2)" style={{ fontWeight: 600 }}>Back to Audit Queue</M>
                    </div>

                    <Cd style={{ padding: 20, marginBottom: 24, background: viewMode === "compliance" ? "#ffffff" : "var(--sf)" }}>
                        <Rw style={{ justifyContent: "space-between", marginBottom: 16 }}>
                            <div>
                                <h2 style={{ fontFamily: "var(--disp)", fontSize: 22, fontWeight: 700, color: "var(--tx)", marginBottom: 4 }}>
                                    {selAudit.company} {viewMode === "compliance" ? "Official Audit Receipt" : ""}
                                </h2>
                                <Rw style={{ gap: 8 }}>
                                    <M size={12} color="var(--tx2)">{selAudit.year} ESG Report • {selAudit.agent} • {new Date().toLocaleDateString()}</M>
                                    {selAudit.llm_provider && getProviderBadge(selAudit.llm_provider)}
                                </Rw>
                            </div>
                            <Rw style={{ gap: 8 }}>
                                <div style={{ display: "flex", background: "var(--bg)", borderRadius: 8, padding: 4 }}>
                                    <button onClick={() => setViewMode("developer")} style={{ background: viewMode === "developer" ? "var(--sf)" : "transparent", border: "none", padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, color: viewMode === "developer" ? "var(--tx)" : "var(--tx3)", cursor: "pointer", transition: "all .2s", boxShadow: viewMode === "developer" ? "var(--shadow-sm)" : "none" }}>Developer</button>
                                    <button onClick={() => setViewMode("compliance")} style={{ background: viewMode === "compliance" ? "#fff" : "transparent", border: "none", padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, color: viewMode === "compliance" ? "var(--tx)" : "var(--tx3)", cursor: "pointer", transition: "all .2s", boxShadow: viewMode === "compliance" ? "var(--shadow-sm)" : "none" }}>Compliance</button>
                                </div>
                                {getStatusBadge(selAudit.status)}
                            </Rw>
                        </Rw>
                        <div style={{ height: 1, background: "var(--bd)", marginBottom: 16 }} />

                        {viewMode === "developer" ? (
                            <>
                                <M size={11} color="var(--tx3)" style={{ letterSpacing: ".05em", textTransform: "uppercase", fontWeight: 600, display: "block", marginBottom: 12 }}>Agent Reasoning Chain Log</M>
                                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                                    {selAudit.metrics.map((m, i) => (
                                        <div key={m.id} style={{ position: "relative" }}>
                                            {i !== selAudit.metrics.length - 1 && (
                                                <div style={{ position: "absolute", left: 16, top: 40, bottom: -40, width: 2, background: "var(--bd)" }} />
                                            )}
                                            <Rw style={{ gap: 16, alignItems: "flex-start" }}>
                                                <div style={{ width: 34, height: 34, borderRadius: "50%", background: m.state === "pass" ? "var(--jade)" : "var(--amb)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0, fontWeight: 700, marginTop: 2, zIndex: 2, boxShadow: "0 0 0 4px var(--sf)" }}>
                                                    {m.state === "pass" ? "✓" : "!"}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--tx)", marginBottom: 10 }}>{m.name}</div>
                                                    {/* Step 1: Claim */}
                                                    <div style={{ background: "var(--bg2)", border: "1px solid var(--bd)", borderRadius: 8, padding: 12, marginBottom: 8 }}>
                                                        <M size={10} color="var(--tx3)" style={{ textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700, display: "block", marginBottom: 4 }}>1. Extracted Claim</M>
                                                        <span style={{ fontFamily: "var(--disp)", fontSize: 18, fontWeight: 700, color: "var(--tx)" }}>{m.claim}</span>
                                                    </div>
                                                    {/* Step 2: Source */}
                                                    <div style={{ background: "rgba(37,99,235,.04)", border: "1px solid rgba(37,99,235,.15)", borderRadius: 8, padding: 12, marginBottom: 8 }}>
                                                        <Rw style={{ gap: 6, marginBottom: 4 }}>
                                                            <span style={{ fontSize: 12 }}>📄</span>
                                                            <M size={10} color="var(--blu)" style={{ textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 }}>2. Ground Truth Source</M>
                                                        </Rw>
                                                        <p style={{ fontSize: 13, color: "var(--tx2)", lineHeight: 1.5, fontStyle: "italic" }}>"{m.source}"</p>
                                                    </div>
                                                    {/* Step 3: Math */}
                                                    <div style={{ background: "var(--bg3)", border: "1px dashed var(--tx3)", borderRadius: 8, padding: 12, marginBottom: 8 }}>
                                                        <Rw style={{ gap: 6, marginBottom: 6 }}>
                                                            <span style={{ fontSize: 12 }}>🧮</span>
                                                            <M size={10} color="var(--tx2)" style={{ textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 }}>3. Deterministic Math Execution sandbox</M>
                                                        </Rw>
                                                        <M size={12} mono color="var(--tx2)" style={{ lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.math}</M>
                                                    </div>
                                                    {/* Step 4: Verdict */}
                                                    <div style={{ background: m.state === "pass" ? "rgba(16,185,129,.05)" : "rgba(217,119,6,.05)", border: `1px solid ${m.state === "pass" ? "rgba(16,185,129,.2)" : "rgba(217,119,6,.2)"}`, borderRadius: 8, padding: 12 }}>
                                                        <Rw style={{ gap: 6, marginBottom: 4 }}>
                                                            <span style={{ fontSize: 12 }}>{m.state === "pass" ? "✅" : "⚠️"}</span>
                                                            <M size={10} color={m.state === "pass" ? "var(--jade)" : "var(--amb)"} style={{ textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 }}>4. Semantic Verdict</M>
                                                        </Rw>
                                                        <p style={{ fontSize: 13, color: "var(--tx)", fontWeight: 500 }}>{m.verdict}</p>
                                                    </div>
                                                </div>
                                            </Rw>
                                        </div>
                                    ))}
                                </div>

                                {/* ---- Linguistic Analysis Section ---- */}
                                {selAudit.linguistic_flags && selAudit.linguistic_flags.length > 0 && (
                                    <div style={{ marginTop: 24 }}>
                                        <M size={11} color="var(--tx3)" style={{ letterSpacing: ".05em", textTransform: "uppercase", fontWeight: 600, display: "block", marginBottom: 12 }}>🔍 Language Analysis (ClimateBERT)</M>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                            {selAudit.linguistic_flags.map((flag, i) => (
                                                <div key={i} style={{ background: `${RISK_COLORS[flag.greenwashing_risk]}08`, border: `1px solid ${RISK_COLORS[flag.greenwashing_risk]}25`, borderRadius: 8, padding: 12 }}>
                                                    <Rw style={{ justifyContent: "space-between", marginBottom: 6 }}>
                                                        <Bdg style={{ background: `${RISK_COLORS[flag.greenwashing_risk]}15`, color: RISK_COLORS[flag.greenwashing_risk], border: `1px solid ${RISK_COLORS[flag.greenwashing_risk]}30`, fontSize: 10, fontWeight: 700 }}>{flag.greenwashing_risk} RISK</Bdg>
                                                        <M size={10} mono color="var(--tx3)">Confidence: {(flag.confidence * 100).toFixed(0)}%</M>
                                                    </Rw>
                                                    <p style={{ fontSize: 13, color: "var(--tx2)", fontStyle: "italic", margin: 0 }}>"{flag.sentence}"</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* ---- Disclosure Gaps Section ---- */}
                                {selAudit.absence_signals && selAudit.absence_signals.length > 0 && (
                                    <div style={{ marginTop: 24 }}>
                                        <M size={11} color="var(--tx3)" style={{ letterSpacing: ".05em", textTransform: "uppercase", fontWeight: 600, display: "block", marginBottom: 12 }}>📊 Disclosure Gaps (Absence Signals)</M>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                            {selAudit.absence_signals.map((sig, i) => (
                                                <div key={i} style={{ background: sig.severity === "HIGH" ? "rgba(239,68,68,.05)" : "rgba(245,158,11,.05)", border: `1px solid ${sig.severity === "HIGH" ? "rgba(239,68,68,.2)" : "rgba(245,158,11,.2)"}`, borderRadius: 8, padding: 12 }}>
                                                    <Rw style={{ gap: 8, marginBottom: 4 }}>
                                                        <Bdg style={{ background: sig.severity === "HIGH" ? "rgba(239,68,68,.1)" : "rgba(245,158,11,.1)", color: sig.severity === "HIGH" ? "#ef4444" : "#f59e0b", border: `1px solid ${sig.severity === "HIGH" ? "rgba(239,68,68,.3)" : "rgba(245,158,11,.3)"}`, fontSize: 10 }}>{sig.severity}</Bdg>
                                                        <M size={12} color="var(--tx)" style={{ fontWeight: 600 }}>{sig.metric_label}</M>
                                                    </Rw>
                                                    <M size={12} color="var(--tx2)">{sig.message}</M>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* ---- Accept/Reject Buttons ---- */}
                                {selAudit.status === "verified" && (
                                    <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
                                        {verdicts[selAudit.id] ? (
                                            <Cd style={{ padding: 16, flex: 1, textAlign: "center", background: verdicts[selAudit.id] === "accepted" ? "rgba(16,185,129,.05)" : "rgba(239,68,68,.05)" }}>
                                                <M size={14} color={verdicts[selAudit.id] === "accepted" ? "var(--jade)" : "#ef4444"} style={{ fontWeight: 700 }}>
                                                    {verdicts[selAudit.id] === "accepted" ? "✓ Verdict Accepted" : "✗ Flagged for Review"}
                                                </M>
                                            </Cd>
                                        ) : (
                                            <>
                                                <GlassBtn
                                                    onClick={() => submitVerdict(selAudit.id, "accepted")}
                                                    style={{ flex: 1, padding: 14, background: "rgba(16,185,129,.1)", color: "var(--jade)", border: "1px solid rgba(16,185,129,.3)", fontWeight: 700 }}
                                                >
                                                    ✓ Accept Verdict
                                                </GlassBtn>
                                                <GlassBtn
                                                    onClick={() => submitVerdict(selAudit.id, "rejected")}
                                                    style={{ flex: 1, padding: 14, background: "rgba(239,68,68,.05)", color: "#ef4444", border: "1px solid rgba(239,68,68,.2)", fontWeight: 700 }}
                                                >
                                                    ✗ Reject — Flag for Review
                                                </GlassBtn>
                                            </>
                                        )}
                                    </div>
                                )}
                            </>
                        ) : (
                            // COMPLIANCE VIEW (Audit Receipt)
                            <div style={{ background: "#ffffff", padding: 16, border: "1px solid var(--bd)", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,.03)" }}>
                                <div style={{ borderBottom: "2px solid #000", paddingBottom: 16, marginBottom: 16, textAlign: "center" }}>
                                    <h1 style={{ fontFamily: "serif", fontSize: 28, margin: 0, color: "#111" }}>Independent Assurance Receipt</h1>
                                    <p style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#666", marginTop: 8 }}>Generated by GreenOrb Deterministic AI Framework</p>
                                </div>

                                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24, fontSize: 13, textAlign: "left" }}>
                                    <thead>
                                        <tr style={{ background: "#f8f9fa", borderBottom: "1px solid #ccc" }}>
                                            <th style={{ padding: "10px", fontWeight: "bold", border: "1px solid #ddd" }}>Indicator</th>
                                            <th style={{ padding: "10px", fontWeight: "bold", border: "1px solid #ddd" }}>Claimed Figure</th>
                                            <th style={{ padding: "10px", fontWeight: "bold", border: "1px solid #ddd" }}>Mathematical Verification</th>
                                            <th style={{ padding: "10px", fontWeight: "bold", border: "1px solid #ddd" }}>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selAudit.metrics.map(m => (
                                            <tr key={m.id} style={{ borderBottom: "1px solid #eee" }}>
                                                <td style={{ padding: "12px 10px", border: "1px solid #ddd", fontWeight: 600 }}>{m.name}</td>
                                                <td style={{ padding: "12px 10px", border: "1px solid #ddd", fontFamily: "var(--mono)" }}>{m.claim}</td>
                                                <td style={{ padding: "12px 10px", border: "1px solid #ddd", color: "#444" }}>Verified derived sum matches source text.</td>
                                                <td style={{ padding: "12px 10px", border: "1px solid #ddd", fontWeight: "bold", color: m.state === "pass" ? "#059669" : "#d97706" }}>
                                                    {m.state === "pass" ? "✔ VERIFIED" : "⚠ DISCREPANCY"}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                {/* Linguistic Analysis Table */}
                                {selAudit.linguistic_flags && selAudit.linguistic_flags.length > 0 && (
                                    <div style={{ marginBottom: 24 }}>
                                        <h4 style={{ fontSize: 14, borderBottom: "1px solid #ccc", paddingBottom: 4, marginBottom: 8 }}>Language Analysis</h4>
                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                            <thead><tr style={{ background: "#f8f9fa" }}>
                                                <th style={{ padding: 8, border: "1px solid #ddd", textAlign: "left" }}>Flagged Statement</th>
                                                <th style={{ padding: 8, border: "1px solid #ddd", width: 80 }}>Risk</th>
                                            </tr></thead>
                                            <tbody>
                                                {selAudit.linguistic_flags.map((f, i) => (
                                                    <tr key={i}><td style={{ padding: 8, border: "1px solid #ddd", fontStyle: "italic" }}>"{f.sentence}"</td><td style={{ padding: 8, border: "1px solid #ddd", fontWeight: 700, color: RISK_COLORS[f.greenwashing_risk], textAlign: "center" }}>{f.greenwashing_risk}</td></tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* Disclosure Gaps Table */}
                                {selAudit.absence_signals && selAudit.absence_signals.length > 0 && (
                                    <div style={{ marginBottom: 24 }}>
                                        <h4 style={{ fontSize: 14, borderBottom: "1px solid #ccc", paddingBottom: 4, marginBottom: 8 }}>Disclosure Gaps</h4>
                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                            <thead><tr style={{ background: "#f8f9fa" }}>
                                                <th style={{ padding: 8, border: "1px solid #ddd", textAlign: "left" }}>Missing Metric</th>
                                                <th style={{ padding: 8, border: "1px solid #ddd", width: 100 }}>Peer Rate</th>
                                                <th style={{ padding: 8, border: "1px solid #ddd", width: 80 }}>Severity</th>
                                            </tr></thead>
                                            <tbody>
                                                {selAudit.absence_signals.map((s, i) => (
                                                    <tr key={i}><td style={{ padding: 8, border: "1px solid #ddd" }}>{s.metric_label}</td><td style={{ padding: 8, border: "1px solid #ddd", textAlign: "center" }}>{s.peer_rate}%</td><td style={{ padding: 8, border: "1px solid #ddd", textAlign: "center", fontWeight: 700, color: s.severity === "HIGH" ? "#ef4444" : "#f59e0b" }}>{s.severity}</td></tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                <div>
                                    <h4 style={{ fontSize: 14, borderBottom: "1px solid #ccc", paddingBottom: 4, marginBottom: 8 }}>Source Attestation</h4>
                                    {selAudit.metrics.map(m => (
                                        <div key={`source-${m.id}`} style={{ marginBottom: 12, fontSize: 12, color: "#444" }}>
                                            <strong>{m.name}:</strong> {m.source}
                                        </div>
                                    ))}
                                </div>

                                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 40, borderTop: "1px solid #ddd", paddingTop: 16 }}>
                                    <div>
                                        <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#666" }}>Signature ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
                                    </div>
                                    <div style={{ textAlign: "right" }}>
                                        <div style={{ fontFamily: "Brush Script MT, cursive", fontSize: 24, color: "#000" }}>Agent {selAudit.agent}</div>
                                        <p style={{ fontSize: 11, color: "#666" }}>Automated Compliance Officer</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div style={{ marginTop: 24, textAlign: "right" }}>
                            {viewMode === "compliance" && <GlassBtn primary onClick={() => window.print()} style={{ display: "inline-flex", width: "auto" }}>🖨️ Print / Export PDF</GlassBtn>}
                        </div>
                    </Cd>
                </div>
            )}
        </div>
    );
}
