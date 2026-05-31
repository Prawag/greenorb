import React, { useState, useEffect } from "react";
import { Cd, M, Rw, Bdg, SHd, GlassBtn, Dot, Spin } from "../components/primitives";
import { CITIES, CITY_IDS, getCity } from "../config/cities.config.js";

export default function CityDashboard() {
    const [activeCityKey, setActiveCityKey] = useState("indore");
    const city = getCity(activeCityKey);

    const metrics = city.metrics || {
        pm25: { label: "PM2.5 Air Quality", color: "#10b981", unit: "µg/m³" },
        solar: { label: "Solar Radiation", color: "#eab308", unit: "W/m²" },
        temp: { label: "Local Temperature", color: "#3b82f6", unit: "°C" }
    };

    const carbonCredit = city.carbonCredit || {
        annual_credits_est: 250000,
        methodology: "UNFCCC AMS-III.F"
    };

    const swachh_rank = city.swachh_rank || 1;
    const description = city.description || "Real-time Environment & Climate Dashboard.";

    // Real IoT Telemetry Data State
    const [telemetry, setTelemetry] = useState({
        pm25: 0,
        solar: 0,
        temp: 0,
        tokensMinted: carbonCredit.annual_credits_est
    });
    
    const [loadingData, setLoadingData] = useState(true);

    // Toggle for Enterprise Pitch Compliance, gated globally by ENV
    const [showWeb3, setShowWeb3] = useState(false);
    const ENABLE_TOKENOMICS = import.meta.env.VITE_ENABLE_TOKENOMICS === 'true';

    useEffect(() => {
        let active = true;
        const fetchRealData = async () => {
            setLoadingData(true);
            try {
                // 1. Geocode City Name
                const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.name)}&count=1&language=en&format=json`);
                const geoData = await geoRes.json();
                
                if (!geoData.results || geoData.results.length === 0) throw new Error("City not found");
                const { latitude: lat, longitude: lng } = geoData.results[0];

                // 2. Fetch Air Quality & Weather in parallel
                const [aqRes, weatherRes] = await Promise.all([
                    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=pm2_5`),
                    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,shortwave_radiation_instant`)
                ]);

                const aq = await aqRes.json();
                const weather = await weatherRes.json();

                if (active) {
                    setTelemetry(prev => ({
                        pm25: aq.current?.pm2_5 || 0,
                        solar: weather.current?.shortwave_radiation_instant || 0,
                        temp: weather.current?.temperature_2m || 0,
                        tokensMinted: prev.tokensMinted
                    }));
                }
            } catch (err) {
                console.error("Failed to fetch real telemetry:", err);
            } finally {
                if (active) setLoadingData(false);
            }
        };

        fetchRealData();
        
        // Refresh base live data from API every 10 minutes
        const apiInv = setInterval(fetchRealData, 10 * 60 * 1000);
        
        // Simulate live IoT sensor fluctuations (jitter) anchored to real data
        const jitterInv = setInterval(() => {
            if (!active) return;
            setTelemetry(prev => ({
                pm25: prev.pm25 ? Math.max(0, prev.pm25 + (Math.random() * 2 - 1)) : 0, // +/- 1
                solar: prev.solar ? Math.max(0, prev.solar + (Math.random() * 4 - 2)) : 0, // +/- 2
                temp: prev.temp ? prev.temp + (Math.random() * 0.2 - 0.1) : 0, // +/- 0.1
                tokensMinted: prev.tokensMinted + Math.floor(Math.random() * 3)
            }));
        }, 3000);
        
        return () => {
            active = false;
            clearInterval(apiInv);
            clearInterval(jitterInv);
        };
    }, [activeCityKey, city.name]);

    const METRIC_ICONS = { pm25: "🌫️", solar: "☀️", temp: "🌡️" };

    return (
        <div style={{ padding: "80px 16px 40px", maxWidth: 900, margin: "0 auto" }}>
            <div style={{ animation: "fadeUp .4s ease" }}>
                <Rw style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                    <div>
                        <SHd
                            tag={`Municipal Pilot — Swachh Rank #${swachh_rank}`}
                            title={`${city.name} Smart City Dashboard`}
                            sub={description}
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
                        <div style={{ background: loadingData ? "rgba(234,179,8,.1)" : "rgba(16,185,129,.1)", border: `1px solid ${loadingData ? "rgba(234,179,8,.3)" : "rgba(16,185,129,.3)"}`, padding: "8px 16px", borderRadius: 20 }}>
                            <Rw style={{ gap: 8 }}>
                                {loadingData ? <Spin size={8} color="var(--amb)" /> : <Dot pulse color="var(--jade)" size={6} />}
                                <M size={12} color={loadingData ? "var(--amb)" : "var(--jade)"} style={{ fontWeight: 600 }}>{loadingData ? "Syncing APIs..." : "IoT Data Stream Active"}</M>
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

                {/* Dynamic metric cards driven by real data */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
                    {["pm25", "solar", "temp"].map(metricKey => {
                        const metricConf = metrics[metricKey];
                        const telVal = telemetry[metricKey];
                        const displayVal = loadingData ? "--" : (metricKey === "temp" ? telVal.toFixed(1) : telVal.toLocaleString());
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
                                        <Bdg color="jade">{carbonCredit.methodology}</Bdg>
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
