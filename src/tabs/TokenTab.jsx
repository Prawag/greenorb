import React, { useState } from "react";
import { M, Bdg, Cd, Rw, PBar, SHd } from "../components/primitives";

const TOKEN_INFO = {
    name: "GreenOrb Token",
    symbol: "$GORB",
    network: "Hedera Hashgraph",
    totalSupply: "1,000,000,000",
    decimals: 8,
    standard: "HTS (Hedera Token Service)",
};

const DISTRIBUTION = [
    { label: "Community Rewards", pct: 40, amount: "400M", color: "var(--jade)", desc: "Earned via Proof-of-Green mining" },
    { label: "Treasury/DAO", pct: 20, amount: "200M", color: "var(--cyan)", desc: "12mo cliff, 36mo linear vest" },
    { label: "Dev Team", pct: 15, amount: "150M", color: "var(--pur)", desc: "12mo cliff, 24mo linear vest" },
    { label: "Liquidity", pct: 10, amount: "100M", color: "var(--blu)", desc: "50% at launch, 50% over 12mo" },
    { label: "Ecosystem", pct: 10, amount: "100M", color: "var(--amb)", desc: "Milestone-based release" },
    { label: "Advisors", pct: 5, amount: "50M", color: "var(--tx3)", desc: "6mo cliff, 18mo linear vest" },
];

const MINING_ACTIONS = [
    { icon: "📄", action: "Upload ESG Report", reward: 50, dailyCap: 500, cooldown: "30s" },
    { icon: "🤖", action: "Agent Discovery", reward: 10, dailyCap: 1000, cooldown: "5s" },
    { icon: "✓", action: "Verify Data", reward: 25, dailyCap: 250, cooldown: "60s" },
    { icon: "🔥", action: "Daily Streak", reward: 5, dailyCap: 5, cooldown: "24h" },
    { icon: "👥", action: "Referral", reward: 100, dailyCap: 200, cooldown: "1h" },
    { icon: "📊", action: "Product Footprint", reward: 30, dailyCap: 300, cooldown: "30s" },
];

const STAKING_TIERS = [
    { name: "Seedling", days: 30, apy: 5, color: "var(--jade)" },
    { name: "Sapling", days: 90, apy: 12, color: "var(--cyan)" },
    { name: "Redwood", days: 365, apy: 20, color: "var(--amb)" },
];

export default function TokenTab() {
    const [view, setView] = useState("overview");
    const [walletConnected, setWalletConnected] = useState(false);
    const [selectedTier, setSelectedTier] = useState(null);

    // Simulated wallet state (would be real on-chain data)
    const [mockBalance] = useState(0);
    const [mockStaked] = useState(0);
    const [mockEarned] = useState(0);

    return (
        <div style={{ padding: "16px 14px" }}>
            <SHd tag="$GORB on Hedera Hashgraph" title="GreenOrb Token" sub="Proof-of-Green mining — earn $GORB by contributing ESG data to the network" />

            {/* Wallet Connection */}
            <Cd accent style={{ padding: 16, marginBottom: 14 }}>
                {!walletConnected ? (
                    <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 36, marginBottom: 12 }}>🔗</div>
                        <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 18, color: "var(--tx)", marginBottom: 6 }}>Connect Wallet</div>
                        <M size={12} color="var(--tx3)" style={{ display: "block", marginBottom: 16 }}>Connect your Hedera wallet to view balance, stake, and earn $GORB rewards</M>
                        <button
                            onClick={() => setWalletConnected(true)}
                            style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: "var(--jade)", color: "#000", fontFamily: "var(--disp)", fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: "0 0 20px rgba(0,232,122,.3)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                        >
                            <span>🏦</span> Connect HashPack Wallet
                        </button>
                        <M size={10} color="var(--tx3)" style={{ display: "block", marginTop: 8 }}>Supports HashPack, Blade, and MetaMask (Hedera EVM)</M>
                    </div>
                ) : (
                    <div>
                        <Rw style={{ justifyContent: "space-between", marginBottom: 12 }}>
                            <Rw style={{ gap: 8 }}>
                                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--jade)", boxShadow: "0 0 8px var(--jade)" }} />
                                <M size={11} color="var(--jade)">Connected</M>
                            </Rw>
                            <Bdg color="jade">Hedera Testnet</Bdg>
                        </Rw>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                            {[
                                { l: "Balance", v: `${mockBalance.toLocaleString()}`, c: "var(--jade)" },
                                { l: "Staked", v: `${mockStaked.toLocaleString()}`, c: "var(--cyan)" },
                                { l: "Earned", v: `${mockEarned.toLocaleString()}`, c: "var(--amb)" },
                            ].map(s => (
                                <div key={s.l} style={{ padding: "10px 8px", background: "var(--bg3)", borderRadius: 10, border: "1px solid var(--bd)", textAlign: "center" }}>
                                    <div style={{ fontFamily: "var(--mono)", fontSize: 16, color: s.c, fontWeight: 500 }}>{s.v}</div>
                                    <M size={9} color="var(--tx3)">{s.l}</M>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </Cd>

            {/* View Toggle */}
            <div style={{ display: "flex", gap: 4, marginBottom: 14, overflowX: "auto" }}>
                {[
                    { k: "overview", l: "📋 Overview" },
                    { k: "mining", l: "⛏ Mining" },
                    { k: "staking", l: "🔒 Staking" },
                    { k: "burn", l: "🔥 Burn" },
                ].map(v => (
                    <button key={v.k} onClick={() => setView(v.k)} style={{
                        flex: 1, padding: "9px 6px", background: view === v.k ? "var(--jg)" : "transparent",
                        border: `1px solid ${view === v.k ? "rgba(0,232,122,.3)" : "var(--bd)"}`,
                        borderRadius: 8, color: view === v.k ? "var(--jade)" : "var(--tx3)",
                        fontFamily: "var(--disp)", fontWeight: 700, fontSize: 11, cursor: "pointer",
                        whiteSpace: "nowrap", flexShrink: 0,
                    }}>
                        {v.l}
                    </button>
                ))}
            </div>

            {/* OVERVIEW VIEW */}
            {view === "overview" && (
                <div style={{ animation: "fadeUp .3s ease" }}>
                    {/* Token Info */}
                    <Cd style={{ padding: 14, marginBottom: 12 }}>
                        <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Token Info</div>
                        {Object.entries(TOKEN_INFO).map(([k, v]) => (
                            <Rw key={k} style={{ justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--bg3)" }}>
                                <M size={11} color="var(--tx3)" style={{ textTransform: "capitalize" }}>{k.replace(/([A-Z])/g, ' $1')}</M>
                                <M size={11} color="var(--jade)" style={{ fontWeight: 600 }}>{v}</M>
                            </Rw>
                        ))}
                    </Cd>

                    {/* Distribution */}
                    <Cd style={{ padding: 14, marginBottom: 12 }}>
                        <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Token Distribution</div>
                        {/* Visual bar */}
                        <div style={{ display: "flex", height: 24, borderRadius: 12, overflow: "hidden", marginBottom: 14, border: "1px solid var(--bd)" }}>
                            {DISTRIBUTION.map(d => (
                                <div key={d.label} style={{ width: `${d.pct}%`, background: d.color, transition: "width .5s", position: "relative" }}
                                    title={`${d.label}: ${d.pct}%`}>
                                    {d.pct >= 10 && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#000" }}>{d.pct}%</span>}
                                </div>
                            ))}
                        </div>
                        {DISTRIBUTION.map(d => (
                            <Rw key={d.label} style={{ padding: "6px 0", borderBottom: "1px solid var(--bg3)", gap: 10 }}>
                                <div style={{ width: 10, height: 10, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <Rw style={{ justifyContent: "space-between" }}>
                                        <M size={12} color="var(--tx)" style={{ fontWeight: 600 }}>{d.label}</M>
                                        <M size={11} color={d.color}>{d.amount} ({d.pct}%)</M>
                                    </Rw>
                                    <M size={10} color="var(--tx3)">{d.desc}</M>
                                </div>
                            </Rw>
                        ))}
                    </Cd>

                    {/* Smart Contracts */}
                    <Cd style={{ padding: 14, marginBottom: 12 }}>
                        <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Smart Contracts</div>
                        <M size={10} color="var(--tx3)" style={{ display: "block", marginBottom: 10 }}>Solidity on Hedera EVM · OpenZeppelin-based · Multi-sig secured</M>
                        {[
                            { name: "GreenOrbToken.sol", desc: "ERC-20 HTS wrapper, mint/burn roles", color: "var(--jade)" },
                            { name: "RewardEngine.sol", desc: "Proof-of-Green with halving & caps", color: "var(--cyan)" },
                            { name: "Staking.sol", desc: "3-tier lock with APY + governance", color: "var(--pur)" },
                            { name: "BurnMechanism.sol", desc: "1% deflationary burn on swaps", color: "var(--red)" },
                        ].map(c => (
                            <Rw key={c.name} style={{ padding: "8px 0", borderBottom: "1px solid var(--bg3)", gap: 10 }}>
                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0, marginTop: 4 }} />
                                <div>
                                    <M size={12} color="var(--tx)" style={{ fontWeight: 700, fontFamily: "var(--mono)" }}>{c.name}</M>
                                    <M size={10} color="var(--tx3)" style={{ display: "block" }}>{c.desc}</M>
                                </div>
                            </Rw>
                        ))}
                    </Cd>

                    {/* Security */}
                    <Cd style={{ padding: 14, borderColor: "rgba(255,77,77,.2)", background: "rgba(255,77,77,.02)" }}>
                        <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 14, color: "var(--red)", marginBottom: 10 }}>🔒 Security Model</div>
                        {[
                            ["Smart Contract", "OpenZeppelin, reentrancy guards, role-based access"],
                            ["Rate Limiting", "Daily caps per wallet, anti-sybil cooldowns"],
                            ["Oracle", "3-of-5 validator nodes for contribution proofs"],
                            ["Treasury", "Multi-sig (3-of-5), no single admin key"],
                            ["Audit", "Pre-launch audit by Hedera-approved auditor"],
                        ].map(([k, v]) => (
                            <Rw key={k} style={{ padding: "5px 0", borderBottom: "1px solid var(--bg3)", gap: 8 }}>
                                <M size={11} color="var(--tx)" style={{ fontWeight: 700, flexShrink: 0, width: 90 }}>{k}</M>
                                <M size={10} color="var(--tx3)">{v}</M>
                            </Rw>
                        ))}
                    </Cd>
                </div>
            )}

            {/* MINING VIEW */}
            {view === "mining" && (
                <div style={{ animation: "fadeUp .3s ease" }}>
                    <Cd accent style={{ padding: 16, marginBottom: 14, textAlign: "center" }}>
                        <M size={10} color="var(--jade)" style={{ display: "block", marginBottom: 4, letterSpacing: ".1em", textTransform: "uppercase" }}>Proof-of-Green Mining</M>
                        <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 22, color: "var(--tx)", marginBottom: 6 }}>Earn $GORB by Contributing</div>
                        <M size={12} color="var(--tx3)">Upload ESG reports, run the discovery agent, verify data — every action mines $GORB tokens</M>
                    </Cd>

                    {/* Halving info */}
                    <Cd style={{ padding: 14, marginBottom: 12 }}>
                        <Rw style={{ justifyContent: "space-between", marginBottom: 8 }}>
                            <M size={12} color="var(--tx)" style={{ fontWeight: 700 }}>⏳ Halving Schedule</M>
                            <Bdg color="jade">Current: 1x</Bdg>
                        </Rw>
                        <M size={10} color="var(--tx3)" style={{ display: "block", marginBottom: 10 }}>Rewards halve every 180 days for 3 years, then stabilize at 1.56% of original rate</M>
                        <div style={{ display: "flex", gap: 4 }}>
                            {["1x", "0.5x", "0.25x", "12.5%", "6.25%", "3.12%", "1.56%"].map((h, i) => (
                                <div key={i} style={{
                                    flex: 1, padding: "6px 2px", borderRadius: 6, textAlign: "center",
                                    background: i === 0 ? "var(--jg)" : "var(--bg3)",
                                    border: `1px solid ${i === 0 ? "rgba(0,232,122,.3)" : "var(--bd)"}`,
                                }}>
                                    <M size={9} color={i === 0 ? "var(--jade)" : "var(--tx3)"}>{h}</M>
                                </div>
                            ))}
                        </div>
                    </Cd>

                    {/* Mining actions */}
                    {MINING_ACTIONS.map(a => (
                        <Cd key={a.action} style={{ padding: 14, marginBottom: 8 }}>
                            <Rw style={{ gap: 12 }}>
                                <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--jg)", border: "1px solid rgba(0,232,122,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{a.icon}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <Rw style={{ justifyContent: "space-between", marginBottom: 3 }}>
                                        <M size={13} color="var(--tx)" style={{ fontWeight: 700 }}>{a.action}</M>
                                        <M size={14} color="var(--jade)" style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>+{a.reward}</M>
                                    </Rw>
                                    <Rw style={{ gap: 8 }}>
                                        <Bdg color="cyan">Cap: {a.dailyCap}/day</Bdg>
                                        <Bdg color="amb">Cooldown: {a.cooldown}</Bdg>
                                    </Rw>
                                </div>
                            </Rw>
                        </Cd>
                    ))}
                </div>
            )}

            {/* STAKING VIEW */}
            {view === "staking" && (
                <div style={{ animation: "fadeUp .3s ease" }}>
                    <Cd accent style={{ padding: 16, marginBottom: 14, textAlign: "center" }}>
                        <M size={10} color="var(--cyan)" style={{ display: "block", marginBottom: 4, letterSpacing: ".1em" }}>STAKE $GORB</M>
                        <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 22, color: "var(--tx)", marginBottom: 6 }}>Lock & Earn APY</div>
                        <M size={12} color="var(--tx3)">Stake GORB tokens to earn APY rewards and governance voting power. 1 staked GORB = 1 vote.</M>
                    </Cd>

                    {/* Staking tiers */}
                    {STAKING_TIERS.map((tier, i) => (
                        <Cd key={tier.name} style={{
                            padding: 16, marginBottom: 10,
                            borderColor: selectedTier === i ? tier.color : "var(--bd)",
                            background: selectedTier === i ? `${tier.color}08` : "var(--sf)",
                            cursor: "pointer", transition: "all .2s",
                        }} onClick={() => setSelectedTier(selectedTier === i ? null : i)}>
                            <Rw style={{ justifyContent: "space-between", marginBottom: 10 }}>
                                <div>
                                    <M size={14} color="var(--tx)" style={{ fontWeight: 800, fontFamily: "var(--disp)" }}>{tier.name}</M>
                                    <M size={11} color="var(--tx3)" style={{ display: "block" }}>Lock for {tier.days} days</M>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <div style={{ fontFamily: "var(--mono)", fontSize: 28, color: tier.color, fontWeight: 600, lineHeight: 1 }}>{tier.apy}%</div>
                                    <M size={10} color="var(--tx3)">APY</M>
                                </div>
                            </Rw>
                            {selectedTier === i && (
                                <div style={{ animation: "fadeUp .2s ease" }}>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                                        <div style={{ padding: "10px", background: "var(--bg3)", borderRadius: 10, border: "1px solid var(--bd)" }}>
                                            <M size={9} color="var(--tx3)" style={{ display: "block", marginBottom: 3 }}>Min Stake</M>
                                            <M size={12} color={tier.color} style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>100 GORB</M>
                                        </div>
                                        <div style={{ padding: "10px", background: "var(--bg3)", borderRadius: 10, border: "1px solid var(--bd)" }}>
                                            <M size={9} color="var(--tx3)" style={{ display: "block", marginBottom: 3 }}>Early Unstake</M>
                                            <M size={12} color="var(--red)" style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>10% penalty</M>
                                        </div>
                                    </div>
                                    {walletConnected ? (
                                        <button style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: tier.color, color: "#000", fontFamily: "var(--disp)", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                                            🔒 Stake in {tier.name} Tier
                                        </button>
                                    ) : (
                                        <M size={11} color="var(--tx3)" style={{ display: "block", textAlign: "center", padding: 8 }}>Connect wallet to stake</M>
                                    )}
                                </div>
                            )}
                        </Cd>
                    ))}

                    {/* Governance */}
                    <Cd style={{ padding: 14, borderColor: "rgba(167,139,250,.2)", background: "rgba(167,139,250,.02)" }}>
                        <M size={10} color="var(--pur)" style={{ display: "block", marginBottom: 8, letterSpacing: ".08em", textTransform: "uppercase" }}>🏛 Governance</M>
                        <M size={12} color="var(--tx)" style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>1 Staked GORB = 1 Vote</M>
                        <M size={11} color="var(--tx3)" style={{ display: "block", lineHeight: 1.7 }}>
                            Staked GORB holders can vote on protocol proposals: reward rates, burn percentages, new features, ecosystem grants. Proposals require 1M GORB minimum to submit.
                        </M>
                    </Cd>
                </div>
            )}

            {/* BURN VIEW */}
            {view === "burn" && (
                <div style={{ animation: "fadeUp .3s ease" }}>
                    <Cd accent style={{ padding: 16, marginBottom: 14, textAlign: "center" }}>
                        <M size={10} color="var(--red)" style={{ display: "block", marginBottom: 4, letterSpacing: ".1em" }}>DEFLATIONARY</M>
                        <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 22, color: "var(--tx)", marginBottom: 6 }}>🔥 Burn Mechanism</div>
                        <M size={12} color="var(--tx3)">1% of every swap is permanently burned, reducing total supply over time</M>
                    </Cd>

                    {/* Burn stats (simulated) */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                        {[
                            { l: "Burn Rate", v: "1.0%", c: "var(--red)" },
                            { l: "Total Burned", v: "0 GORB", c: "var(--amb)" },
                            { l: "Swap Volume", v: "0 GORB", c: "var(--cyan)" },
                            { l: "Swap Count", v: "0", c: "var(--tx2)" },
                        ].map(s => (
                            <Cd key={s.l} style={{ padding: "12px 10px", textAlign: "center" }}>
                                <div style={{ fontFamily: "var(--mono)", fontSize: 18, color: s.c, fontWeight: 500 }}>{s.v}</div>
                                <M size={9} color="var(--tx3)">{s.l}</M>
                            </Cd>
                        ))}
                    </div>

                    {/* Milestones */}
                    <Cd style={{ padding: 14, marginBottom: 12 }}>
                        <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 14, marginBottom: 10 }}>🏆 Burn Milestones</div>
                        {[
                            { target: "1M GORB", pct: 0 },
                            { target: "10M GORB", pct: 0 },
                            { target: "50M GORB", pct: 0 },
                            { target: "100M GORB", pct: 0 },
                        ].map(m => (
                            <div key={m.target} style={{ padding: "8px 0", borderBottom: "1px solid var(--bg3)" }}>
                                <Rw style={{ justifyContent: "space-between", marginBottom: 4 }}>
                                    <M size={12} color="var(--tx)" style={{ fontWeight: 600 }}>{m.target}</M>
                                    <Bdg color={m.pct >= 100 ? "jade" : "amb"}>{m.pct >= 100 ? "REACHED" : `${m.pct}%`}</Bdg>
                                </Rw>
                                <PBar v={m.pct} h={4} color="var(--red)" />
                            </div>
                        ))}
                    </Cd>

                    {/* How burn works */}
                    <Cd style={{ padding: 14 }}>
                        <M size={10} color="var(--red)" style={{ display: "block", marginBottom: 8, letterSpacing: ".08em", textTransform: "uppercase" }}>How it works</M>
                        {[
                            ["🔄", "Swap", "User swaps $GORB on DEX (SaucerSwap on Hedera)"],
                            ["📉", "Burn", "1% of swap amount is permanently burned"],
                            ["📊", "Supply ↓", "Circulating supply decreases every swap"],
                            ["💎", "Value ↑", "Reduced supply creates deflationary pressure"],
                        ].map(([ic, lb, desc]) => (
                            <Rw key={lb} style={{ padding: "6px 0", borderBottom: "1px solid var(--bg3)", gap: 10 }}>
                                <span style={{ fontSize: 16, flexShrink: 0 }}>{ic}</span>
                                <div>
                                    <M size={11} color="var(--tx)" style={{ fontWeight: 700 }}>{lb}</M>
                                    <M size={10} color="var(--tx3)" style={{ display: "block" }}>{desc}</M>
                                </div>
                            </Rw>
                        ))}
                        <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--bg3)", borderRadius: 10, border: "1px solid var(--bd)" }}>
                            <M size={10} color="var(--tx3)">Burn rate adjustable: <span style={{ color: "var(--jade)" }}>0.1% min</span> — <span style={{ color: "var(--red)" }}>5% max</span> (admin governance vote)</M>
                        </div>
                    </Cd>
                </div>
            )}
        </div>
    );
}
