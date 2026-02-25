import React, { useState, useEffect, useRef, useCallback } from "react";
import { storage, geminiGenerate, parseGeminiStream } from "../utils";
import { M, Bdg, Cd, Rw, Spin, Dot, SHd } from "../components/primitives";
import { gradeToBdg } from "../utils";

const ESG_SECTORS = [
    "Technology companies Asia ESG carbon report 2024",
    "European manufacturing ESG carbon reports 2024",
    "Indian MSME sustainability carbon footprint",
    "African energy companies carbon emissions",
    "South American food agriculture ESG report",
    "Middle East petrochemical sustainability 2024",
    "Global fashion brands ESG carbon footprint 2024",
    "Healthcare companies carbon footprint ESG",
    "Mining companies sustainability report 2024",
    "Global logistics shipping carbon emissions 2024",
];

const SYSTEM_PROMPT = `You are an ESG data extraction agent. Search for companies in the given sector/region and extract their carbon emissions data and ESG report URLs. For each company found, output one line in this EXACT format:
COMPANY|||sector|||country|||estimated_CO2_Mt|||ESG_grade|||report_URL|||key_products
Extract at least 8-12 companies. Only output these pipe-delimited lines, nothing else. No headers, no markdown.`;

export default function AgentTab() {
    const [running, setRunning] = useState(false);
    const [feed, setFeed] = useState([]);
    const [dbSize, setDbSize] = useState(0);
    const [sectorIdx, setSectorIdx] = useState(0);
    const [currentQuery, setCurrentQuery] = useState("");
    const [streamText, setStreamText] = useState("");
    const [totalFound, setTotalFound] = useState(0);
    const [db, setDb] = useState([]);
    const stopRef = useRef(false);
    const feedRef = useRef(null);

    useEffect(() => {
        const stored = storage.get("greenorb_agent_db");
        if (stored) { try { const d = JSON.parse(stored.value); setDb(d); setDbSize(d.length); setTotalFound(d.length); } catch { } }
        const storedFeed = storage.get("greenorb_feed");
        if (storedFeed) { try { setFeed(JSON.parse(storedFeed.value).slice(-20)); } catch { } }
    }, []);

    useEffect(() => {
        if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }, [feed]);

    const addToFeed = useCallback((msg, type = "info") => {
        const entry = { msg, type, ts: new Date().toLocaleTimeString() };
        setFeed(prev => {
            const next = [...prev, entry].slice(-50);
            storage.set("greenorb_feed", JSON.stringify(next));
            return next;
        });
    }, []);

    const runSearch = async (query) => {
        setCurrentQuery(query);
        setStreamText("");
        addToFeed(`🔍 Searching: "${query}"`, "search");
        try {
            const res = await geminiGenerate(
                `Search for ESG reports and carbon emissions data for: ${query}. Extract company names, CO2 emissions (in Mt), ESG grades, and report URLs.`,
                SYSTEM_PROMPT, true
            );
            let full = "";
            for await (const chunk of parseGeminiStream(res)) {
                if (stopRef.current) break;
                full += chunk;
                setStreamText(full);
            }
            const discovered = full.split("\n").filter(l => l.includes("|||")).map(l => {
                const parts = l.split("|||");
                if (parts.length >= 4) return { name: parts[0]?.trim(), sector: parts[1]?.trim(), country: parts[2]?.trim(), co2: parts[3]?.trim(), grade: parts[4]?.trim(), url: parts[5]?.trim(), products: parts[6]?.trim() };
                return null;
            }).filter(Boolean);

            if (discovered.length > 0) {
                addToFeed(`✓ Found ${discovered.length} companies with ESG data`, "success");
                setDb(prev => {
                    const existing = new Set(prev.map(c => c.name));
                    const newOnes = discovered.filter(c => c.name && !existing.has(c.name));
                    const next = [...prev, ...newOnes].slice(-500);
                    setDbSize(next.length);
                    setTotalFound(p => p + newOnes.length);
                    storage.set("greenorb_agent_db", JSON.stringify(next));
                    return next;
                });
                discovered.slice(0, 3).forEach(c => addToFeed(`📊 ${c.name} (${c.country || "—"}): ${c.co2} Mt CO₂`, "data"));
            } else {
                addToFeed("ℹ No structured data found in this search", "info");
            }
        } catch (e) {
            addToFeed(`⚠ Error: ${e.message?.slice(0, 80)}`, "error");
        }
    };

    const startAgent = async () => {
        stopRef.current = false;
        setRunning(true);
        addToFeed("🤖 GreenOrb ESG Agent started — continuous discovery mode", "system");
        let idx = sectorIdx;
        while (!stopRef.current) {
            const query = ESG_SECTORS[idx % ESG_SECTORS.length];
            await runSearch(query);
            if (stopRef.current) break;
            setSectorIdx(idx % ESG_SECTORS.length);
            addToFeed("⏳ Next search in 5s…", "info");
            await new Promise(r => setTimeout(r, 5000));
            idx++;
        }
        setRunning(false);
        addToFeed("⏹ Agent paused", "system");
    };

    const stopAgent = () => { stopRef.current = true; setRunning(false); };

    const feedColors = { search: "var(--cyan)", success: "var(--jade)", error: "var(--red)", system: "var(--pur)", data: "var(--tx2)", info: "var(--tx3)" };

    return (
        <div style={{ padding: "16px 14px" }}>
            <SHd tag="continuous ai esg scraper" title="ESG Discovery Agent" sub="AI continuously searches for ESG reports globally and builds our carbon database" />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                {[{ l: "Discovered", v: totalFound, c: "var(--jade)" }, { l: "In DB", v: dbSize, c: "var(--cyan)" }, { l: "Sectors", v: ESG_SECTORS.length, c: "var(--amb)" }].map(s => (
                    <Cd key={s.l} style={{ padding: "12px 10px", textAlign: "center" }}>
                        <div style={{ fontFamily: "var(--mono)", fontSize: 22, color: s.c, fontWeight: 500 }}>{s.v}</div>
                        <M size={9} color="var(--tx3)" style={{ display: "block" }}>{s.l}</M>
                    </Cd>
                ))}
            </div>

            {!running ? (
                <button onClick={startAgent} style={{ width: "100%", padding: 16, borderRadius: 12, border: "none", background: "var(--jade)", color: "#000", fontFamily: "var(--disp)", fontWeight: 800, fontSize: 16, cursor: "pointer", marginBottom: 14, boxShadow: "0 0 24px rgba(0,232,122,.35)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <span>🤖</span> Start ESG Discovery Agent
                </button>
            ) : (
                <button onClick={stopAgent} style={{ width: "100%", padding: 16, borderRadius: 12, border: "1px solid rgba(255,77,77,.4)", background: "rgba(255,77,77,.08)", color: "var(--red)", fontFamily: "var(--disp)", fontWeight: 800, fontSize: 16, cursor: "pointer", marginBottom: 14 }}>
                    ⏹ Stop Agent
                </button>
            )}

            {running && currentQuery && (
                <Cd accent style={{ padding: 12, marginBottom: 12 }}>
                    <Rw style={{ gap: 8, marginBottom: 8 }}>
                        <Spin size={14} />
                        <M size={11} color="var(--jade)">Searching: {currentQuery}</M>
                    </Rw>
                    {streamText && (
                        <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--tx3)", background: "var(--bg3)", borderRadius: 8, padding: 10, maxHeight: 100, overflowY: "auto", lineHeight: 1.7 }}>
                            {streamText.slice(-400)}
                            <span style={{ animation: "blink .8s infinite", display: "inline-block" }}>▌</span>
                        </div>
                    )}
                </Cd>
            )}

            <Cd style={{ padding: 14, marginBottom: 14 }}>
                <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Search Queue</div>
                {ESG_SECTORS.map((s, i) => (
                    <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--bg3)" }}>
                        <div style={{ width: 18, height: 18, borderRadius: "50%", background: i === sectorIdx && running ? "var(--jade)" : "var(--bg3)", border: `1px solid ${i === sectorIdx && running ? "var(--jade)" : "var(--bd2)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 9, color: i === sectorIdx && running ? "#000" : "var(--tx3)" }}>
                            {i === sectorIdx && running ? "▶" : `${i + 1}`}
                        </div>
                        <M size={11} color={i === sectorIdx && running ? "var(--jade)" : "var(--tx2)"}>{s}</M>
                    </div>
                ))}
            </Cd>

            <Cd style={{ padding: 14, marginBottom: 14 }}>
                <Rw style={{ justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 13 }}>Discovery Feed</span>
                    {running && <Dot pulse size={6} />}
                </Rw>
                <div ref={feedRef} style={{ maxHeight: 200, overflowY: "auto" }}>
                    {feed.length === 0
                        ? <M size={11} color="var(--tx3)">Start the agent to begin discovery…</M>
                        : feed.map((f, i) => (
                            <div key={i} style={{ display: "flex", gap: 8, padding: "4px 0", borderBottom: "1px solid var(--bg3)" }}>
                                <M size={9} color="var(--tx3)" style={{ flexShrink: 0 }}>{f.ts}</M>
                                <M size={11} color={feedColors[f.type] || "var(--tx2)"} style={{ lineHeight: 1.5 }}>{f.msg}</M>
                            </div>
                        ))
                    }
                </div>
            </Cd>

            {db.length > 0 && (
                <Cd style={{ padding: 14, marginBottom: 14 }}>
                    <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>🗄 Discovered Database ({db.length})</div>
                    {db.slice(-10).reverse().map((c, i) => (
                        <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--bg3)" }}>
                            <Rw style={{ justifyContent: "space-between" }}>
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--tx)" }}>{c.name}</div>
                                    <M size={10} color="var(--tx3)">{c.country} · {c.sector}</M>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    {c.co2 && <M size={11} color="var(--jade)" style={{ display: "block" }}>{c.co2}Mt</M>}
                                    {c.grade && c.grade !== "undefined" && <Bdg color={gradeToBdg(c.grade)}>{c.grade}</Bdg>}
                                </div>
                            </Rw>
                            {c.url && c.url !== "undefined" && c.url.startsWith("http") && (
                                <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "var(--jd)", textDecoration: "underline", display: "block", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.url}</a>
                            )}
                        </div>
                    ))}
                    <button onClick={() => { storage.delete("greenorb_agent_db"); storage.delete("greenorb_feed"); setDb([]); setFeed([]); setDbSize(0); setTotalFound(0); }} style={{ marginTop: 12, padding: "8px", width: "100%", borderRadius: 8, border: "1px solid var(--bd2)", background: "transparent", color: "var(--tx3)", fontFamily: "var(--body)", fontSize: 12, cursor: "pointer" }}>Clear Database</button>
                </Cd>
            )}

            <Cd style={{ padding: 14, borderColor: "rgba(0,212,232,.2)", background: "rgba(0,212,232,.02)" }}>
                <M size={10} color="var(--cyan)" style={{ display: "block", marginBottom: 8, letterSpacing: ".08em", textTransform: "uppercase" }}>Why GreenOrb exists</M>
                <p style={{ fontSize: 12, color: "var(--tx2)", lineHeight: 1.8 }}>
                    <strong style={{ color: "var(--tx)" }}>The problem:</strong> There is no single database of carbon footprints for every company, product, and country in the world. ESG reports are scattered across thousands of PDFs.<br /><br />
                    <strong style={{ color: "var(--tx)" }}>What we're building:</strong> An AI agent that continuously discovers, reads, and maps every publicly available ESG report — creating the world's most comprehensive open carbon intelligence library.<br /><br />
                    <strong style={{ color: "var(--jade)" }}>Target:</strong> Map 10M+ product carbon footprints · 500k+ companies · All 195 countries.
                </p>
            </Cd>
        </div>
    );
}
