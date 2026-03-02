import React, { useState } from "react";
import { COMPANIES } from "../data/companies";
import { gradeToBdg, gradeToColor, geminiGenerate, API_BASE } from "../utils";
import { M, Bdg, Rw, Cd, Spin, SHd } from "../components/primitives";

const SECTORS = ["All", "Technology", "Energy", "Consumer", "Manufacturing", "Food & Agri", "Mining", "Chemicals", "Fashion", "Transport", "Healthcare"];

export default function CompaniesTab() {
    const [q, setQ] = useState("");
    const [sel, setSel] = useState(null);
    const [aiData, setAiData] = useState({});
    const [loading, setLoading] = useState(null);
    const [sector, setSector] = useState("All");
    const [liveCompanies, setLiveCompanies] = useState([]);

    // ─── FETCH NEON DATA ──────────────────────────────────────────────────────
    const fetchNeonData = async () => {
        try {
            const res = await fetch(`${API_BASE}/data`);
            if (!res.ok) return;
            const data = await res.json();

            // Map Neon backend data to COMPANIES format
            // [name, sector, country, co2, esg, employees, url, products, methodology, s1, s2, s3]
            const mapped = data.map(c => [
                c.name, c.sector || "N/A", c.country || "N/A", c.co2 || 0, c.esg || "N/A",
                "N/A", c.url || "N/A", c.products || "N/A", c.methodology || "N/A",
                c.s1 || 0, c.s2 || 0, c.s3 || 0
            ]);
            setLiveCompanies(mapped);
        } catch (e) {
            console.error("CompaniesTab Sync Error:", e);
        }
    };

    React.useEffect(() => {
        fetchNeonData();
        const inv = setInterval(fetchNeonData, 10000);
        return () => clearInterval(inv);
    }, []);

    // Merge static and live data (preferring live/agent data)
    const combined = [...liveCompanies];
    const liveNames = new Set(liveCompanies.map(c => c[0].toLowerCase()));

    COMPANIES.forEach(c => {
        if (!liveNames.has(c[0].toLowerCase())) {
            combined.push(c);
        }
    });

    const filtered = combined.filter(c =>
        (sector === "All" || c[1].toLowerCase().includes(sector.toLowerCase())) &&
        (q === "" || c[0].toLowerCase().includes(q.toLowerCase()) ||
            c[1].toLowerCase().includes(q.toLowerCase()) ||
            c[7].toLowerCase().includes(q.toLowerCase()))
    );

    const fetchLive = async (company) => {
        const key = company[0];
        if (loading === key) return;
        setSel(prev => prev === key ? null : key);
        if (aiData[key] || sel === key) return;
        setLoading(key);
        try {
            const systemPrompt = `You are a carbon intelligence analyst. Search for the latest ESG data for the given company. Return ONLY a valid JSON object (no markdown fences, no extra text):
{"news":"one sentence about latest sustainability news or initiative","target":"net zero target year e.g. 2050","renewable_pct":75,"cbam_risk":"High or Med or Low","controversy":"one sentence about any controversy or empty string"}`;
            const res = await geminiGenerate(
                `Search for the latest 2024/2025 ESG news, net zero targets, and sustainability data for ${key}. Return only the JSON object.`,
                systemPrompt, false
            );
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
            try {
                const s = text.indexOf("{"), e = text.lastIndexOf("}");
                if (s !== -1 && e !== -1) {
                    setAiData(prev => ({ ...prev, [key]: JSON.parse(text.slice(s, e + 1)) }));
                } else {
                    setAiData(prev => ({ ...prev, [key]: { news: text.substring(0, 200) } }));
                }
            } catch {
                setAiData(prev => ({ ...prev, [key]: { news: text.substring(0, 200) } }));
            }
        } catch (err) {
            setAiData(prev => ({ ...prev, [key]: { news: `Error: ${err.message.slice(0, 100)}` } }));
        }
        setLoading(null);
    };

    return (
        <div style={{ padding: "16px 14px" }}>
            <SHd tag="global esg database" title="Company ESG Library" sub="Real ESG reports · CO₂ methodology · Live AI search" />

            <div style={{ position: "relative", marginBottom: 12 }}>
                <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: "var(--tx3)", zIndex: 1, pointerEvents: "none" }}>🔍</span>
                <input
                    value={q} onChange={e => setQ(e.target.value)}
                    placeholder="Search company, product, sector…"
                    autoComplete="off" autoCorrect="off" spellCheck={false}
                    style={{ width: "100%", background: "var(--sf)", border: "1px solid var(--bd2)", borderRadius: 12, padding: "13px 40px 13px 44px", color: "var(--tx)", fontFamily: "var(--body)", fontSize: 14, outline: "none", minHeight: 50 }}
                />
                {q && <button onClick={() => setQ("")} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--tx3)", fontSize: 16, cursor: "pointer" }}>✕</button>}
            </div>

            <div style={{ display: "flex", gap: 7, overflowX: "auto", marginBottom: 14, paddingBottom: 4 }}>
                {SECTORS.map(s => (
                    <button key={s} onClick={() => setSector(s)} style={{ whiteSpace: "nowrap", padding: "7px 14px", borderRadius: 20, border: `1px solid ${sector === s ? "rgba(0,232,122,.4)" : "var(--bd2)"}`, background: sector === s ? "var(--jg)" : "var(--sf)", color: sector === s ? "var(--jade)" : "var(--tx2)", fontFamily: "var(--body)", fontSize: 12, cursor: "pointer", minHeight: 36, transition: "all .15s" }}>{s}</button>
                ))}
            </div>

            <M size={10} color="var(--tx3)" style={{ display: "block", marginBottom: 10 }}>{filtered.length} companies · Tap for ESG report + methodology</M>

            {filtered.map(c => {
                const [cname, csec, ccountry, co2, esg, emp, url, products, methodology, s1, s2, s3, report_year] = c;
                const isOpen = sel === cname;
                const isLoading = loading === cname;
                const live = aiData[cname];
                return (
                    <div key={cname} style={{ marginBottom: 10 }}>
                        <div onClick={() => fetchLive(c)} style={{ background: isOpen ? "var(--sf2)" : "var(--sf)", border: `1px solid ${isOpen ? "rgba(0,232,122,.25)" : "var(--bd)"}`, borderRadius: isOpen ? "12px 12px 0 0" : 12, padding: "14px", cursor: "pointer", transition: "all .2s" }}>
                            <Rw style={{ justifyContent: "space-between", marginBottom: 6 }}>
                                <div>
                                    <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 14, color: "var(--tx)", marginBottom: 4 }}>{cname}</div>
                                    <Rw style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                        {report_year && (
                                            <Bdg color={report_year >= 2024 ? "jade" : "red"}>
                                                {report_year >= 2024 ? `✅ ${report_year} Report` : `⚠ Old Data (${report_year})`}
                                            </Bdg>
                                        )}
                                        <Bdg color={gradeToBdg(esg)}>{`ESG ${esg}`}</Bdg>
                                        <Bdg color="blu">{csec}</Bdg>
                                        <M size={10} color="var(--tx3)">{ccountry}</M>
                                    </Rw>
                                </div>
                                <div style={{ textAlign: "right", flexShrink: 0 }}>
                                    <div style={{ fontFamily: "var(--mono)", fontSize: 18, color: gradeToColor(esg), fontWeight: 500 }}>{co2}Mt</div>
                                    <M size={9} color="var(--tx3)">Scope 1+2</M>
                                </div>
                            </Rw>
                            <M size={10} color="var(--tx3)" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{products}</M>
                        </div>

                        {isOpen && (
                            <div style={{ background: "var(--bg2)", border: "1px solid rgba(0,232,122,.15)", borderTop: "none", borderRadius: "0 0 12px 12px", padding: 14, animation: "pop .3s ease" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
                                    {[["Scope 1", s1, "jade"], ["Scope 2", s2, "cyan"], ["Scope 3", s3, "amb"]].map(([l, v, col]) => (
                                        <div key={l} style={{ padding: "8px", background: "var(--sf)", borderRadius: 8, border: "1px solid var(--bd)", textAlign: "center" }}>
                                            <M size={8} color="var(--tx3)" style={{ display: "block", marginBottom: 2 }}>{l}</M>
                                            <M size={11} color={`var(--${col})`} style={{ fontWeight: 500 }}>{v}Mt</M>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ padding: "10px", background: "var(--sf)", borderRadius: 8, border: "1px solid var(--bd)", marginBottom: 10 }}>
                                    <M size={9} color="var(--jade)" style={{ display: "block", marginBottom: 5, letterSpacing: ".08em", textTransform: "uppercase" }}>📐 Calculation Methodology</M>
                                    <p style={{ fontSize: 11, color: "var(--tx2)", lineHeight: 1.75 }}>{methodology}</p>
                                </div>

                                <div style={{ padding: "10px 12px", background: "rgba(0,232,122,.06)", borderRadius: 8, border: "1px solid rgba(0,232,122,.2)", marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{ fontSize: 16 }}>📋</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <M size={9} color="var(--jade)" style={{ display: "block", marginBottom: 2 }}>Official ESG / Sustainability Report</M>
                                        <div style={{ fontSize: 11, color: "var(--tx)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{url}</div>
                                    </div>
                                    <a href={url} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0, padding: "6px 12px", background: "var(--jade)", color: "#000", borderRadius: 7, fontSize: 11, fontFamily: "var(--disp)", fontWeight: 700, textDecoration: "none" }}>Open ↗</a>
                                </div>

                                {isLoading ? (
                                    <Rw style={{ gap: 8, padding: "8px 0" }}>
                                        <Spin size={16} />
                                        <M size={11} color="var(--jade)">Fetching live ESG data via Gemini + Google Search…</M>
                                    </Rw>
                                ) : live ? (
                                    <div>
                                        {live.news && <p style={{ fontSize: 12, color: "var(--tx2)", lineHeight: 1.65, marginBottom: 8, padding: "8px", background: "var(--sf)", borderRadius: 8, border: "1px solid var(--bd)" }}>🔴 LIVE: {live.news}</p>}
                                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                            {live.target && <Bdg color="jade">{`Net Zero: ${live.target}`}</Bdg>}
                                            {live.renewable_pct && <Bdg color="cyan">{`${live.renewable_pct}% RE`}</Bdg>}
                                            {live.cbam_risk && <Bdg color={live.cbam_risk === "High" ? "red" : live.cbam_risk === "Med" ? "amb" : "jade"}>{`CBAM: ${live.cbam_risk}`}</Bdg>}
                                        </div>
                                        {live.controversy && live.controversy.length > 5 && <p style={{ fontSize: 11, color: "var(--red)", marginTop: 8 }}>⚠ {live.controversy}</p>}
                                    </div>
                                ) : (
                                    <button onClick={() => { setAiData(p => ({ ...p, [cname]: undefined })); fetchLive(c); }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(0,232,122,.3)", background: "var(--jg)", color: "var(--jade)", fontFamily: "var(--disp)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>🌐 Fetch Live 2025 ESG Data</button>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
