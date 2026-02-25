import React, { useState, useEffect, useRef } from "react";
import { gradeToColor } from "../utils";
import { geminiGeneratePDF, parseGeminiStream } from "../utils";
import { M, Bdg, Cd, Rw, PBar, Spin, SHd, Dot } from "../components/primitives";

export default function ScanTab() {
    const [phase, setPhase] = useState("idle");
    const [fileName, setFileName] = useState("");
    const [fileSize, setFileSize] = useState("");
    const [reportText, setReportText] = useState("");
    const [errMsg, setErrMsg] = useState("");
    const [progress, setProgress] = useState(0);
    const [elapsed, setElapsed] = useState(0);
    const [greendex, setGreendex] = useState(null);
    const timerRef = useRef(null);
    const bottomRef = useRef(null);

    useEffect(() => {
        const m = reportText.match(/greendex[^\d]*(\d+)/i);
        if (m) setGreendex(parseInt(m[1]));
        if (bottomRef.current && (phase === "streaming" || phase === "done")) {
            bottomRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [reportText, phase]);

    const toBase64 = f => new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = () => rej(new Error("Read failed"));
        r.readAsDataURL(f);
    });

    const analyze = async (file) => {
        if (!file) return;
        if (file.type !== "application/pdf") { setErrMsg("Please upload a PDF file."); setPhase("error"); return; }
        if (file.size > 20 * 1024 * 1024) { setErrMsg("File too large (max 20MB)."); setPhase("error"); return; }
        setFileName(file.name);
        setFileSize((file.size / 1024).toFixed(0) + " KB");
        setReportText(""); setProgress(0); setElapsed(0); setGreendex(null); setPhase("scanning");

        const t0 = Date.now();
        timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
        const pIv = setInterval(() => setProgress(p => p < 32 ? p + 3 : p), 120);

        let b64;
        try { b64 = await toBase64(file); }
        catch { clearInterval(pIv); clearInterval(timerRef.current); setErrMsg("Could not read file."); setPhase("error"); return; }

        clearInterval(pIv); setProgress(42); setPhase("streaming");

        const systemPrompt = `You are GreenOrb's Carbon Intelligence Engine. Analyze any document and produce a structured carbon footprint report with these ## sections: Executive Summary, Greendex Score (write "Greendex Score: XX/100"), Scope 1 Emissions (write "X.X tCO2e"), Scope 2 Emissions, Scope 3 Emissions, Carbon Hotspots, Regulatory Compliance (EU DPP/CBAM/BRSR), ⚠ Risk Flags (prefix each with ⚠), ✅ Recommended Actions (prefix each with ✅), Calculation Methodology Used. Be quantitative — estimate from industry benchmarks if direct data is absent, labeling estimates clearly.`;

        try {
            const res = await geminiGeneratePDF(
                b64,
                "Analyze this document. Produce the full GreenOrb carbon & ESG report.",
                systemPrompt,
                true
            );
            setProgress(50);
            let chars = 0;
            for await (const chunk of parseGeminiStream(res)) {
                chars += chunk.length;
                setReportText(p => p + chunk);
                setProgress(Math.min(50 + Math.floor((chars / 2800) * 48), 95));
            }
            setProgress(100);
            clearInterval(timerRef.current);
            setPhase("done");
        } catch (e) {
            clearInterval(timerRef.current);
            setErrMsg(e.message || "Analysis failed.");
            setPhase("error");
        }
    };

    const reset = () => { setPhase("idle"); setReportText(""); setErrMsg(""); setProgress(0); setGreendex(null); setFileName(""); };
    const gc = greendex ? gradeToColor(greendex >= 75 ? "A" : greendex >= 50 ? "B" : "C") : "var(--tx3)";
    const flags = reportText.split("\n").filter(l => /⚠/.test(l)).map(l => l.replace(/^[#\-•*\s⚠]+/, "").trim()).filter(l => l.length > 5).slice(0, 5);
    const recs = reportText.split("\n").filter(l => /✅/.test(l)).map(l => l.replace(/^[#\-•*\s✅]+/, "").trim()).filter(l => l.length > 5).slice(0, 5);

    return (
        <div style={{ padding: "16px 14px" }}>
            <SHd tag="ai carbon analyzer" title="PDF Carbon Report" sub="Upload any financial, ESG, or supply chain document for instant AI analysis" />

            {(phase === "idle" || phase === "error") && (
                <div style={{ animation: "fadeUp .4s ease" }}>
                    {phase === "error" && (
                        <Cd danger style={{ padding: 14, marginBottom: 14, display: "flex", gap: 12, alignItems: "center" }}>
                            <span style={{ fontSize: 20 }}>⚠</span>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--red)", marginBottom: 3 }}>Upload Failed</div>
                                <p style={{ fontSize: 12, color: "var(--tx2)" }}>{errMsg}</p>
                            </div>
                        </Cd>
                    )}

                    <label htmlFor="greenorb-pdf" style={{ display: "block", cursor: "pointer", marginBottom: 14 }}>
                        <input id="greenorb-pdf" type="file" accept="application/pdf"
                            onChange={e => { const f = e.target.files?.[0]; if (f) analyze(f); e.target.value = ""; }}
                            style={{ display: "none" }} />
                        <div style={{ border: "2px dashed rgba(0,232,122,.3)", borderRadius: 16, padding: "32px 20px", textAlign: "center", background: "rgba(0,232,122,.03)", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 72, height: 72, borderRadius: 18, background: "var(--jg)", border: "1px solid rgba(0,232,122,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 }}>📄</div>
                            <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 20, color: "var(--tx)" }}>Tap to Upload PDF</div>
                            <M size={12} color="var(--tx3)">File picker opens immediately</M>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                                {["Invoices", "Utility Bills", "ESG Reports", "Supply Chain", "Audit Reports"].map(t => <Bdg key={t} color="cyan">{t}</Bdg>)}
                            </div>
                            <div style={{ width: "100%", background: "var(--jade)", borderRadius: 12, padding: "14px", fontFamily: "var(--disp)", fontWeight: 800, fontSize: 16, color: "#000" }}>⬆ Choose PDF File</div>
                        </div>
                    </label>

                    <Cd style={{ padding: 14 }}>
                        <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>What you'll get instantly</div>
                        {[["◎", "Greendex Score", "0–100 environmental index"], ["📊", "Scope 1/2/3", "Full GHG Protocol breakdown with methodology"], ["⚠", "Risk Flags", "Greenwashing & compliance gaps"], ["✅", "Action Plan", "Specific steps to reduce emissions"], ["📐", "Calculation", "How each number was derived"]].map(([ic, lb, ds]) => (
                            <Rw key={lb} style={{ padding: "8px 0", borderBottom: "1px solid var(--bg3)" }}>
                                <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--jg)", border: "1px solid rgba(0,232,122,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{ic}</div>
                                <div><div style={{ fontSize: 12, fontWeight: 700, color: "var(--tx)" }}>{lb}</div><M size={10} color="var(--tx3)">{ds}</M></div>
                            </Rw>
                        ))}
                    </Cd>
                </div>
            )}

            {phase === "scanning" && (
                <Cd accent style={{ padding: 20 }}>
                    <Rw style={{ gap: 14, marginBottom: 16 }}>
                        <div style={{ width: 56, height: 56, borderRadius: 12, border: "1px solid rgba(0,232,122,.3)", background: "rgba(0,232,122,.04)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0, position: "relative", overflow: "hidden" }}>
                            <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: "linear-gradient(90deg,transparent,var(--jade),transparent)", animation: "scan 1.2s ease-in-out infinite" }} />📄
                        </div>
                        <div>
                            <M size={10} color="var(--jade)" style={{ display: "block", marginBottom: 4, letterSpacing: ".1em" }}>// READING DOCUMENT</M>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--tx)", wordBreak: "break-all" }}>{fileName}</div>
                            <M size={10} color="var(--tx3)">{fileSize}</M>
                        </div>
                    </Rw>
                    <Rw style={{ justifyContent: "space-between", marginBottom: 5 }}>
                        <M size={11} color="var(--tx2)">Encoding for Gemini AI…</M>
                        <M size={11} color="var(--jade)">{progress}%</M>
                    </Rw>
                    <PBar v={progress} h={6} animate />
                </Cd>
            )}

            {(phase === "streaming" || phase === "done") && (
                <div>
                    <Cd accent style={{ padding: 13, marginBottom: 14 }}>
                        <Rw style={{ justifyContent: "space-between", marginBottom: 7 }}>
                            <Rw style={{ gap: 8 }}>
                                {phase === "streaming" ? <Dot pulse size={6} /> : <span style={{ color: "var(--jade)" }}>✓</span>}
                                <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 13, color: phase === "streaming" ? "var(--jade)" : "var(--tx)" }}>{phase === "streaming" ? "Gemini AI is reading…" : "Analysis Complete"}</span>
                            </Rw>
                            <Rw style={{ gap: 6 }}>
                                <M size={10} color="var(--tx3)">{elapsed}s</M>
                                <Bdg color={phase === "streaming" ? "amb" : "jade"}>{phase === "streaming" ? "STREAMING" : "DONE"}</Bdg>
                            </Rw>
                        </Rw>
                        <PBar v={phase === "done" ? 100 : progress} h={4} animate />
                    </Cd>

                    {greendex && (
                        <Cd accent style={{ padding: 18, marginBottom: 14, display: "flex", gap: 16, alignItems: "center" }}>
                            <div style={{ position: "relative", width: 76, height: 76, flexShrink: 0 }}>
                                <svg width="76" height="76" viewBox="0 0 76 76" style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
                                    <circle cx="38" cy="38" r="32" fill="none" stroke="var(--bg3)" strokeWidth="6" />
                                    <circle cx="38" cy="38" r="32" fill="none" stroke={gc} strokeWidth="6"
                                        strokeDasharray={`${(greendex / 100) * 201} 201`} strokeLinecap="round"
                                        style={{ transition: "stroke-dasharray 1s ease" }} />
                                </svg>
                                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                                    <span style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 600, color: gc, lineHeight: 1 }}>{greendex}</span>
                                    <M size={8} color="var(--tx3)">/100</M>
                                </div>
                            </div>
                            <div>
                                <M size={10} color="var(--jade)" style={{ display: "block", marginBottom: 3, letterSpacing: ".1em" }}>// GREENDEX SCORE</M>
                                <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 20, color: gc, marginBottom: 5 }}>
                                    {greendex >= 75 ? "Strong Performance" : greendex >= 50 ? "Moderate Risk" : "Critical Issues"}
                                </div>
                                <Bdg color={greendex >= 75 ? "jade" : greendex >= 50 ? "amb" : "red"}>
                                    {greendex >= 75 ? "COMPLIANT" : greendex >= 50 ? "NEEDS ACTION" : "HIGH RISK"}
                                </Bdg>
                            </div>
                        </Cd>
                    )}

                    {flags.length > 0 && (
                        <Cd danger style={{ padding: 14, marginBottom: 12 }}>
                            <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 13, color: "var(--red)", marginBottom: 8 }}>⚠ Risk Flags</div>
                            {flags.map((f, i) => <div key={i} style={{ fontSize: 12, color: "var(--tx)", lineHeight: 1.65, padding: "6px 0", borderBottom: "1px solid var(--bg3)", display: "flex", gap: 8 }}><span style={{ color: "var(--red)", flexShrink: 0 }}>!</span>{f}</div>)}
                        </Cd>
                    )}
                    {recs.length > 0 && (
                        <Cd accent style={{ padding: 14, marginBottom: 12 }}>
                            <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 13, color: "var(--jade)", marginBottom: 8 }}>✅ Recommendations</div>
                            {recs.map((r, i) => <div key={i} style={{ fontSize: 12, color: "var(--tx)", lineHeight: 1.65, padding: "6px 0", borderBottom: "1px solid var(--bg3)", display: "flex", gap: 8 }}><span style={{ color: "var(--jade)", flexShrink: 0 }}>→</span>{r}</div>)}
                        </Cd>
                    )}

                    <Cd style={{ padding: 14, marginBottom: 12 }}>
                        <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 13, color: "var(--tx2)", marginBottom: 10 }}>Full AI Report</div>
                        <div style={{ fontSize: 12, color: "var(--tx2)", lineHeight: 1.85, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                            {reportText}
                            {phase === "streaming" && <span style={{ display: "inline-block", width: 6, height: 12, background: "var(--jade)", borderRadius: 1, animation: "blink .8s infinite", marginLeft: 2, verticalAlign: "middle" }} />}
                        </div>
                        <div ref={bottomRef} />
                    </Cd>

                    {phase === "done" && (
                        <div style={{ display: "flex", gap: 10 }}>
                            <button onClick={reset} style={{ flex: 1, padding: 13, borderRadius: 12, border: "1px solid var(--bd2)", background: "var(--sf)", color: "var(--tx2)", fontFamily: "var(--disp)", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>← New Doc</button>
                            <label htmlFor="greenorb-pdf2" style={{ flex: 1, display: "block", cursor: "pointer" }}>
                                <input id="greenorb-pdf2" type="file" accept="application/pdf"
                                    onChange={e => { const f = e.target.files?.[0]; if (f) { reset(); setTimeout(() => analyze(f), 100); } e.target.value = ""; }}
                                    style={{ display: "none" }} />
                                <div style={{ padding: 13, borderRadius: 12, background: "var(--jade)", color: "#000", fontFamily: "var(--disp)", fontWeight: 800, fontSize: 14, textAlign: "center", boxShadow: "0 0 20px rgba(0,232,122,.3)" }}>⬆ Analyze Another</div>
                            </label>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
