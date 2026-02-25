import React, { useState } from "react";
import { PRODUCTS } from "../data/products";
import { M, Bdg, Cd, Rw, PBar, SHd } from "../components/primitives";

export default function CompareTab() {
    const brands = [...new Set(PRODUCTS.map(p => p[2]))];
    const cats = [...new Set(PRODUCTS.map(p => p[1]))];

    const [cat, setCat] = useState("Smartphone");
    const [selA, setSelA] = useState(0);
    const [selB, setSelB] = useState(1);

    const inCat = PRODUCTS.filter(p => p[1] === cat);
    const maxCO2 = Math.max(...inCat.map(p => parseFloat(p[3])));
    const A = inCat[selA] || inCat[0];
    const B = inCat[selB] || inCat[Math.min(1, inCat.length - 1)];

    return (
        <div style={{ padding: "16px 14px" }}>
            <SHd tag="product carbon comparison" title="Compare Carbon Footprints" sub="Real LCA data with full calculation methodology and sources" />

            <div style={{ display: "flex", gap: 7, overflowX: "auto", marginBottom: 16, paddingBottom: 4 }}>
                {cats.map(c => (
                    <button key={c} onClick={() => { setCat(c); setSelA(0); setSelB(Math.min(1, PRODUCTS.filter(p => p[1] === c).length - 1)); }}
                        style={{ whiteSpace: "nowrap", padding: "7px 14px", borderRadius: 20, border: `1px solid ${cat === c ? "rgba(0,232,122,.4)" : "var(--bd2)"}`, background: cat === c ? "var(--jg)" : "var(--sf)", color: cat === c ? "var(--jade)" : "var(--tx2)", fontFamily: "var(--body)", fontSize: 12, cursor: "pointer", minHeight: 36 }}>{c}</button>
                ))}
            </div>

            <Cd style={{ padding: 16, marginBottom: 14 }}>
                <M size={10} color="var(--jade)" style={{ display: "block", marginBottom: 12, letterSpacing: ".08em", textTransform: "uppercase" }}>All {cat}s Ranked</M>
                {[...inCat].sort((a, b) => parseFloat(a[3]) - parseFloat(b[3])).map(p => {
                    const co2 = parseFloat(p[3]);
                    const pct = (co2 / maxCO2) * 100;
                    const color = pct < 35 ? "var(--jade)" : pct < 65 ? "var(--cyan)" : pct < 85 ? "var(--amb)" : "var(--red)";
                    return (
                        <div key={p[0]} style={{ marginBottom: 10 }}>
                            <Rw style={{ justifyContent: "space-between", marginBottom: 4 }}>
                                <Rw style={{ gap: 8 }}>
                                    <M size={11} color="var(--tx2)">{p[0]}</M>
                                    <Bdg color="blu" style={{ fontSize: 9 }}>{p[2]}</Bdg>
                                </Rw>
                                <M size={11} color={color} style={{ fontWeight: 500 }}>{co2.toLocaleString()} kg</M>
                            </Rw>
                            <PBar v={pct} color={color} h={6} animate />
                            <M size={9} color="var(--tx3)" style={{ display: "block", marginTop: 2 }}>Source: {p[6]}</M>
                        </div>
                    );
                })}
                <div style={{ marginTop: 12, padding: "8px 10px", background: "var(--bg3)", borderRadius: 8, border: "1px solid var(--bd)" }}>
                    <M size={9} color="var(--tx3)">Unit: kgCO₂e {inCat[0]?.[4] || ""} · LCA methodology</M>
                </div>
            </Cd>

            <M size={10} color="var(--jade)" style={{ display: "block", marginBottom: 10, letterSpacing: ".08em", textTransform: "uppercase" }}>Head-to-Head Comparison</M>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                {[["A", selA, setSelA], ["B", selB, setSelB]].map(([side, selVal, setSel]) => (
                    <div key={side}>
                        <M size={9} color="var(--tx3)" style={{ display: "block", marginBottom: 5 }}>Product {side}</M>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            {inCat.map((p, i) => (
                                <button key={p[0]} onClick={() => setSel(i)} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${selVal === i ? "rgba(0,232,122,.35)" : "var(--bd)"}`, background: selVal === i ? "var(--jg)" : "var(--sf)", color: selVal === i ? "var(--jade)" : "var(--tx2)", fontFamily: "var(--body)", fontSize: 11, cursor: "pointer", textAlign: "left", transition: "all .15s" }}>{p[0]}</button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {A && B && (
                <div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                        {[A, B].map((p, pi) => {
                            const co2 = parseFloat(p[3]);
                            const otherCo2 = parseFloat(pi === 0 ? B[3] : A[3]);
                            const isWinner = co2 <= otherCo2;
                            return (
                                <Cd key={p[0]} accent={isWinner} style={{ padding: 14 }}>
                                    {isWinner && <Bdg color="jade" style={{ fontSize: 9, marginBottom: 8, display: "block" }}>✓ LOWER</Bdg>}
                                    <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 14, color: "var(--tx)", marginBottom: 4 }}>{p[0]}</div>
                                    <Bdg color="blu" style={{ marginBottom: 10 }}>{p[2]}</Bdg>
                                    <div style={{ fontFamily: "var(--mono)", fontSize: 22, color: isWinner ? "var(--jade)" : "var(--amb)", fontWeight: 500, marginBottom: 4, marginTop: 8 }}>{co2.toLocaleString()}</div>
                                    <M size={10} color="var(--tx3)">kgCO₂e {p[4]}</M>
                                    <div style={{ marginTop: 12 }}>
                                        {[["🏭 Mfg", p[8].mfg, "jade"], ["✈ Trans", p[8].trans, "cyan"], ["💡 Use", p[8].use, "amb"], ["♻ EoL", p[8].eol, "red"]].map(([l, v, col]) => (
                                            <div key={l} style={{ marginBottom: 5 }}>
                                                <Rw style={{ justifyContent: "space-between", marginBottom: 2 }}>
                                                    <M size={9} color="var(--tx3)">{l}</M>
                                                    <M size={9} color={`var(--${col})`}>{v}%</M>
                                                </Rw>
                                                <PBar v={v} color={`var(--${col})`} h={3} />
                                            </div>
                                        ))}
                                    </div>
                                    <a href={p[7]} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 10, fontSize: 10, color: "var(--jd)", textDecoration: "underline", wordBreak: "break-all" }}>{p[6]}</a>
                                </Cd>
                            );
                        })}
                    </div>

                    <Cd style={{ padding: 14, marginBottom: 14 }}>
                        <M size={10} color="var(--jade)" style={{ display: "block", marginBottom: 8, letterSpacing: ".08em", textTransform: "uppercase" }}>📐 LCA Methodology — {A[0]}</M>
                        <p style={{ fontSize: 12, color: "var(--tx2)", lineHeight: 1.75 }}>{A[9]}</p>
                    </Cd>
                    <Cd style={{ padding: 14 }}>
                        <M size={10} color="var(--jade)" style={{ display: "block", marginBottom: 8, letterSpacing: ".08em", textTransform: "uppercase" }}>📐 LCA Methodology — {B[0]}</M>
                        <p style={{ fontSize: 12, color: "var(--tx2)", lineHeight: 1.75 }}>{B[9]}</p>
                    </Cd>
                </div>
            )}
        </div>
    );
}
