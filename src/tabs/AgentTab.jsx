import React, { useState, useEffect, useRef, useCallback } from "react";
import { storage, geminiGenerate, parseGeminiStream, gradeToBdg } from "../utils";
import { M, Bdg, Cd, Rw, Spin, Dot, SHd } from "../components/primitives";

const SEED_SECTORS = [
    "Fortune 500 technology companies",
    "European manufacturing companies",
    "Indian MSME and mid-cap companies",
    "African energy and mining companies",
    "South American food and agriculture companies",
    "Middle East oil gas petrochemical companies",
    "Global fashion and clothing brands",
    "Pharmaceutical and healthcare companies",
    "Mining and metals companies globally",
    "Global logistics and shipping companies",
    "Consumer goods and FMCG companies",
    "Automotive and EV manufacturers",
    "Chemical companies globally",
    "Banking and financial institutions with ESG",
    "Construction and real estate companies",
];

// Tier 1: Use AI to generate a list of real company names for a sector
const QUERY_GEN_PROMPT = `You are a research assistant. Given a sector description, list 15 real, specific company names that operate in that sector. Output ONLY the company names, one per line, no numbers, no extra text. Focus on well-known companies that publish sustainability or ESG reports.`;

// Tier 2: Extract ESG data for specific companies
const DATA_EXTRACT_PROMPT = `You are an ESG data extraction agent. Search for the given company's sustainability/ESG report and extract carbon emissions data. Output ONLY in this EXACT format (one line per company found):
COMPANY|||sector|||country|||estimated_CO2_Mt|||ESG_grade|||report_URL|||key_products
No headers, no markdown, no extra text. If you cannot find data, output the company name with "N/A" for missing fields.`;

export default function AgentTab() {
    const [running, setRunning] = useState(false);
    const [feed, setFeed] = useState([]);
    const [dbSize, setDbSize] = useState(0);
    const [currentPhase, setCurrentPhase] = useState("");
    const [currentQuery, setCurrentQuery] = useState("");
    const [streamText, setStreamText] = useState("");
    const [totalFound, setTotalFound] = useState(0);
    const [db, setDb] = useState([]);
    const [customPrompt, setCustomPrompt] = useState("");
    const [sectorIdx, setSectorIdx] = useState(0);
    const [companyQueue, setCompanyQueue] = useState([]);
    const [searchesRemaining, setSearchesRemaining] = useState(0);
    const stopRef = useRef(false);
    const feedRef = useRef(null);

    // Load persisted data on mount
    useEffect(() => {
        const stored = storage.get("greenorb_agent_db");
        if (stored) { try { const d = JSON.parse(stored.value); setDb(d); setDbSize(d.length); setTotalFound(d.length); } catch { } }
        const storedFeed = storage.get("greenorb_feed");
        if (storedFeed) { try { setFeed(JSON.parse(storedFeed.value).slice(-30)); } catch { } }
        const storedIdx = storage.get("greenorb_sector_idx");
        if (storedIdx) { try { setSectorIdx(parseInt(storedIdx.value) || 0); } catch { } }
    }, []);

    useEffect(() => {
        if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }, [feed]);

    const addToFeed = useCallback((msg, type = "info") => {
        const entry = { msg, type, ts: new Date().toLocaleTimeString() };
        setFeed(prev => {
            const next = [...prev, entry].slice(-80);
            storage.set("greenorb_feed", JSON.stringify(next));
            return next;
        });
    }, []);

    const addToDb = useCallback((newEntries) => {
        setDb(prev => {
            const existing = new Set(prev.map(c => c.name?.toLowerCase()));
            const unique = newEntries.filter(c => c.name && !existing.has(c.name.toLowerCase()));
            const next = [...prev, ...unique].slice(-2000);
            setDbSize(next.length);
            setTotalFound(p => p + unique.length);
            storage.set("greenorb_agent_db", JSON.stringify(next));
            return next;
        });
    }, []);

    // Tier 1: Generate company names for a sector
    const generateCompanyList = async (sectorDesc) => {
        setCurrentPhase("🧠 Tier 1 — Generating company names");
        setCurrentQuery(sectorDesc);
        addToFeed(`🧠 Tier 1: Generating company names for "${sectorDesc}"`, "search");
        setStreamText("");

        try {
            const res = await geminiGenerate(
                `List 15 specific real company names in this sector: ${sectorDesc}`,
                QUERY_GEN_PROMPT, true
            );
            let full = "";
            for await (const chunk of parseGeminiStream(res)) {
                if (stopRef.current) return [];
                full += chunk;
                setStreamText(full);
            }
            const companies = full.split("\n")
                .map(l => l.replace(/^\d+[\.\)\-]\s*/, "").trim())
                .filter(l => l.length > 2 && l.length < 80 && !l.includes("|||"));

            addToFeed(`✓ Generated ${companies.length} company names to search`, "success");
            return companies;
        } catch (e) {
            addToFeed(`⚠ Tier 1 error: ${e.message?.slice(0, 60)}`, "error");
            return [];
        }
    };

    // Tier 2: Search specific company for ESG data
    const searchCompany = async (companyName) => {
        setCurrentPhase("🔍 Tier 2 — Extracting ESG data");
        const query = `${companyName} sustainability report ESG carbon emissions CO2`;
        setCurrentQuery(query);
        addToFeed(`🔍 Searching: ${companyName}`, "search");
        setStreamText("");

        try {
            const res = await geminiGenerate(
                `Search for the sustainability/ESG report of "${companyName}". Find their carbon emissions (Scope 1, 2, 3), ESG grade, and report URL. Extract structured data.`,
                DATA_EXTRACT_PROMPT, true
            );
            let full = "";
            for await (const chunk of parseGeminiStream(res)) {
                if (stopRef.current) return;
                full += chunk;
                setStreamText(full);
            }

            const discovered = full.split("\n").filter(l => l.includes("|||")).map(l => {
                const parts = l.split("|||");
                if (parts.length >= 4) return {
                    name: parts[0]?.trim(),
                    sector: parts[1]?.trim(),
                    country: parts[2]?.trim(),
                    co2: parts[3]?.trim(),
                    grade: parts[4]?.trim(),
                    url: parts[5]?.trim(),
                    products: parts[6]?.trim(),
                    discoveredAt: new Date().toISOString(),
                };
                return null;
            }).filter(Boolean);

            if (discovered.length > 0) {
                addToFeed(`📊 ${discovered[0].name}: ${discovered[0].co2} Mt CO₂`, "data");
                addToDb(discovered);
            } else {
                addToFeed(`ℹ No structured data found for ${companyName}`, "info");
            }
        } catch (e) {
            addToFeed(`⚠ Error: ${e.message?.slice(0, 60)}`, "error");
        }
    };

    // Main agent loop
    const startAgent = async () => {
        stopRef.current = false;
        setRunning(true);
        addToFeed("🤖 GreenOrb ESG Agent v2 started — two-tier intelligent discovery", "system");

        let idx = sectorIdx;
        while (!stopRef.current) {
            // Tier 1: Get company names for this sector
            const sector = SEED_SECTORS[idx % SEED_SECTORS.length];
            const companies = await generateCompanyList(sector);

            if (stopRef.current) break;

            // Tier 2: Search each company individually
            setCompanyQueue(companies);
            setSearchesRemaining(companies.length);
            for (let i = 0; i < companies.length; i++) {
                if (stopRef.current) break;
                setSearchesRemaining(companies.length - i);
                await searchCompany(companies[i]);
                // Brief pause between searches to avoid rate limiting
                if (!stopRef.current) await new Promise(r => setTimeout(r, 2000));
            }

            if (stopRef.current) break;

            idx++;
            setSectorIdx(idx % SEED_SECTORS.length);
            storage.set("greenorb_sector_idx", String(idx % SEED_SECTORS.length));
            addToFeed(`✓ Completed sector: ${sector}. Moving to next…`, "success");
            await new Promise(r => setTimeout(r, 3000));
        }
        setRunning(false);
        addToFeed("⏹ Agent paused", "system");
    };

    // Custom search from user input
    const startCustomSearch = async () => {
        if (!customPrompt.trim()) return;
        stopRef.current = false;
        setRunning(true);
        addToFeed(`🎯 Custom search: "${customPrompt}"`, "system");

        const companies = await generateCompanyList(customPrompt);
        if (stopRef.current) { setRunning(false); return; }

        setCompanyQueue(companies);
        setSearchesRemaining(companies.length);
        for (let i = 0; i < companies.length; i++) {
            if (stopRef.current) break;
            setSearchesRemaining(companies.length - i);
            await searchCompany(companies[i]);
            if (!stopRef.current) await new Promise(r => setTimeout(r, 2000));
        }

        setRunning(false);
        addToFeed("✓ Custom search complete", "success");
    };

    const stopAgent = () => { stopRef.current = true; };
    const feedColors = { search: "var(--cyan)", success: "var(--jade)", error: "var(--red)", system: "var(--pur)", data: "var(--tx2)", info: "var(--tx3)" };

    return (
        <div style={{ padding: "16px 14px" }}>
            <SHd tag="ai-powered esg discovery agent v2" title="ESG Discovery Agent" sub="Two-tier AI: generates company names, then searches each for ESG data individually" />

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                {[
                    { l: "Discovered", v: totalFound, c: "var(--jade)" },
                    { l: "In Database", v: dbSize, c: "var(--cyan)" },
                    { l: "Sectors", v: SEED_SECTORS.length, c: "var(--amb)" },
                ].map(s => (
                    <Cd key={s.l} style={{ padding: "12px 10px", textAlign: "center" }}>
                        <div style={{ fontFamily: "var(--mono)", fontSize: 22, color: s.c, fontWeight: 500 }}>{s.v}</div>
                        <M size={9} color="var(--tx3)" style={{ display: "block" }}>{s.l}</M>
                    </Cd>
                ))}
            </div>

            {/* Custom search input */}
            <Cd style={{ padding: 14, marginBottom: 12 }}>
                <M size={10} color="var(--jade)" style={{ display: "block", marginBottom: 8, letterSpacing: ".08em", textTransform: "uppercase" }}>🎯 Custom Search</M>
                <M size={11} color="var(--tx3)" style={{ display: "block", marginBottom: 8 }}>Describe what kinds of companies to find — AI will generate specific names and search each one</M>
                <div style={{ display: "flex", gap: 8 }}>
                    <input
                        value={customPrompt}
                        onChange={e => setCustomPrompt(e.target.value)}
                        placeholder="e.g. Indian textile manufacturers, European EV battery companies…"
                        disabled={running}
                        style={{ flex: 1, padding: "11px 14px", background: "var(--bg3)", border: "1px solid var(--bd2)", borderRadius: 10, color: "var(--tx)", fontFamily: "var(--body)", fontSize: 13, outline: "none", minWidth: 0 }}
                    />
                    <button
                        onClick={startCustomSearch}
                        disabled={running || !customPrompt.trim()}
                        style={{ padding: "11px 18px", borderRadius: 10, border: "none", background: running ? "var(--sf)" : "var(--jade)", color: running ? "var(--tx3)" : "#000", fontFamily: "var(--disp)", fontWeight: 700, fontSize: 12, cursor: running ? "default" : "pointer", flexShrink: 0 }}
                    >Search</button>
                </div>
            </Cd>

            {/* Start/Stop auto-agent */}
            {!running ? (
                <button onClick={startAgent} style={{ width: "100%", padding: 16, borderRadius: 12, border: "none", background: "var(--jade)", color: "#000", fontFamily: "var(--disp)", fontWeight: 800, fontSize: 16, cursor: "pointer", marginBottom: 14, boxShadow: "0 0 24px rgba(0,232,122,.35)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <span>🤖</span> Start Auto-Discovery Agent
                </button>
            ) : (
                <button onClick={stopAgent} style={{ width: "100%", padding: 16, borderRadius: 12, border: "1px solid rgba(255,77,77,.4)", background: "rgba(255,77,77,.08)", color: "var(--red)", fontFamily: "var(--disp)", fontWeight: 800, fontSize: 16, cursor: "pointer", marginBottom: 14 }}>
                    ⏹ Stop Agent
                </button>
            )}

            {/* Current activity */}
            {running && (
                <Cd accent style={{ padding: 12, marginBottom: 12 }}>
                    <Rw style={{ gap: 8, marginBottom: 6 }}>
                        <Spin size={14} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <M size={10} color="var(--jade)" style={{ display: "block", marginBottom: 2 }}>{currentPhase}</M>
                            <M size={11} color="var(--tx2)" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentQuery}</M>
                        </div>
                        {searchesRemaining > 0 && <Bdg color="cyan">{searchesRemaining} left</Bdg>}
                    </Rw>
                    {streamText && (
                        <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--tx3)", background: "var(--bg3)", borderRadius: 8, padding: 10, maxHeight: 80, overflowY: "auto", lineHeight: 1.7 }}>
                            {streamText.slice(-300)}
                            <span style={{ animation: "blink .8s infinite", display: "inline-block" }}>▌</span>
                        </div>
                    )}
                </Cd>
            )}

            {/* Discovery Feed */}
            <Cd style={{ padding: 14, marginBottom: 14 }}>
                <Rw style={{ justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 13 }}>Discovery Feed</span>
                    {running && <Dot pulse size={6} />}
                </Rw>
                <div ref={feedRef} style={{ maxHeight: 200, overflowY: "auto" }}>
                    {feed.length === 0
                        ? <M size={11} color="var(--tx3)">Start the agent or run a custom search to begin discovery…</M>
                        : feed.map((f, i) => (
                            <div key={i} style={{ display: "flex", gap: 8, padding: "4px 0", borderBottom: "1px solid var(--bg3)" }}>
                                <M size={9} color="var(--tx3)" style={{ flexShrink: 0 }}>{f.ts}</M>
                                <M size={11} color={feedColors[f.type] || "var(--tx2)"} style={{ lineHeight: 1.5 }}>{f.msg}</M>
                            </div>
                        ))
                    }
                </div>
            </Cd>

            {/* Discovered Database */}
            {db.length > 0 && (
                <Cd style={{ padding: 14, marginBottom: 14 }}>
                    <Rw style={{ justifyContent: "space-between", marginBottom: 10 }}>
                        <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 13 }}>🗄 Database ({db.length} companies)</span>
                        <Bdg color="jade">{db.length}</Bdg>
                    </Rw>
                    {db.slice(-12).reverse().map((c, i) => (
                        <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--bg3)" }}>
                            <Rw style={{ justifyContent: "space-between" }}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--tx)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                                    <M size={10} color="var(--tx3)">{c.country} · {c.sector}</M>
                                </div>
                                <div style={{ textAlign: "right", flexShrink: 0 }}>
                                    {c.co2 && c.co2 !== "N/A" && <M size={11} color="var(--jade)" style={{ display: "block" }}>{c.co2}Mt</M>}
                                    {c.grade && c.grade !== "undefined" && c.grade !== "N/A" && <Bdg color={gradeToBdg(c.grade)}>{c.grade}</Bdg>}
                                </div>
                            </Rw>
                            {c.url && c.url !== "undefined" && c.url !== "N/A" && c.url.startsWith("http") && (
                                <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "var(--jd)", textDecoration: "underline", display: "block", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.url}</a>
                            )}
                        </div>
                    ))}
                    {db.length > 12 && <M size={10} color="var(--tx3)" style={{ display: "block", padding: "8px 0", textAlign: "center" }}>Showing latest 12 of {db.length}. All data persisted in localStorage.</M>}
                    <button onClick={() => { storage.delete("greenorb_agent_db"); storage.delete("greenorb_feed"); storage.delete("greenorb_sector_idx"); setDb([]); setFeed([]); setDbSize(0); setTotalFound(0); }}
                        style={{ marginTop: 12, padding: "8px", width: "100%", borderRadius: 8, border: "1px solid var(--bd2)", background: "transparent", color: "var(--tx3)", fontFamily: "var(--body)", fontSize: 12, cursor: "pointer" }}>Clear All Data</button>
                </Cd>
            )}

            {/* How it works */}
            <Cd style={{ padding: 14, marginBottom: 14 }}>
                <M size={10} color="var(--jade)" style={{ display: "block", marginBottom: 8, letterSpacing: ".08em", textTransform: "uppercase" }}>How the Agent Works</M>
                {[
                    ["🧠", "Tier 1 — Generate", "AI generates a list of real company names for each sector using Gemini + Google Search"],
                    ["🔍", "Tier 2 — Extract", "Each company name is searched individually: \"CompanyName sustainability report CO2 emissions\""],
                    ["💾", "Persist", "All discovered data is saved to localStorage and survives tab switches and page reloads"],
                    ["🔄", "Continuous", "Agent cycles through 15 sectors automatically, discovering new companies every cycle"],
                ].map(([ic, lb, desc]) => (
                    <Rw key={lb} style={{ padding: "6px 0", borderBottom: "1px solid var(--bg3)", gap: 10 }}>
                        <span style={{ fontSize: 16, flexShrink: 0 }}>{ic}</span>
                        <div>
                            <M size={11} color="var(--tx)" style={{ fontWeight: 700 }}>{lb}</M>
                            <M size={10} color="var(--tx3)" style={{ display: "block" }}>{desc}</M>
                        </div>
                    </Rw>
                ))}
            </Cd>

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
