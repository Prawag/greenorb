import React, { useState } from "react";
import { M, Bdg, Cd, Rw, SHd, GlassBtn } from "../components/primitives";

const MARKET_STATS = [
    { label: "ESG Data Market", value: "$30B+", sub: "by 2027 (Bloomberg)" },
    { label: "Companies Reporting ESG", value: "10,000+", sub: "mandatory by EU CSRD" },
    { label: "Carbon Market Value", value: "$909B", sub: "traded in 2023" },
    { label: "Green Bond Issuance", value: "$575B", sub: "annual (2023)" },
];

const USE_CASES = [
    { icon: "🏦", title: "Asset Managers & Funds", desc: "Screen portfolios for ESG risk, identify green investment opportunities, meet regulatory reporting (SFDR, TCFD)", color: "var(--jade)" },
    { icon: "🏛", title: "Regulators & Governments", desc: "Monitor corporate emissions compliance, track national climate targets, detect greenwashing at scale", color: "var(--cyan)" },
    { icon: "🔬", title: "Researchers & Academics", desc: "Access the largest open carbon database, analyze global emission patterns, publish data-driven climate studies", color: "var(--pur)" },
    { icon: "🏢", title: "Corporations", desc: "Benchmark against peers, identify supply chain carbon hotspots, improve Scope 3 reporting accuracy", color: "var(--gold)" },
    { icon: "🛒", title: "Consumers", desc: "Scan product carbon footprints, compare brands on sustainability, make informed purchase decisions", color: "var(--jade)" },
    { icon: "📊", title: "ESG Rating Agencies", desc: "Supplement proprietary data with AI-discovered reports, improve coverage of SMEs and emerging markets", color: "var(--cyan)" },
];

const INVEST_REASONS = [
    { icon: "🌐", title: "Network Effects", desc: "More users → more data uploaded → more valuable database → attracts more users. Classic platform economics." },
    { icon: "🤖", title: "AI Moat", desc: "4 collaborative agents continuously discover data 24/7. No manual research team can compete with AI-scale discovery." },
    { icon: "💰", title: "Deflationary Token", desc: "$GORB has 1% burn on swaps + halving rewards. Supply decreases while utility increases = price appreciation." },
    { icon: "⚡", title: "First Mover", desc: "No existing platform offers AI-powered collaborative ESG discovery with token-incentivized data contribution at this scale." },
    { icon: "📈", title: "Massive Market", desc: "$30B+ ESG data market dominated by Bloomberg, MSCI. Open, AI-powered alternative has huge disruption potential." },
    { icon: "🌍", title: "Global Mandate", desc: "EU CSRD, SEC climate disclosure, ISSB standards — every company MUST report ESG. Data demand is exploding." },
];

const COMPETITORS = [
    { name: "Bloomberg ESG", type: "Incumbent", cost: "$24k/yr", coverage: "12,000 companies", ai: "No", open: "No" },
    { name: "MSCI ESG", type: "Incumbent", cost: "$50k/yr", coverage: "8,500 companies", ai: "No", open: "No" },
    { name: "Sustainalytics", type: "Incumbent", cost: "$20k/yr", coverage: "16,000 companies", ai: "No", open: "No" },
    { name: "CDP", type: "Non-profit", cost: "Free (limited)", coverage: "23,000 companies", ai: "No", open: "Partial" },
    { name: "GreenOrb", type: "AI-native", cost: "Free + $GORB", coverage: "Unlimited (AI)", ai: "4 Agents", open: "Yes" },
];

const ROADMAP = [
    { phase: "Q1 2026", title: "Launch", items: ["4-Agent system live", "195 countries", "$GORB on Hedera testnet", "PWA + mobile"] },
    { phase: "Q2 2026", title: "Scale", items: ["100k+ companies discovered", "Public API launch", "$GORB mainnet + staking", "Governance DAO"] },
    { phase: "Q3 2026", title: "Ecosystem", items: ["Partner with ESG rating agencies", "Supply chain carbon tracker", "Real-time emissions monitoring", "Enterprise tier"] },
    { phase: "Q4 2026", title: "Dominance", items: ["1M+ products mapped", "500k+ companies", "Cross-chain bridges", "Institutional partnerships"] },
];

export default function AboutTab() {
    const [section, setSection] = useState("problem");

    return (
        <div style={{ padding: "16px 14px" }}>
            <SHd tag="Why GreenOrb Exists" title="Carbon Intelligence for Everyone" sub="The world's first AI-powered, token-incentivized, open ESG data platform" />

            {/* Section Nav */}
            <div style={{ display: "flex", gap: 4, marginBottom: 16, overflowX: "auto" }}>
                {[
                    { k: "problem", l: "Problem" },
                    { k: "solution", l: "Solution" },
                    { k: "market", l: "Market" },
                    { k: "invest", l: "Why Invest" },
                    { k: "roadmap", l: "Roadmap" },
                ].map(s => (
                    <button key={s.k} onClick={() => setSection(s.k)} style={{
                        flex: 1, padding: "10px 6px", borderRadius: 10,
                        background: section === s.k ? "linear-gradient(135deg, rgba(0,240,160,.12), rgba(52,216,232,.08))" : "transparent",
                        border: `1px solid ${section === s.k ? "rgba(0,240,160,.25)" : "var(--bd)"}`,
                        color: section === s.k ? "var(--jade)" : "var(--tx3)",
                        fontFamily: "var(--disp)", fontWeight: 700, fontSize: 11, cursor: "pointer",
                        whiteSpace: "nowrap", flexShrink: 0, transition: "all .2s",
                    }}>
                        {s.l}
                    </button>
                ))}
            </div>

            {/* ═══ PROBLEM ═══ */}
            {section === "problem" && (
                <div style={{ animation: "fadeUp .3s ease" }}>
                    <Cd glass accent style={{ padding: 20, marginBottom: 14, textAlign: "center" }}>
                        <div style={{ fontSize: 48, marginBottom: 12 }}>🌍</div>
                        <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 20, color: "var(--tx)", marginBottom: 8 }}>The Carbon Data Crisis</div>
                        <M size={13} color="var(--tx2)" style={{ display: "block", lineHeight: 1.8 }}>
                            There is no single, comprehensive database of carbon footprints for every company, product, and country on Earth.
                        </M>
                    </Cd>

                    {[
                        { stat: "100,000+", label: "ESG reports published annually as scattered PDFs", color: "var(--red)" },
                        { stat: "80%", label: "of companies have NO publicly available emissions data", color: "var(--amb)" },
                        { stat: "$24,000/yr", label: "minimum cost to access Bloomberg ESG data", color: "var(--red)" },
                        { stat: "0", label: "open, AI-powered alternatives that track every company globally", color: "var(--jade)" },
                    ].map(s => (
                        <Cd key={s.label} glass style={{ padding: 14, marginBottom: 8 }}>
                            <Rw style={{ gap: 12 }}>
                                <div style={{ fontFamily: "var(--mono)", fontSize: 24, color: s.color, fontWeight: 600, flexShrink: 0, width: 80, textAlign: "right" }}>{s.stat}</div>
                                <M size={12} color="var(--tx2)" style={{ lineHeight: 1.6 }}>{s.label}</M>
                            </Rw>
                        </Cd>
                    ))}

                    <Cd glass style={{ padding: 16, marginTop: 12, borderColor: "rgba(255,90,90,.15)", background: "rgba(255,90,90,.03)" }}>
                        <M size={12} color="var(--red)" style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>The Result:</M>
                        <M size={12} color="var(--tx2)" style={{ display: "block", lineHeight: 1.8 }}>
                            Investors can't properly assess ESG risk. Regulators can't enforce compliance. Consumers can't make informed choices. Greenwashing flourishes because verification is impossible at scale.
                        </M>
                    </Cd>
                </div>
            )}

            {/* ═══ SOLUTION ═══ */}
            {section === "solution" && (
                <div style={{ animation: "fadeUp .3s ease" }}>
                    <Cd glass accent style={{ padding: 20, marginBottom: 14, textAlign: "center" }}>
                        <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
                        <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 20, color: "var(--jade)", marginBottom: 8 }}>GreenOrb's Solution</div>
                        <M size={13} color="var(--tx2)" style={{ display: "block", lineHeight: 1.8 }}>
                            4 collaborative AI agents that autonomously discover, analyze, verify, and strategize ESG data — 24/7, globally, for free.
                        </M>
                    </Cd>

                    {[
                        { icon: "🔍", title: "Scout Agent", desc: "Discovers companies across 15+ sectors, extracts emissions data from AI-analyzed reports", color: "var(--jade)" },
                        { icon: "📊", title: "Analyst Agent", desc: "Deep ESG scoring: environment, social, governance breakdown with peer comparison and trend analysis", color: "var(--cyan)" },
                        { icon: "⚠️", title: "Risk Agent", desc: "Detects greenwashing, regulatory non-compliance, climate exposure, and data quality issues", color: "var(--gold)" },
                        { icon: "💡", title: "Strategy Agent", desc: "Synthesizes all data into BUY/HOLD/SELL recommendations with confidence scores and catalysts", color: "var(--pur)" },
                    ].map(a => (
                        <Cd key={a.title} glass style={{ padding: 14, marginBottom: 8 }}>
                            <Rw style={{ gap: 12 }}>
                                <div style={{ width: 44, height: 44, borderRadius: 12, background: `${a.color}12`, border: `1px solid ${a.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{a.icon}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <M size={13} color="var(--tx)" style={{ fontWeight: 700, display: "block" }}>{a.title}</M>
                                    <M size={11} color="var(--tx3)" style={{ lineHeight: 1.6 }}>{a.desc}</M>
                                </div>
                            </Rw>
                        </Cd>
                    ))}

                    <Cd glass style={{ padding: 16, marginTop: 8 }}>
                        <M size={10} color="var(--jade)" style={{ display: "block", marginBottom: 8, fontWeight: 700, letterSpacing: ".1em" }}>USE CASES</M>
                        {USE_CASES.map(u => (
                            <Rw key={u.title} style={{ padding: "8px 0", borderBottom: "1px solid var(--bg3)", gap: 10 }}>
                                <span style={{ fontSize: 18, flexShrink: 0 }}>{u.icon}</span>
                                <div>
                                    <M size={12} color={u.color} style={{ fontWeight: 700 }}>{u.title}</M>
                                    <M size={10} color="var(--tx3)" style={{ display: "block" }}>{u.desc}</M>
                                </div>
                            </Rw>
                        ))}
                    </Cd>
                </div>
            )}

            {/* ═══ MARKET ═══ */}
            {section === "market" && (
                <div style={{ animation: "fadeUp .3s ease" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                        {MARKET_STATS.map(s => (
                            <Cd key={s.label} glass style={{ padding: 14, textAlign: "center" }}>
                                <div style={{ fontFamily: "var(--mono)", fontSize: 22, color: "var(--jade)", fontWeight: 600 }}>{s.value}</div>
                                <M size={11} color="var(--tx)" style={{ display: "block", fontWeight: 600 }}>{s.label}</M>
                                <M size={9} color="var(--tx3)">{s.sub}</M>
                            </Cd>
                        ))}
                    </div>

                    <Cd glass style={{ padding: 14, marginBottom: 14 }}>
                        <M size={10} color="var(--jade)" style={{ display: "block", marginBottom: 10, fontWeight: 700, letterSpacing: ".1em" }}>COMPETITIVE LANDSCAPE</M>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--mono)", fontSize: 10 }}>
                                <thead>
                                    <tr style={{ borderBottom: "1px solid var(--bd2)" }}>
                                        {["Platform", "Cost", "Coverage", "AI", "Open"].map(h => (
                                            <th key={h} style={{ padding: "6px 4px", textAlign: "left", color: "var(--tx3)", fontWeight: 600 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {COMPETITORS.map(c => (
                                        <tr key={c.name} style={{ borderBottom: "1px solid var(--bg3)", background: c.name === "GreenOrb" ? "rgba(0,240,160,.05)" : "transparent" }}>
                                            <td style={{ padding: "6px 4px", color: c.name === "GreenOrb" ? "var(--jade)" : "var(--tx)", fontWeight: c.name === "GreenOrb" ? 700 : 400 }}>{c.name}</td>
                                            <td style={{ padding: "6px 4px", color: "var(--tx2)" }}>{c.cost}</td>
                                            <td style={{ padding: "6px 4px", color: "var(--tx2)" }}>{c.coverage}</td>
                                            <td style={{ padding: "6px 4px", color: c.ai !== "No" ? "var(--jade)" : "var(--tx3)" }}>{c.ai}</td>
                                            <td style={{ padding: "6px 4px", color: c.open === "Yes" ? "var(--jade)" : "var(--tx3)" }}>{c.open}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Cd>

                    <Cd glass accent style={{ padding: 16, textAlign: "center" }}>
                        <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 16, color: "var(--jade)", marginBottom: 6 }}>GreenOrb's Edge</div>
                        <M size={12} color="var(--tx2)" style={{ display: "block", lineHeight: 1.8 }}>
                            Free, AI-powered, open-source, token-incentivized. The only platform where data discovery is automated, verified by multiple specialized agents, and accessible to everyone — not just enterprises paying $50k/year.
                        </M>
                    </Cd>
                </div>
            )}

            {/* ═══ WHY INVEST ═══ */}
            {section === "invest" && (
                <div style={{ animation: "fadeUp .3s ease" }}>
                    <Cd glass accent style={{ padding: 20, marginBottom: 14, textAlign: "center" }}>
                        <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 20, color: "var(--gold)", marginBottom: 8 }}>Why Invest in $GORB?</div>
                        <M size={13} color="var(--tx2)" style={{ display: "block", lineHeight: 1.8 }}>
                            $GORB is not speculative — it's the utility token powering the world's largest open carbon intelligence network.
                        </M>
                    </Cd>

                    {INVEST_REASONS.map(r => (
                        <Cd key={r.title} glass style={{ padding: 14, marginBottom: 8 }}>
                            <Rw style={{ gap: 12 }}>
                                <span style={{ fontSize: 26, flexShrink: 0 }}>{r.icon}</span>
                                <div>
                                    <M size={13} color="var(--tx)" style={{ fontWeight: 700, display: "block", marginBottom: 2 }}>{r.title}</M>
                                    <M size={11} color="var(--tx3)" style={{ lineHeight: 1.7 }}>{r.desc}</M>
                                </div>
                            </Rw>
                        </Cd>
                    ))}

                    <Cd glass style={{ padding: 16, marginTop: 8, borderColor: "rgba(0,240,160,.2)" }}>
                        <M size={10} color="var(--jade)" style={{ display: "block", fontWeight: 700, letterSpacing: ".1em", marginBottom: 8 }}>TOKEN ECONOMICS</M>
                        {[
                            ["Supply", "1B GORB (8 decimals)"],
                            ["Mining", "40% earned via Proof-of-Green actions"],
                            ["Burn", "1% on every swap (deflationary)"],
                            ["Halving", "Every 180 days for 3 years"],
                            ["Staking", "5% / 12% / 20% APY (30/90/365 days)"],
                            ["Governance", "1 staked GORB = 1 vote"],
                        ].map(([k, v]) => (
                            <Rw key={k} style={{ padding: "5px 0", borderBottom: "1px solid var(--bg3)", justifyContent: "space-between" }}>
                                <M size={11} color="var(--tx3)">{k}</M>
                                <M size={11} color="var(--jade)" style={{ fontWeight: 600 }}>{v}</M>
                            </Rw>
                        ))}
                    </Cd>
                </div>
            )}

            {/* ═══ ROADMAP ═══ */}
            {section === "roadmap" && (
                <div style={{ animation: "fadeUp .3s ease" }}>
                    {ROADMAP.map((r, i) => (
                        <Cd key={r.phase} glass style={{ padding: 16, marginBottom: 10, borderColor: i === 0 ? "rgba(0,240,160,.25)" : "var(--bd)" }}>
                            <Rw style={{ justifyContent: "space-between", marginBottom: 8 }}>
                                <Bdg color={i === 0 ? "jade" : "amb"}>{r.phase}</Bdg>
                                <M size={14} color={i === 0 ? "var(--jade)" : "var(--tx)"} style={{ fontFamily: "var(--disp)", fontWeight: 800 }}>{r.title}</M>
                            </Rw>
                            {r.items.map(item => (
                                <Rw key={item} style={{ padding: "4px 0", gap: 8 }}>
                                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: i === 0 ? "var(--jade)" : "var(--bd2)", flexShrink: 0, marginTop: 4 }} />
                                    <M size={11} color="var(--tx2)">{item}</M>
                                </Rw>
                            ))}
                        </Cd>
                    ))}

                    <Cd glass accent style={{ padding: 20, textAlign: "center" }}>
                        <div style={{ fontSize: 32, marginBottom: 10 }}>🚀</div>
                        <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 18, color: "var(--jade)", marginBottom: 6 }}>Join the GreenOrb Network</div>
                        <M size={12} color="var(--tx2)" style={{ display: "block", lineHeight: 1.8 }}>
                            Upload ESG reports. Run the discovery agents. Earn $GORB tokens. Help build the world's most comprehensive open carbon intelligence database.
                        </M>
                    </Cd>
                </div>
            )}
        </div>
    );
}
