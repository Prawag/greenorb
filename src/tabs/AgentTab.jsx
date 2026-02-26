import React, { useState, useEffect, useRef, useCallback } from "react";
import { storage, geminiGenerate, parseGeminiStream, gradeToBdg } from "../utils";
import { M, Bdg, Cd, Rw, Spin, Dot, SHd, GlassBtn } from "../components/primitives";

/* ═══════════════════════════════════════════════════════════════════════════════
   AGENT DEFINITIONS — 4 Specialized AI Agents
   ═══════════════════════════════════════════════════════════════════════════════ */

const AGENTS = {
    scout: {
        id: "scout", name: "Scout Agent", icon: "🔍", color: "#10b981",
        role: "Discovers companies and their ESG/sustainability data",
        description: "Generates company names per sector, then searches each for carbon emissions, ESG grades, and report URLs.",
    },
    analyst: {
        id: "analyst", name: "Analyst Agent", icon: "📊", color: "#34d8e8",
        role: "Deep-analyzes Scout's discoveries with detailed scoring",
        description: "Takes companies from Scout's database and performs deep ESG analysis: scoring methodology, peer comparison, trend analysis.",
    },
    risk: {
        id: "risk", name: "Risk Agent", icon: "⚠️", color: "#f0c040",
        role: "Detects greenwashing, regulatory risks, and compliance gaps",
        description: "Evaluates companies for greenwashing signals, carbon accounting gaps, regulatory non-compliance, and reputational risk.",
    },
    strategy: {
        id: "strategy", name: "Strategy Agent", icon: "💡", color: "#b49cff",
        role: "Synthesizes all agent data into investment recommendations",
        description: "Combines Scout discoveries, Analyst scores, and Risk assessments into actionable investment and ESG strategy recommendations.",
    },
};

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

/* ═══════════════════════════════════════════════════════════════════════════════
   PROMPTS
   ═══════════════════════════════════════════════════════════════════════════════ */

const PROMPTS = {
    scout_gen: `You are a research assistant. Given a sector description, list 15 real, specific company names in that sector. Output ONLY company names, one per line, no numbers, no extra text. Focus on well-known companies that publish sustainability or ESG reports.`,
    scout_extract: `You are an ESG data extraction agent. For the given company, find sustainability/ESG data. Output ONLY in this format (one line per company):
COMPANY|||sector|||country|||estimated_CO2_Mt|||ESG_grade|||report_URL|||key_products
No headers, no markdown, no extra text. Use N/A for missing fields.`,
    analyst: `You are a senior ESG analyst. Given a company's basic data, produce a detailed analysis. Output in this format:
COMPANY|||overall_score_0_100|||environmental_score|||social_score|||governance_score|||trend_UP_DOWN_STABLE|||peer_ranking_top_middle_bottom|||key_strengths|||key_weaknesses|||recommendation_BUY_HOLD_AVOID
One line per company. No markdown, no extra text.`,
    risk: `You are a climate risk and greenwashing detection specialist. Given company ESG data, evaluate for risks. Output in this format:
COMPANY|||greenwash_risk_LOW_MED_HIGH|||regulatory_risk_LOW_MED_HIGH|||climate_exposure_LOW_MED_HIGH|||data_quality_GOOD_FAIR_POOR|||red_flags|||compliance_gaps
One line per company. No markdown, no extra text.`,
    strategy: `You are an ESG investment strategist. Given company data with analysis and risk scores, produce investment recommendations. Output in this format:
COMPANY|||action_BUY_HOLD_SELL_AVOID|||confidence_0_100|||rationale|||target_price_impact|||esg_catalyst|||timeline_SHORT_MED_LONG
One line per company. No markdown, no extra text.`,
};

/* ═══════════════════════════════════════════════════════════════════════════════
   STORAGE KEYS
   ═══════════════════════════════════════════════════════════════════════════════ */

const KEYS = {
    db: "greenorb_agent_db",
    feed: "greenorb_feed",
    sectorIdx: "greenorb_sector_idx",
    analysis: "greenorb_analysis",
    risks: "greenorb_risks",
    strategies: "greenorb_strategies",
    messages: "greenorb_agent_msgs",
};

/* ═══════════════════════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════════════════════ */

export default function AgentTab() {
    const [activeAgent, setActiveAgent] = useState("scout");
    const [running, setRunning] = useState({});
    const [feed, setFeed] = useState([]);
    const [db, setDb] = useState([]);
    const [analysis, setAnalysis] = useState([]);
    const [risks, setRisks] = useState([]);
    const [strategies, setStrategies] = useState([]);
    const [currentPhase, setCurrentPhase] = useState({});
    const [currentQuery, setCurrentQuery] = useState({});
    const [streamText, setStreamText] = useState("");
    const [customPrompt, setCustomPrompt] = useState("");
    const [sectorIdx, setSectorIdx] = useState(0);
    const [searchesRemaining, setSearchesRemaining] = useState(0);
    const stopRefs = useRef({ scout: false, analyst: false, risk: false, strategy: false });
    const feedRef = useRef(null);

    // Load persisted data
    useEffect(() => {
        const load = (key, setter) => {
            const stored = storage.get(key);
            if (stored) { try { setter(JSON.parse(stored.value)); } catch { } }
        };
        load(KEYS.db, setDb);
        load(KEYS.feed, (d) => setFeed(d.slice(-60)));
        load(KEYS.analysis, setAnalysis);
        load(KEYS.risks, setRisks);
        load(KEYS.strategies, setStrategies);
        const idx = storage.get(KEYS.sectorIdx);
        if (idx) try { setSectorIdx(parseInt(idx.value) || 0); } catch { }
    }, []);

    useEffect(() => {
        if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }, [feed]);

    const addToFeed = useCallback((msg, type = "info", agent = "system") => {
        const entry = { msg, type, agent, ts: new Date().toLocaleTimeString() };
        setFeed(prev => {
            const next = [...prev, entry].slice(-100);
            storage.set(KEYS.feed, JSON.stringify(next));
            return next;
        });
    }, []);

    const addToDb = useCallback((entries) => {
        setDb(prev => {
            const existing = new Set(prev.map(c => c.name?.toLowerCase()));
            const unique = entries.filter(c => c.name && !existing.has(c.name.toLowerCase()));
            const next = [...prev, ...unique].slice(-3000);
            storage.set(KEYS.db, JSON.stringify(next));
            return next;
        });
    }, []);

    const broadcastMsg = useCallback((from, to, type, data) => {
        addToFeed(`💬 ${AGENTS[from].icon} → ${AGENTS[to].icon}: ${type} — ${data.length || 1} items`, "comms", from);
    }, [addToFeed]);

    /* ─── SCOUT LOGIC ────────────────────────────────────────────────────────── */
    const scoutGenerate = async (sectorDesc) => {
        setCurrentPhase(p => ({ ...p, scout: "🧠 Generating company names" }));
        setCurrentQuery(q => ({ ...q, scout: sectorDesc }));
        addToFeed(`🧠 Generating companies for "${sectorDesc}"`, "search", "scout");
        setStreamText("");
        try {
            const res = await geminiGenerate(`List 15 specific real company names in: ${sectorDesc}`, PROMPTS.scout_gen, true);
            let full = "";
            for await (const chunk of parseGeminiStream(res)) {
                if (stopRefs.current.scout) return [];
                full += chunk;
                setStreamText(full);
            }
            const companies = full.split("\n").map(l => l.replace(/^\d+[.)\-]\s*/, "").trim()).filter(l => l.length > 2 && l.length < 80 && !l.includes("|||"));
            addToFeed(`✓ Found ${companies.length} companies`, "success", "scout");
            return companies;
        } catch (e) {
            addToFeed(`⚠ ${e.message?.slice(0, 60)}`, "error", "scout");
            return [];
        }
    };

    const scoutSearch = async (companyName) => {
        setCurrentPhase(p => ({ ...p, scout: "🔍 Extracting ESG data" }));
        setCurrentQuery(q => ({ ...q, scout: companyName }));
        addToFeed(`🔍 Searching: ${companyName}`, "search", "scout");
        setStreamText("");
        try {
            const res = await geminiGenerate(`Search ESG/sustainability data for "${companyName}"`, PROMPTS.scout_extract, true);
            let full = "";
            for await (const chunk of parseGeminiStream(res)) {
                if (stopRefs.current.scout) return;
                full += chunk;
                setStreamText(full);
            }
            const discovered = full.split("\n").filter(l => l.includes("|||")).map(l => {
                const p = l.split("|||");
                if (p.length >= 4) return { name: p[0]?.trim(), sector: p[1]?.trim(), country: p[2]?.trim(), co2: p[3]?.trim(), grade: p[4]?.trim(), url: p[5]?.trim(), products: p[6]?.trim(), discoveredAt: new Date().toISOString(), source: "scout" };
                return null;
            }).filter(Boolean);
            if (discovered.length > 0) { addToFeed(`📊 ${discovered[0].name}: ${discovered[0].co2} Mt CO₂`, "data", "scout"); addToDb(discovered); }
            else { addToFeed(`ℹ No data for ${companyName}`, "info", "scout"); }
        } catch (e) { addToFeed(`⚠ ${e.message?.slice(0, 60)}`, "error", "scout"); }
    };

    const startScout = async () => {
        stopRefs.current.scout = false;
        setRunning(r => ({ ...r, scout: true }));
        addToFeed("🔍 Scout Agent started — discovering ESG data", "system", "scout");
        let idx = sectorIdx;
        while (!stopRefs.current.scout) {
            const sector = SEED_SECTORS[idx % SEED_SECTORS.length];
            const companies = await scoutGenerate(sector);
            if (stopRefs.current.scout) break;
            setSearchesRemaining(companies.length);
            for (let i = 0; i < companies.length; i++) {
                if (stopRefs.current.scout) break;
                setSearchesRemaining(companies.length - i);
                await scoutSearch(companies[i]);
                if (!stopRefs.current.scout) await new Promise(r => setTimeout(r, 2000));
            }
            if (stopRefs.current.scout) break;
            idx++;
            setSectorIdx(idx % SEED_SECTORS.length);
            storage.set(KEYS.sectorIdx, String(idx % SEED_SECTORS.length));
            broadcastMsg("scout", "analyst", "new_discoveries", companies);
            addToFeed(`✓ Completed sector: ${sector}`, "success", "scout");
            await new Promise(r => setTimeout(r, 3000));
        }
        setRunning(r => ({ ...r, scout: false }));
        addToFeed("⏹ Scout paused", "system", "scout");
    };

    /* ─── ANALYST LOGIC (continuous polling) ────────────────────────────────── */
    const analystProcessOne = async (c) => {
        setCurrentPhase(p => ({ ...p, analyst: `Analyzing: ${c.name}` }));
        setCurrentQuery(q => ({ ...q, analyst: c.name }));
        addToFeed(`📊 Analyzing: ${c.name}`, "search", "analyst");
        setStreamText("");
        try {
            const res = await geminiGenerate(`Analyze ESG profile of "${c.name}" (sector: ${c.sector}, country: ${c.country}, CO2: ${c.co2} Mt, grade: ${c.grade})`, PROMPTS.analyst, true);
            let full = "";
            for await (const chunk of parseGeminiStream(res)) { if (stopRefs.current.analyst) return; full += chunk; setStreamText(full); }
            const lines = full.split("\n").filter(l => l.includes("|||"));
            const parsed = lines.map(l => { const p = l.split("|||"); return p.length >= 8 ? { name: p[0]?.trim(), overallScore: p[1]?.trim(), envScore: p[2]?.trim(), socialScore: p[3]?.trim(), govScore: p[4]?.trim(), trend: p[5]?.trim(), peerRank: p[6]?.trim(), strengths: p[7]?.trim(), weaknesses: p[8]?.trim(), rec: p[9]?.trim(), analyzedAt: new Date().toISOString() } : null; }).filter(Boolean);
            if (parsed.length > 0) {
                setAnalysis(prev => { const next = [...prev, ...parsed]; storage.set(KEYS.analysis, JSON.stringify(next)); return next; });
                addToFeed(`✓ ${parsed[0].name}: Score ${parsed[0].overallScore}/100 (${parsed[0].rec})`, "data", "analyst");
                broadcastMsg("analyst", "risk", "analyzed", [c]);
            }
        } catch (e) { addToFeed(`⚠ ${e.message?.slice(0, 60)}`, "error", "analyst"); }
    };

    const startAnalyst = async () => {
        stopRefs.current.analyst = false;
        setRunning(r => ({ ...r, analyst: true }));
        addToFeed("📊 Analyst Agent started — continuous analysis mode", "system", "analyst");
        // Use refs to read latest state inside the loop
        const getDb = () => { try { const s = storage.get(KEYS.db); return s ? JSON.parse(s.value) : []; } catch { return []; } };
        const getAnalysis = () => { try { const s = storage.get(KEYS.analysis); return s ? JSON.parse(s.value) : []; } catch { return []; } };
        while (!stopRefs.current.analyst) {
            const currentDb = getDb();
            const currentAnalysis = getAnalysis();
            const analyzed = new Set(currentAnalysis.map(a => a.name?.toLowerCase()));
            const unanalyzed = currentDb.filter(c => c.name && c.co2 && c.co2 !== "N/A" && !analyzed.has(c.name.toLowerCase()));
            if (unanalyzed.length > 0) {
                setCurrentPhase(p => ({ ...p, analyst: `${unanalyzed.length} companies queued` }));
                for (const c of unanalyzed) {
                    if (stopRefs.current.analyst) break;
                    await analystProcessOne(c);
                    if (!stopRefs.current.analyst) await new Promise(r => setTimeout(r, 2500));
                }
            } else {
                setCurrentPhase(p => ({ ...p, analyst: "⏳ Waiting for Scout data…" }));
                setCurrentQuery(q => ({ ...q, analyst: "Polling every 10s" }));
            }
            if (!stopRefs.current.analyst) await new Promise(r => setTimeout(r, 10000));
        }
        setRunning(r => ({ ...r, analyst: false }));
        addToFeed("⏹ Analyst paused", "system", "analyst");
    };

    /* ─── RISK LOGIC (continuous polling) ────────────────────────────────────── */
    const riskProcessOne = async (a) => {
        setCurrentPhase(p => ({ ...p, risk: `Scanning: ${a.name}` }));
        setCurrentQuery(q => ({ ...q, risk: a.name }));
        addToFeed(`⚠️ Risk scan: ${a.name}`, "search", "risk");
        setStreamText("");
        try {
            const res = await geminiGenerate(`Evaluate greenwashing and regulatory risk for "${a.name}" (ESG score: ${a.overallScore}/100, trend: ${a.trend}, strengths: ${a.strengths}, weaknesses: ${a.weaknesses})`, PROMPTS.risk, true);
            let full = "";
            for await (const chunk of parseGeminiStream(res)) { if (stopRefs.current.risk) return; full += chunk; setStreamText(full); }
            const parsed = full.split("\n").filter(l => l.includes("|||")).map(l => { const p = l.split("|||"); return p.length >= 5 ? { name: p[0]?.trim(), greenwashRisk: p[1]?.trim(), regRisk: p[2]?.trim(), climateExposure: p[3]?.trim(), dataQuality: p[4]?.trim(), redFlags: p[5]?.trim(), complianceGaps: p[6]?.trim(), scannedAt: new Date().toISOString() } : null; }).filter(Boolean);
            if (parsed.length > 0) {
                setRisks(prev => { const next = [...prev, ...parsed]; storage.set(KEYS.risks, JSON.stringify(next)); return next; });
                addToFeed(`🚦 ${parsed[0].name}: GW:${parsed[0].greenwashRisk} Reg:${parsed[0].regRisk} Clim:${parsed[0].climateExposure}`, "data", "risk");
                broadcastMsg("risk", "strategy", "risk_assessed", [a]);
            }
        } catch (e) { addToFeed(`⚠ ${e.message?.slice(0, 60)}`, "error", "risk"); }
    };

    const startRisk = async () => {
        stopRefs.current.risk = false;
        setRunning(r => ({ ...r, risk: true }));
        addToFeed("⚠️ Risk Agent started — continuous scanning mode", "system", "risk");
        const getAnalysis = () => { try { const s = storage.get(KEYS.analysis); return s ? JSON.parse(s.value) : []; } catch { return []; } };
        const getRisks = () => { try { const s = storage.get(KEYS.risks); return s ? JSON.parse(s.value) : []; } catch { return []; } };
        while (!stopRefs.current.risk) {
            const currentAnalysis = getAnalysis();
            const currentRisks = getRisks();
            const scanned = new Set(currentRisks.map(r => r.name?.toLowerCase()));
            const unscanned = currentAnalysis.filter(a => !scanned.has(a.name?.toLowerCase()));
            if (unscanned.length > 0) {
                setCurrentPhase(p => ({ ...p, risk: `${unscanned.length} to scan` }));
                for (const a of unscanned) {
                    if (stopRefs.current.risk) break;
                    await riskProcessOne(a);
                    if (!stopRefs.current.risk) await new Promise(r => setTimeout(r, 2500));
                }
            } else {
                setCurrentPhase(p => ({ ...p, risk: "⏳ Waiting for Analyst data…" }));
                setCurrentQuery(q => ({ ...q, risk: "Polling every 10s" }));
            }
            if (!stopRefs.current.risk) await new Promise(r => setTimeout(r, 10000));
        }
        setRunning(r => ({ ...r, risk: false }));
        addToFeed("⏹ Risk paused", "system", "risk");
    };

    /* ─── STRATEGY LOGIC (continuous polling) ────────────────────────────────── */
    const strategyProcessOne = async (r) => {
        const getAnalysis = () => { try { const s = storage.get(KEYS.analysis); return s ? JSON.parse(s.value) : []; } catch { return []; } };
        const getDb = () => { try { const s = storage.get(KEYS.db); return s ? JSON.parse(s.value) : []; } catch { return []; } };
        const a = getAnalysis().find(x => x.name?.toLowerCase() === r.name?.toLowerCase());
        const c = getDb().find(x => x.name?.toLowerCase() === r.name?.toLowerCase());
        setCurrentPhase(p => ({ ...p, strategy: `Strategizing: ${r.name}` }));
        setCurrentQuery(q => ({ ...q, strategy: r.name }));
        addToFeed(`💡 Strategizing: ${r.name}`, "search", "strategy");
        setStreamText("");
        try {
            const res = await geminiGenerate(`Investment recommendation for "${r.name}" (CO2: ${c?.co2 || "N/A"} Mt, ESG: ${a?.overallScore || "N/A"}/100, Greenwash: ${r.greenwashRisk}, Regulatory: ${r.regRisk}, Climate: ${r.climateExposure})`, PROMPTS.strategy, true);
            let full = "";
            for await (const chunk of parseGeminiStream(res)) { if (stopRefs.current.strategy) return; full += chunk; setStreamText(full); }
            const parsed = full.split("\n").filter(l => l.includes("|||")).map(l => { const p = l.split("|||"); return p.length >= 5 ? { name: p[0]?.trim(), action: p[1]?.trim(), confidence: p[2]?.trim(), rationale: p[3]?.trim(), priceImpact: p[4]?.trim(), catalyst: p[5]?.trim(), timeline: p[6]?.trim(), createdAt: new Date().toISOString() } : null; }).filter(Boolean);
            if (parsed.length > 0) {
                setStrategies(prev => { const next = [...prev, ...parsed]; storage.set(KEYS.strategies, JSON.stringify(next)); return next; });
                addToFeed(`🎯 ${parsed[0].name}: ${parsed[0].action} (${parsed[0].confidence}% confidence)`, "data", "strategy");
            }
        } catch (e) { addToFeed(`⚠ ${e.message?.slice(0, 60)}`, "error", "strategy"); }
    };

    const startStrategy = async () => {
        stopRefs.current.strategy = false;
        setRunning(r => ({ ...r, strategy: true }));
        addToFeed("💡 Strategy Agent started — continuous recommendation mode", "system", "strategy");
        const getRisks = () => { try { const s = storage.get(KEYS.risks); return s ? JSON.parse(s.value) : []; } catch { return []; } };
        const getStrategies = () => { try { const s = storage.get(KEYS.strategies); return s ? JSON.parse(s.value) : []; } catch { return []; } };
        while (!stopRefs.current.strategy) {
            const currentRisks = getRisks();
            const currentStrategies = getStrategies();
            const done = new Set(currentStrategies.map(s => s.name?.toLowerCase()));
            const pending = currentRisks.filter(r => !done.has(r.name?.toLowerCase()));
            if (pending.length > 0) {
                setCurrentPhase(p => ({ ...p, strategy: `${pending.length} pending` }));
                for (const r of pending) {
                    if (stopRefs.current.strategy) break;
                    await strategyProcessOne(r);
                    if (!stopRefs.current.strategy) await new Promise(r => setTimeout(r, 2500));
                }
            } else {
                setCurrentPhase(p => ({ ...p, strategy: "⏳ Waiting for Risk data…" }));
                setCurrentQuery(q => ({ ...q, strategy: "Polling every 10s" }));
            }
            if (!stopRefs.current.strategy) await new Promise(r => setTimeout(r, 10000));
        }
        setRunning(r => ({ ...r, strategy: false }));
        addToFeed("⏹ Strategy paused", "system", "strategy");
    };

    /* ─── LAUNCH ALL / STOP ALL ──────────────────────────────────────────────── */
    const startAll = () => {
        addToFeed("🚀 All agents launched — collaborative continuous mode", "comms", "system");
        startScout(); startAnalyst(); startRisk(); startStrategy();
    };
    const stopAll = () => { Object.keys(stopRefs.current).forEach(k => stopRefs.current[k] = true); };
    const stopAgent = (id) => { stopRefs.current[id] = true; };

    const startCustomSearch = async () => {
        if (!customPrompt.trim()) return;
        stopRefs.current.scout = false;
        setRunning(r => ({ ...r, scout: true }));
        addToFeed(`🎯 Custom search: "${customPrompt}"`, "system", "scout");
        const companies = await scoutGenerate(customPrompt);
        if (stopRefs.current.scout) { setRunning(r => ({ ...r, scout: false })); return; }
        setSearchesRemaining(companies.length);
        for (let i = 0; i < companies.length; i++) {
            if (stopRefs.current.scout) break;
            setSearchesRemaining(companies.length - i);
            await scoutSearch(companies[i]);
            if (!stopRefs.current.scout) await new Promise(r => setTimeout(r, 2000));
        }
        setRunning(r => ({ ...r, scout: false }));
        addToFeed("✓ Custom search complete", "success", "scout");
    };

    const clearAll = () => {
        Object.values(KEYS).forEach(k => storage.delete(k));
        setDb([]); setFeed([]); setAnalysis([]); setRisks([]); setStrategies([]);
    };

    const feedColors = { search: "var(--cyan)", success: "var(--jade)", error: "var(--red)", system: "var(--pur)", data: "var(--tx2)", info: "var(--tx3)", comms: "var(--gold)" };
    const agentRunning = Object.values(running).some(Boolean);
    const totalAgentCt = db.length + analysis.length + risks.length + strategies.length;

    /* ═══════════════════════════════════════════════════════════════════════════
       RENDER
       ═══════════════════════════════════════════════════════════════════════════ */
    return (
        <div style={{ padding: "16px 14px" }}>
            <SHd tag="Multi-Agent ESG Intelligence" title="Agent Command Center" sub="4 specialized AI agents that collaborate to discover, analyze, assess, and strategize ESG data" />

            {/* Agent Overview Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                {Object.values(AGENTS).map(a => {
                    const isActive = activeAgent === a.id;
                    const isRunning = running[a.id];
                    const counts = { scout: db.length, analyst: analysis.length, risk: risks.length, strategy: strategies.length };
                    return (
                        <Cd key={a.id} glass accent={isActive} style={{
                            padding: 14, cursor: "pointer",
                            borderColor: isActive ? `${a.color}44` : isRunning ? `${a.color}22` : "var(--bd)",
                            animation: isRunning ? "borderGlow 2s infinite" : "none",
                        }} onClick={() => setActiveAgent(a.id)}>
                            <Rw style={{ justifyContent: "space-between", marginBottom: 6 }}>
                                <span style={{ fontSize: 22 }}>{a.icon}</span>
                                {isRunning && <Spin size={14} color={a.color} />}
                            </Rw>
                            <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 13, color: isActive ? a.color : "var(--tx)", marginBottom: 2 }}>{a.name}</div>
                            <M size={9} color="var(--tx3)" style={{ display: "block", marginBottom: 6 }}>{a.role}</M>
                            <Rw style={{ justifyContent: "space-between" }}>
                                <M size={16} color={a.color} style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>{counts[a.id]}</M>
                                <Bdg color={isRunning ? "jade" : "amb"}>{isRunning ? "RUNNING" : "IDLE"}</Bdg>
                            </Rw>
                        </Cd>
                    );
                })}
            </div>

            {/* Global Stats */}
            <Cd glass style={{ padding: 14, marginBottom: 14 }}>
                <Rw style={{ justifyContent: "space-between" }}>
                    <div>
                        <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 13, marginBottom: 2 }}>Network Intelligence</div>
                        <M size={10} color="var(--tx3)">{totalAgentCt} total data points across all agents</M>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                        {Object.values(AGENTS).map(a => (
                            <div key={a.id} style={{ width: 8, height: 8, borderRadius: "50%", background: running[a.id] ? a.color : "var(--bd2)", boxShadow: running[a.id] ? `0 0 6px ${a.color}` : "none", transition: "all .3s" }} />
                        ))}
                    </div>
                </Rw>
            </Cd>

            {/* Custom Search */}
            <Cd glass style={{ padding: 14, marginBottom: 12 }}>
                <M size={10} color="var(--jade)" style={{ display: "block", marginBottom: 8, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 600 }}>🎯 Custom Search</M>
                <div style={{ display: "flex", gap: 8 }}>
                    <input value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} placeholder="e.g. Indian textile manufacturers…"
                        disabled={running.scout} style={{ flex: 1, padding: "12px 14px", background: "var(--bg3)", border: "1px solid var(--bd2)", borderRadius: 12, color: "var(--tx)", fontFamily: "var(--body)", fontSize: 13, outline: "none", minWidth: 0 }} />
                    <button onClick={startCustomSearch} disabled={running.scout || !customPrompt.trim()}
                        style={{ padding: "12px 20px", borderRadius: 12, border: "none", background: running.scout ? "var(--bg3)" : "var(--jade)", color: running.scout ? "var(--tx3)" : "#fff", fontFamily: "var(--disp)", fontWeight: 700, fontSize: 12, cursor: running.scout ? "default" : "pointer", flexShrink: 0 }}>Search</button>
                </div>
            </Cd>

            {/* Launch All / Stop All */}
            {!agentRunning ? (
                <GlassBtn primary onClick={startAll} style={{ marginBottom: 14 }}>
                    🚀 Launch All Agents
                </GlassBtn>
            ) : (
                <GlassBtn danger onClick={stopAll} style={{ marginBottom: 14 }}>
                    ⏹ Stop All Agents
                </GlassBtn>
            )}

            {/* Active Agent Stream */}
            {running[activeAgent] && (
                <Cd accent glass style={{ padding: 12, marginBottom: 12 }}>
                    <Rw style={{ gap: 8, marginBottom: 6 }}>
                        <Spin size={14} color={AGENTS[activeAgent].color} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <M size={10} color={AGENTS[activeAgent].color} style={{ display: "block", marginBottom: 2 }}>{currentPhase[activeAgent] || "Working…"}</M>
                            <M size={11} color="var(--tx2)" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentQuery[activeAgent]}</M>
                        </div>
                        {activeAgent === "scout" && searchesRemaining > 0 && <Bdg color="cyan">{searchesRemaining} left</Bdg>}
                    </Rw>
                    {streamText && (
                        <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--tx3)", background: "var(--bg3)", borderRadius: 10, padding: 10, maxHeight: 80, overflowY: "auto", lineHeight: 1.7 }}>
                            {streamText.slice(-300)}
                            <span style={{ animation: "blink .8s infinite", display: "inline-block" }}>▌</span>
                        </div>
                    )}
                </Cd>
            )}

            {/* Agent Data View */}
            <Cd glass style={{ padding: 14, marginBottom: 14 }}>
                <Rw style={{ justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 13, color: AGENTS[activeAgent].color }}>{AGENTS[activeAgent].icon} {AGENTS[activeAgent].name} Results</span>
                    <Bdg color="jade">{{ scout: db.length, analyst: analysis.length, risk: risks.length, strategy: strategies.length }[activeAgent]}</Bdg>
                </Rw>

                {activeAgent === "scout" && db.slice(-10).reverse().map((c, i) => (
                    <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--bg3)" }}>
                        <Rw style={{ justifyContent: "space-between" }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--tx)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                                <M size={10} color="var(--tx3)">{c.country} · {c.sector}</M>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                                {c.co2 && c.co2 !== "N/A" && <M size={11} color="var(--jade)" style={{ display: "block" }}>{c.co2}Mt</M>}
                                {c.grade && c.grade !== "N/A" && <Bdg color={gradeToBdg(c.grade)}>{c.grade}</Bdg>}
                            </div>
                        </Rw>
                    </div>
                ))}

                {activeAgent === "analyst" && analysis.slice(-10).reverse().map((a, i) => (
                    <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--bg3)" }}>
                        <Rw style={{ justifyContent: "space-between", marginBottom: 4 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--tx)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                            <Bdg color={a.rec?.includes("BUY") ? "jade" : a.rec?.includes("AVOID") ? "red" : "amb"}>{a.rec}</Bdg>
                        </Rw>
                        <div style={{ display: "flex", gap: 6 }}>
                            <Bdg color="cyan">Overall: {a.overallScore}</Bdg>
                            <Bdg color="jade">E: {a.envScore}</Bdg>
                            <Bdg color="pur">Trend: {a.trend}</Bdg>
                        </div>
                    </div>
                ))}

                {activeAgent === "risk" && risks.slice(-10).reverse().map((r, i) => (
                    <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--bg3)" }}>
                        <Rw style={{ justifyContent: "space-between", marginBottom: 4 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--tx)" }}>{r.name}</div>
                        </Rw>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <Bdg color={r.greenwashRisk?.includes("HIGH") ? "red" : r.greenwashRisk?.includes("MED") ? "amb" : "jade"}>GW: {r.greenwashRisk}</Bdg>
                            <Bdg color={r.regRisk?.includes("HIGH") ? "red" : r.regRisk?.includes("MED") ? "amb" : "jade"}>Reg: {r.regRisk}</Bdg>
                            <Bdg color={r.climateExposure?.includes("HIGH") ? "red" : "amb"}>Climate: {r.climateExposure}</Bdg>
                        </div>
                        {r.redFlags && r.redFlags !== "N/A" && <M size={10} color="var(--red)" style={{ display: "block", marginTop: 4 }}>🚩 {r.redFlags}</M>}
                    </div>
                ))}

                {activeAgent === "strategy" && strategies.slice(-10).reverse().map((s, i) => (
                    <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--bg3)" }}>
                        <Rw style={{ justifyContent: "space-between", marginBottom: 4 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--tx)" }}>{s.name}</div>
                            <Bdg color={s.action?.includes("BUY") ? "jade" : s.action?.includes("SELL") || s.action?.includes("AVOID") ? "red" : "amb"}>{s.action}</Bdg>
                        </Rw>
                        <M size={10} color="var(--tx2)" style={{ display: "block" }}>{s.rationale}</M>
                        <Rw style={{ gap: 6, marginTop: 4 }}>
                            <Bdg color="cyan">Confidence: {s.confidence}%</Bdg>
                            <Bdg color="pur">{s.timeline}</Bdg>
                        </Rw>
                    </div>
                ))}

                {({ scout: db, analyst: analysis, risk: risks, strategy: strategies }[activeAgent])?.length === 0 && (
                    <M size={11} color="var(--tx3)" style={{ display: "block", textAlign: "center", padding: 20 }}>No data yet. Start this agent to begin.</M>
                )}
            </Cd>

            {/* Unified Feed */}
            <Cd glass style={{ padding: 14, marginBottom: 14 }}>
                <Rw style={{ justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 13 }}>Agent Network Feed</span>
                    {agentRunning && <Dot pulse size={6} />}
                </Rw>
                <div ref={feedRef} style={{ maxHeight: 200, overflowY: "auto" }}>
                    {feed.length === 0
                        ? <M size={11} color="var(--tx3)">Start any agent to see activity…</M>
                        : feed.slice(-40).map((f, i) => (
                            <div key={i} style={{ display: "flex", gap: 8, padding: "3px 0", borderBottom: "1px solid var(--bg3)" }}>
                                <M size={9} color="var(--tx3)" style={{ flexShrink: 0, width: 52 }}>{f.ts}</M>
                                {f.agent && f.agent !== "system" && <span style={{ fontSize: 10, flexShrink: 0 }}>{AGENTS[f.agent]?.icon}</span>}
                                <M size={10} color={feedColors[f.type] || "var(--tx2)"} style={{ lineHeight: 1.5 }}>{f.msg}</M>
                            </div>
                        ))
                    }
                </div>
            </Cd>

            {/* Clear Data */}
            <button onClick={clearAll} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--bd2)", background: "transparent", color: "var(--tx3)", fontFamily: "var(--body)", fontSize: 11, cursor: "pointer" }}>Clear All Agent Data</button>
        </div>
    );
}
