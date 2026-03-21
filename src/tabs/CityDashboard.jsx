import React, { useState, useEffect } from "react";
import { Cd, M, Rw, Bdg, SHd, GlassBtn, Dot } from "../components/primitives";
import { CITIES, CITY_IDS, getCity } from "../config/cities.config.js";

export default function CityDashboard() {
    const [activeCityKey, setActiveCityKey] = useState("Indore");
    const city = getCity(activeCityKey);

    // Simulated IoT Telemetry
    const [telemetry, setTelemetry] = useState({
        bioCng: city.metrics.biocng.base,
        solar: city.metrics.solar.base,
        waste: city.metrics.waste.base,
        tokensMinted: city.carbonCredit.annual_credits_est
    });

    // Toggle for Enterprise Pitch Compliance, gated globally by ENV
    const [showWeb3, setShowWeb3] = useState(false);
    const ENABLE_TOKENOMICS = import.meta.env.VITE_ENABLE_TOKENOMICS === 'true';

    useEffect(() => {
        const c = getCity(activeCityKey);
        setTelemetry({
            bioCng: c.metrics.biocng.base,
            solar: c.metrics.solar.base,
            waste: c.metrics.waste.base,
            tokensMinted: c.carbonCredit.annual_credits_est
        });

        const inv = setInterval(() => {
            setTelemetry(prev => ({
                bioCng: prev.bioCng + Math.floor(Math.random() * 5),
                solar: +(prev.solar + (Math.random() * 0.02 - 0.01)).toFixed(2),
                waste: prev.waste + Math.floor(Math.random() * 2),
                tokensMinted: prev.tokensMinted + Math.floor(Math.random() * 3)
            }));
        }, 3000);
        return () => clearInterval(inv);
    }, [activeCityKey]);

    const METRIC_ICONS = { waste: "♻️", biocng: "🔥", solar: "☀️" };

    return (
        <div style={{ padding: "80px 16px 40px", maxWidth: 900, margin: "0 auto" }}>
            <div style={{ animation: "fadeUp .4s ease" }}>
                <Rw style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                    <div>
                        <SHd
                            tag={`Municipal Pilot — Swachh Rank #${city.swachh_rank}`}
                            title={`${city.name} Smart City Dashboard`}
                            sub={city.description}
                        />
                        {/* City selector pills */}
                        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                            {CITY_IDS.map(k => (
                                <div
                                    key={k}
                                    onClick={() => setActiveCityKey(k)}
                                    style={{
                                        padding: "6px 16px", borderRadius: 20, cursor: "pointer",
                                        fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600,
                                        transition: "all .2s",
                                        background: activeCityKey === k ? "var(--jade)" : "var(--sf)",
                                        color: activeCityKey === k ? "#fff" : "var(--tx2)",
                                        border: `1px solid ${activeCityKey === k ? "var(--jade)" : "var(--bd)"}`
                                    }}
                                >
                                    {CITIES[k].name}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
                        <div style={{ background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.3)", padding: "8px 16px", borderRadius: 20 }}>
                            <Rw style={{ gap: 8 }}>
                                <Dot pulse color="var(--jade)" size={6} />
                                <M size={12} color="var(--jade)" style={{ fontWeight: 600 }}>IoT Data Stream Active</M>
                            </Rw>
                        </div>

                        {ENABLE_TOKENOMICS && (
                            <div
                                onClick={() => setShowWeb3(!showWeb3)}
                                style={{
                                    display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                                    background: showWeb3 ? "rgba(124,58,237,.1)" : "var(--sf)",
                                    border: `1px solid ${showWeb3 ? "rgba(124,58,237,.3)" : "var(--bd)"}`,
                                    padding: "6px 14px", borderRadius: 20, transition: "all .2s"
                                }}
                            >
                                <span style={{ fontSize: 12 }}>{showWeb3 ? "🧪" : "💼"}</span>
                                <M size={11} color={showWeb3 ? "var(--pur)" : "var(--tx2)"} style={{ fontWeight: 600 }}>
                                    {showWeb3 ? "Web3 Engine Enabled" : "Compliance View"}
                                </M>
                            </div>
                        )}
                    </div>
                </Rw>

                {/* Dynamic metric cards driven by config */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
                    {["waste", "biocng", "solar"].map(metricKey => {
                        const metricConf = city.metrics[metricKey];
                        const telVal = metricKey === "waste" ? telemetry.waste
                            : metricKey === "biocng" ? telemetry.bioCng
                            : telemetry.solar;
                        const displayVal = metricKey === "solar" ? telVal.toFixed(2) : telVal.toLocaleString();
                        return (
                            <Cd key={metricKey} style={{ padding: 20, borderTop: `3px solid ${metricConf.color}` }}>
                                <Rw style={{ gap: 8, marginBottom: 8 }}>
                                    <span>{METRIC_ICONS[metricKey]}</span>
                                    <M size={11} color="var(--tx3)" style={{ textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>
                                        {metricConf.label.split(" ").slice(0, 2).join(" ")}
                                    </M>
                                </Rw>
                                <div style={{ fontFamily: "var(--mono)", fontSize: 28, fontWeight: 700, color: "var(--tx)", marginBottom: 4 }}>
                                    {displayVal} <span style={{ fontSize: 16, color: "var(--tx3)", fontWeight: 500 }}>{metricConf.unit}</span>
                                </div>
                                <M size={12} color="var(--tx2)">{metricConf.label}</M>
                            </Cd>
                        );
                    })}
                </div>

                {/* Gated Tokenization View */}
                {ENABLE_TOKENOMICS && showWeb3 && (
                    <div style={{ animation: "fadeUp .3s ease" }}>
                        <Cd glass accent style={{ padding: 24, marginBottom: 24, border: "1px solid rgba(124,58,237,.3)" }}>
                            <Rw style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
                                <div style={{ flex: 1, minWidth: 250 }}>
                                    <M size={11} color="var(--pur)" style={{ display: "block", marginBottom: 8, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 600 }}>Hedera Smart Contract Layer</M>
                                    <h3 style={{ fontFamily: "var(--disp)", fontSize: 24, color: "var(--tx)", marginBottom: 8 }}>Verified Municipal Offsets</h3>
                                    <p style={{ fontSize: 14, color: "var(--tx2)", lineHeight: 1.6, marginBottom: 16 }}>
                                        Smart contracts on Hedera Hashgraph listen to the above IoT telemetry. Verified methane avoidance and clean energy generation automatically mints compliance-grade carbon credits.
                                    </p>
                                    <Rw>
                                        <Bdg color="jade">{city.carbonCredit.methodology}</Bdg>
                                        <Bdg color="pur">Hedera Token Service</Bdg>
                                    </Rw>
                                </div>
                                <div style={{ background: "var(--bg)", padding: 20, borderRadius: 12, border: "1px solid var(--bd)", minWidth: 200, textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                                    <M size={12} color="var(--tx3)" style={{ marginBottom: 4 }}>$GORB Minted (24h)</M>
                                    <div style={{ fontFamily: "var(--mono)", fontSize: 36, fontWeight: 700, color: "var(--pur)" }}>
                                        {telemetry.tokensMinted.toLocaleString()}
                                    </div>
                                    <M size={11} color="var(--tx2)" style={{ marginTop: 8 }}>Equivalent to {Math.floor(telemetry.tokensMinted / 10)} tCO₂e avoided</M>
                                </div>
                            </Rw>
                        </Cd>

                        <div style={{ display: "flex", gap: 12 }}>
                            <GlassBtn primary style={{ flex: 1, padding: 14, background: "var(--pur)", boxShadow: "0 1px 3px rgba(124,58,237,.3)" }}>
                                📜 View Smart Contract Logs
                            </GlassBtn>
                            <GlassBtn style={{ flex: 1, padding: 14 }}>
                                📡 Connect Local Node
                            </GlassBtn>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
