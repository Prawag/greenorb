import React, { useState, useEffect } from "react";
import { M, Bdg, Cd, Rw, PBar, SHd } from "../components/primitives";

export default function CompareTab() {
    const [topCompanies, setTopCompanies] = useState([]);
    const [compareList, setCompareList] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchTopCompanies();
    }, []);

    const fetchTopCompanies = async () => {
        setLoading(true);
        try {
            const res = await fetch("http://localhost:5000/api/compare");
            const json = await res.json();
            setTopCompanies(json.data || []);
            setCompareList(json.data.slice(0, 3) || []); // Default to top 3
        } catch (err) {
            console.error("Failed to fetch comparisons:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async () => {
        if (!searchTerm.trim()) return;
        try {
            const res = await fetch(`http://localhost:5000/api/compare?companies=${searchTerm}`);
            const json = await res.json();
            if (json.data && json.data.length > 0) {
                // Add to list if not already there, max 5
                setCompareList(prev => {
                    const newList = [...prev];
                    json.data.forEach(c => {
                        if (!newList.find(x => x.name === c.name)) {
                            newList.push(c);
                        }
                    });
                    return newList.slice(-5);
                });
                setSearchTerm("");
            }
        } catch (err) {
            console.error("Search failed:", err);
        }
    };

    const removeCompany = (name) => {
        setCompareList(prev => prev.filter(c => c.name !== name));
    };

    const getScoreColor = (score) => {
        if (score >= 70) return "var(--jade)";
        if (score >= 40) return "var(--amb)";
        return "var(--red)";
    };

    return (
        <div style={{ padding: "16px 14px", height: "100%", overflowY: "auto" }}>
            <SHd tag="peer intelligence" title="ESG Multi-Company Comparison" sub="Comparative benchmarks across Scope 1-3, Environmental, Social, and Governance metrics." />

            <Cd style={{ padding: 16, marginBottom: 20 }}>
                <M size={10} color="var(--jade)" style={{ display: "block", marginBottom: 12, letterSpacing: ".08em", textTransform: "uppercase" }}>Compare Organizations</M>
                <Rw style={{ gap: 8, marginBottom: 16 }}>
                    <input 
                        type="text" 
                        placeholder="Type company names (e.g. Tata Steel, Reliance)..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                        style={{ flex: 1, background: "var(--sf)", border: "1px solid var(--bd)", borderRadius: 6, padding: "8px 12px", color: "var(--tx)", fontSize: 13 }}
                    />
                    <button onClick={handleSearch} style={{ background: "var(--jg)", border: "1px solid var(--jade)", borderRadius: 6, padding: "0 16px", color: "var(--jade)", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Add</button>
                </Rw>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                    {compareList.map(c => (
                        <Bdg key={c.name} color="blu" style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px" }}>
                            {c.name}
                            <span onClick={() => removeCompany(c.name)} style={{ cursor: "pointer", opacity: 0.6 }}>✕</span>
                        </Bdg>
                    ))}
                    {compareList.length === 0 && <M size={11} color="var(--tx3)">Select companies to start comparison</M>}
                </div>

                <div style={{ width: "100%", overflowX: "auto", border: "1px solid var(--bd)", borderRadius: 8 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
                        <thead>
                            <tr style={{ background: "var(--sf)", borderBottom: "1px solid var(--bd)" }}>
                                <th style={{ padding: "12px 16px", color: "var(--tx3)", fontWeight: 500, minWidth: 150 }}>Company</th>
                                <th style={{ padding: "12px 16px", color: "var(--tx3)", fontWeight: 500 }}>Sector</th>
                                <th style={{ padding: "12px 16px", color: "var(--tx3)", fontWeight: 500 }}>ESG Score</th>
                                <th style={{ padding: "12px 16px", color: "var(--tx3)", fontWeight: 500 }}>E</th>
                                <th style={{ padding: "12px 16px", color: "var(--tx3)", fontWeight: 500 }}>S</th>
                                <th style={{ padding: "12px 16px", color: "var(--tx3)", fontWeight: 500 }}>G</th>
                                <th style={{ padding: "12px 16px", color: "var(--tx3)", fontWeight: 500 }}>Scope 1</th>
                                <th style={{ padding: "12px 16px", color: "var(--tx3)", fontWeight: 500 }}>Scope 2</th>
                                <th style={{ padding: "12px 16px", color: "var(--tx3)", fontWeight: 500 }}>Total CO2</th>
                            </tr>
                        </thead>
                        <tbody>
                            {compareList.map(c => (
                                <tr key={c.name} style={{ borderBottom: "1px solid var(--bd)" }}>
                                    <td style={{ padding: "12px 16px", color: "var(--tx)", fontWeight: 600 }}>{c.name}</td>
                                    <td style={{ padding: "12px 16px", color: "var(--tx2)" }}>{c.sector}</td>
                                    <td style={{ padding: "12px 16px" }}>
                                        <div style={{ display: "inline-block", background: getScoreColor(c.score), color: "#000", padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>
                                            {c.score || "N/A"}
                                        </div>
                                    </td>
                                    <td style={{ padding: "12px 16px", color: getScoreColor(c.e_score), fontWeight: 600 }}>{c.e_score || "—"}</td>
                                    <td style={{ padding: "12px 16px", color: getScoreColor(c.s_score), fontWeight: 600 }}>{c.s_score || "—"}</td>
                                    <td style={{ padding: "12px 16px", color: getScoreColor(c.g_score), fontWeight: 600 }}>{c.g_score || "—"}</td>
                                    <td style={{ padding: "12px 16px", color: "var(--tx2)", fontFamily: "var(--mono)" }}>{(parseFloat(c.s1) / 1e6).toFixed(2)}M</td>
                                    <td style={{ padding: "12px 16px", color: "var(--tx2)", fontFamily: "var(--mono)" }}>{(parseFloat(c.s2) / 1e6).toFixed(2)}M</td>
                                    <td style={{ padding: "12px 16px", color: "var(--jade)", fontWeight: 600, fontFamily: "var(--mono)" }}>{(parseFloat(c.co2) / 1e6).toFixed(2)} Mt</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Cd>

            <M size={10} color="var(--jade)" style={{ display: "block", marginBottom: 12, letterSpacing: ".08em", textTransform: "uppercase" }}>Industry Top Performers</M>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                {topCompanies.map(c => (
                    <Cd key={c.name} style={{ padding: 14, cursor: "pointer" }} onClick={() => setSearchTerm(c.name)}>
                        <Rw style={{ justifyContent: "space-between", marginBottom: 8 }}>
                            <M size={12} color="var(--tx)" style={{ fontWeight: 700 }}>{c.name}</M>
                            <div style={{ background: getScoreColor(c.score), color: "#000", padding: "1px 6px", borderRadius: 4, fontWeight: 700, fontSize: 11 }}>
                                {c.score}
                            </div>
                        </Rw>
                        <M size={11} color="var(--tx3)" style={{ display: "block", marginBottom: 10 }}>{c.sector}</M>
                        <Rw style={{ gap: 12 }}>
                            <div>
                                <M size={9} color="var(--tx3)" style={{ display: "block" }}>E</M>
                                <M size={11} color={getScoreColor(c.e_score)} style={{ fontWeight: 600 }}>{c.e_score}</M>
                            </div>
                            <div>
                                <M size={9} color="var(--tx3)" style={{ display: "block" }}>S</M>
                                <M size={11} color={getScoreColor(c.s_score)} style={{ fontWeight: 600 }}>{c.s_score}</M>
                            </div>
                            <div>
                                <M size={9} color="var(--tx3)" style={{ display: "block" }}>G</M>
                                <M size={11} color={getScoreColor(c.g_score)} style={{ fontWeight: 600 }}>{c.g_score}</M>
                            </div>
                            <div style={{ marginLeft: "auto", textAlign: "right" }}>
                                <M size={9} color="var(--tx3)" style={{ display: "block" }}>Total Emissions</M>
                                <M size={11} color="var(--tx)" style={{ fontWeight: 600 }}>{(parseFloat(c.co2) / 1e6).toFixed(1)} Mt</M>
                            </div>
                        </Rw>
                    </Cd>
                ))}
            </div>
            {loading && <M size={12} color="var(--tx2)" style={{ padding: 20, textAlign: "center" }}>Synchronizing intelligence data...</M>}
        </div>
    );
}
