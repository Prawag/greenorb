import React, { useState, useEffect } from "react";
import { API_BASE, fetchApi } from "../utils";

/* 
  Pure CSS definitions mapped to CSS Custom Properties.
  Dependencies: var(--sf), var(--tx), var(--tx2), var(--tx3), var(--bd), var(--bd2), var(--bg), var(--bg2), var(--bg3)
  and brand colors var(--jade), var(--amb), var(--red), var(--pur), var(--cyan)
*/

export default function AuditTab() {
    const [companies, setCompanies] = useState([]);
    const [peers, setPeers] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState(null);
    const [brsrData, setBrsrData] = useState(null);
    const [welfordFlags, setWelfordFlags] = useState({});
    const [loading, setLoading] = useState(true);

    // Initial Load - Assuming standard DB fetch from Neon via existing data route or compare route
    useEffect(() => {
        async function init() {
            setLoading(true);
            try {
                // Borrowing compare data as surrogate for company list since it contains analysis scores
                const compData = await fetchApi('/compare');
                setPeers(compData || []);
                
                // Construct basic company list from unified data
                const unified = await fetchApi('/data'); // Using generic data pool for list
                if (unified && Array.isArray(unified)) {
                    // Extract unique company logic relying on analysis score presence
                    const unique = Array.from(new Set(unified.map(c => c.name)))
                        .map(n => unified.find(u => u.name === n));
                    setCompanies(unique);
                } else if (compData) {
                    setCompanies(compData);
                }
            } catch (err) {
                console.error("Audit Tab init failed", err);
            }
            setLoading(false);
        }
        init();
    }, []);

    // When a company is selected, load its detailed BRSR and Welford anomaly data
    useEffect(() => {
        if (!selectedCompany) return;
        
        async function fetchDetails() {
            try {
                // In a perfect world, we'd have a targeted /api/company/:name endpoint. 
                // Relying on mapped extraction from the unified dataset or generic polling.
                
                // Construct Welford checks for all numeric metrics available for this company
                const metrics = {
                    scope1: selectedCompany.s1 || 0,
                    scope2: selectedCompany.s2 || 0,
                    water: selectedCompany.water_withdrawal || 0,
                    energy: selectedCompany.energy_consumption || 0,
                    waste: selectedCompany.waste_generated || 0
                };

                const flagResults = {};
                for (const [key, val] of Object.entries(metrics)) {
                    if (val <= 0) continue;
                    try {
                        const wRes = await fetch(`${API_BASE}/welford/check`, {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ company_id: selectedCompany.name, metric_name: key, new_value: val })
                        });
                        const wData = await wRes.json();
                        flagResults[key] = wData;
                    } catch (e) { }
                }
                setWelfordFlags(flagResults);
                
                // Map existing generic DB structure fields (which mirror BRSR) to the component local state
                setBrsrData({
                    scope1_emissions: selectedCompany.s1,
                    scope2_emissions: selectedCompany.s2,
                    water_consumption: selectedCompany.water_withdrawal,
                    energy_consumption: selectedCompany.energy_consumption,
                    waste_generated: selectedCompany.waste_generated,
                    women_workforce_pct: selectedCompany.percentage_women, // Mocking extension mapping
                    board_independence_pct: selectedCompany.board_independence_pct || "N/A"
                });

            } catch (error) {
                console.error("Detail fetch failed", error);
            }
        }
        fetchDetails();
    }, [selectedCompany]);

    const getScoreColor = (score) => {
        if (!score) return "var(--tx3)";
        if (score >= 70) return "var(--jade)";
        if (score >= 40) return "var(--amb)";
        return "var(--red)";
    };

    const getRiskBand = (val) => {
        if (val < 1000000) return "var(--jade)";
        if (val <= 5000000) return "var(--amb)";
        return "var(--red)";
    };

    const renderMetricBox = (label, val, unit) => (
        <div style={{ padding: "12px", background: "var(--bg3)", border: "1px solid var(--bd2)", borderRadius: "8px" }}>
            <div style={{ fontSize: "11px", color: "var(--tx3)", marginBottom: "4px" }}>{label}</div>
            <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--tx)", fontFamily: "var(--mono)" }}>
                {val !== undefined && val !== null && val !== "N/A" ? `${val.toLocaleString()} ${unit}` : "N/A"}
            </div>
        </div>
    );

    const cbamApplicable = selectedCompany && ["Steel", "Aluminium", "Cement", "Fertilizers"].includes(selectedCompany.sector);
    
    // Formula: (EU ETS - Domestic Carbon Price) * Verified Emissions
    // Assumed constants for 2026: EU ETS €80, India CCTS €10
    const EU_ETS = 80;
    const INDIA_CCTS = 10;
    const NET_TARIFF = EU_ETS - INDIA_CCTS; // €70/tonne

    const cbamVerified = selectedCompany && selectedCompany.s1 ? selectedCompany.s1 * NET_TARIFF : 0;
    const cbamUnverified = selectedCompany && selectedCompany.s1 ? selectedCompany.s1 * 2.1 * EU_ETS : 0; // Penalties usually ignore deductions

    return (
        <div style={{ display: "flex", height: "calc(100vh - 120px)", fontFamily: "var(--sf)", color: "var(--tx)" }}>
            
            {/* LEFT PANEL: Company List */}
            <div style={{ width: "320px", borderRight: "1px solid var(--bd)", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
                <div style={{ padding: "16px", borderBottom: "1px solid var(--bd2)" }}>
                    <div style={{ fontSize: "15px", fontWeight: "700", marginBottom: "4px" }}>Audit Directory</div>
                    <div style={{ fontSize: "12px", color: "var(--tx3)" }}>Select a company to view deep audit metrics and anomaly risk.</div>
                </div>
                
                <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
                    {loading && <div style={{ padding: "16px", fontSize: "12px", color: "var(--tx3)", textAlign: "center" }}>Loading matrix...</div>}
                    {!loading && companies.map(c => {
                        // Attempt to extract greendex analysis score
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
                                    border: `1px solid ${selectedCompany?.name === c.name ? "var(--tx2)" : "var(--bd2)"}`,
                                    display: "flex", justifyContent: "space-between", alignItems: "center",
                                    transition: "all 0.2s"
                                }}
                            >
                                <div>
                                    <div style={{ fontSize: "13px", fontWeight: "600" }}>{c.name}</div>
                                    <div style={{ fontSize: "11px", color: "var(--tx3)", marginTop: "2px" }}>{c.sector}</div>
                                </div>
                                {gScore > 0 && (
                                    <div style={{ 
                                        padding: "4px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: "700", fontFamily: "var(--mono)",
                                        background: `${getScoreColor(gScore)}22`, color: getScoreColor(gScore), border: `1px solid ${getScoreColor(gScore)}`
                                    }}>
                                        GX {gScore}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* RIGHT PANEL: Details */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px", background: "var(--bg)" }}>
                {!selectedCompany && (
                    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--tx3)", fontSize: "14px" }}>
                        Select a company from the directory to begin audit
                    </div>
                )}

                {selectedCompany && (
                    <div style={{ maxWidth: "800px", margin: "0 auto" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
                            <div>
                                <h1 style={{ margin: 0, fontSize: "24px", fontWeight: "700" }}>{selectedCompany.name}</h1>
                                <div style={{ fontSize: "13px", color: "var(--tx2)", marginTop: "4px" }}>{selectedCompany.sector} · {selectedCompany.country}</div>
                            </div>
                            <button 
                                onClick={async () => {
                                    alert("Triggering Greendex Auto-computation...");
                                    await fetch(`${API_BASE}/greendex/recompute?company=${encodeURIComponent(selectedCompany.name)}`);
                                }}
                                style={{
                                    padding: "8px 16px", background: "var(--bg3)", color: "var(--tx)", border: "1px solid var(--bd)", borderRadius: "6px", cursor: "pointer", fontSize: "12px"
                                }}
                            >
                                Recompute Greendex
                            </button>
                        </div>

                        {/* Section A: BRSR Metrics */}
                        <div style={{ marginBottom: "32px" }}>
                            <h2 style={{ fontSize: "14px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "1px", color: "var(--tx2)", borderBottom: "1px solid var(--bd2)", paddingBottom: "8px", marginBottom: "16px" }}>
                                Section A: BRSR Reported Metrics (2024)
                            </h2>
                            {!brsrData || (!brsrData.scope1_emissions && !brsrData.water_consumption) ? (
                                <div style={{ padding: "16px", background: "var(--bg2)", border: "1px dashed var(--bd)", borderRadius: "8px", fontSize: "13px", color: "var(--tx3)", textAlign: "center" }}>
                                    No BRSR data for this period
                                    <button 
                                        onClick={async () => {
                                            const url = prompt("Enter BSE/Company PDF URL for BRSR extraction:");
                                            if (!url) return;
                                            try {
                                                const res = await fetchApi("/audit/brsr-pdf", { 
                                                    method: "POST", 
                                                    body: JSON.stringify({ pdfUrl: url, companyName: selectedCompany.name }) 
                                                });
                                                if (res.data) {
                                                    setBrsrData(prev => ({
                                                        ...prev,
                                                        scope1_emissions: res.data.scope_1_emissions,
                                                        scope2_emissions: res.data.scope_2_emissions,
                                                        water_consumption: res.data.water_withdrawal_kl,
                                                        energy_consumption: res.data.energy_consumption_gj,
                                                        waste_generated: res.data.waste_generated_mt
                                                    }));
                                                    alert("Metrics extracted successfully!");
                                                }
                                            } catch (e) {
                                                alert("Extraction error: " + e.message);
                                            }
                                        }}
                                        style={{ marginLeft: "12px", padding: "4px 8px", background: "var(--jade)", color: "var(--bg)", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "11px", fontWeight: "600" }}
                                    >
                                        Extract from PDF
                                    </button>
                                </div>
                            ) : (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
                                    {renderMetricBox("Scope 1 Emissions", brsrData.scope1_emissions, "tCO2")}
                                    {renderMetricBox("Scope 2 Emissions", brsrData.scope2_emissions, "tCO2")}
                                    {renderMetricBox("Water Consumption", brsrData.water_consumption, "KL")}
                                    {renderMetricBox("Energy Consumption", brsrData.energy_consumption, "GJ")}
                                    {renderMetricBox("Waste Generated", brsrData.waste_generated, "MT")}
                                    {renderMetricBox("Women in Workforce", brsrData.women_workforce_pct, "%")}
                                    {renderMetricBox("Board Independence", brsrData.board_independence_pct, "%")}
                                </div>
                            )}
                        </div>

                        {/* Section B: Welford Anomaly Flags */}
                        <div style={{ marginBottom: "32px" }}>
                            <h2 style={{ fontSize: "14px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "1px", color: "var(--tx2)", borderBottom: "1px solid var(--bd2)", paddingBottom: "8px", marginBottom: "16px" }}>
                                Section B: Welford Algorithmic Anomaly Flags
                            </h2>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                                {Object.keys(welfordFlags).length === 0 && <div style={{ color: "var(--tx3)", fontSize: "13px" }}>No anomalies verified.</div>}
                                {Object.entries(welfordFlags).map(([metric, res]) => {
                                    if (!res || !res.observation_count) return null;
                                    const zScore = res.z_score || 0;
                                    const isAnomaly = Math.abs(zScore) > 2.0 && res.observation_count >= 5;
                                    const isColdStart = res.observation_count < 5;
                                    
                                    return (
                                        <div key={metric} style={{ padding: "12px", background: "var(--bg2)", border: `1px solid ${isAnomaly ? "var(--red)" : "var(--bd2)"}`, borderRadius: "8px", flex: "1 1 200px" }}>
                                            <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--tx)", textTransform: "capitalize", marginBottom: "8px" }}>{metric}</div>
                                            <div style={{ fontSize: "11px", color: "var(--tx3)", marginBottom: "4px" }}>Z-Score: <span style={{ fontFamily: "var(--mono)", color: "var(--tx)" }}>{zScore.toFixed(2)}</span></div>
                                            <div style={{ fontSize: "11px", color: "var(--tx3)", marginBottom: "8px" }}>Observations: {res.observation_count}</div>
                                            
                                            {isColdStart && (
                                                <div style={{ display: "inline-block", padding: "2px 6px", background: "var(--amb)22", border: "1px solid var(--amb)", color: "var(--amb)", borderRadius: "4px", fontSize: "10px", fontWeight: "600" }}>
                                                    COLD START
                                                </div>
                                            )}
                                            {isAnomaly && (
                                                <div style={{ display: "inline-block", padding: "2px 6px", background: "var(--red)22", border: "1px solid var(--red)", color: "var(--red)", borderRadius: "4px", fontSize: "10px", fontWeight: "600" }}>
                                                    ANOMALY RISK
                                                </div>
                                            )}
                                            {!isColdStart && !isAnomaly && (
                                                <div style={{ display: "inline-block", padding: "2px 6px", background: "var(--jade)22", border: "1px solid var(--jade)", color: "var(--jade)", borderRadius: "4px", fontSize: "10px", fontWeight: "600" }}>
                                                    STABLE
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Section C: EU CBAM Exposure Matrix */}
                        {cbamApplicable && (
                            <div style={{ marginBottom: "32px" }}>
                                <h2 style={{ fontSize: "14px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "1px", color: "var(--tx2)", borderBottom: "1px solid var(--bd2)", paddingBottom: "8px", marginBottom: "16px" }}>
                                    Section C: EU CBAM Financial Exposure Risk
                                </h2>
                                <div style={{ fontSize: "12px", color: "var(--tx3)", marginBottom: "12px" }}>
                                    Domestic CCTS credits can offset CBAM liability
                                </div>
                                <div style={{ display: "flex", gap: "16px" }}>
                                    <div style={{ flex: 1, padding: "16px", background: "var(--bg2)", border: `1px solid ${getRiskBand(cbamVerified)}`, borderRadius: "8px" }}>
                                        <div style={{ fontSize: "12px", color: "var(--tx3)", marginBottom: "4px" }}>
                                            Net Liability (EU €{EU_ETS} - IN €{INDIA_CCTS} = €{NET_TARIFF})
                                        </div>
                                        <div style={{ fontSize: "20px", fontWeight: "700", color: getRiskBand(cbamVerified), fontFamily: "var(--mono)" }}>
                                            €{cbamVerified.toLocaleString()}
                                        </div>
                                    </div>
                                    <div style={{ flex: 1, padding: "16px", background: "var(--bg2)", border: `1px solid ${getRiskBand(cbamUnverified)}`, borderRadius: "8px" }}>
                                        <div style={{ fontSize: "12px", color: "var(--tx3)", marginBottom: "4px" }}>~€168/tonne product exported (unverified)</div>
                                        <div style={{ fontSize: "20px", fontWeight: "700", color: getRiskBand(cbamUnverified), fontFamily: "var(--mono)" }}>
                                            €{cbamUnverified.toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Section D: Peer Comparison (CSS Bars) */}
                        <div style={{ marginBottom: "32px" }}>
                            <h2 style={{ fontSize: "14px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "1px", color: "var(--tx2)", borderBottom: "1px solid var(--bd2)", paddingBottom: "8px", marginBottom: "16px" }}>
                                Section D: Peer Comparison (Greendex Score)
                            </h2>
                            <div style={{ background: "var(--bg2)", border: "1px solid var(--bd2)", borderRadius: "8px", padding: "16px" }}>
                                {peers.slice(0, 10).map((p, idx) => {
                                    const peerScore = p.score || p.esg_score || 0;
                                    const isSelected = p.name === selectedCompany.name;
                                    return (
                                        <div key={p.name} style={{ display: "flex", alignItems: "center", marginBottom: idx === 9 ? 0 : "12px" }}>
                                            <div style={{ width: "140px", fontSize: "12px", fontWeight: isSelected ? "700" : "400", color: isSelected ? "var(--tx)" : "var(--tx3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {p.name}
                                            </div>
                                            <div style={{ flex: 1, height: "12px", background: "var(--bg3)", borderRadius: "6px", marginLeft: "12px", position: "relative", overflow: "hidden" }}>
                                                <div style={{ 
                                                    position: "absolute", left: 0, top: 0, bottom: 0, 
                                                    width: `${Math.min(100, peerScore)}%`, 
                                                    background: isSelected ? getScoreColor(peerScore) : `${getScoreColor(peerScore)}aa`,
                                                    transition: "width 0.4s ease-out"
                                                }} />
                                            </div>
                                            <div style={{ width: "40px", textAlign: "right", fontSize: "11px", fontFamily: "var(--mono)", color: "var(--tx2)", fontWeight: "600" }}>
                                                {peerScore}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                    </div>
                )}
            </div>
        </div>
    );
}
