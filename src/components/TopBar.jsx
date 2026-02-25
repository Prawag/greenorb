import React from "react";
import { Rw, Dot, M } from "./primitives";

const T = {
    globe: "Carbon Globe",
    companies: "ESG Database",
    compare: "Carbon Compare",
    scan: "AI Analyzer",
    agent: "Agent HQ",
    token: "$GORB Token",
    about: "About",
};

export default function TopBar({ tab }) {
    return (
        <div style={{
            position: "sticky", top: 0, zIndex: 300,
            background: "var(--glass)", backdropFilter: "blur(24px) saturate(1.3)",
            borderBottom: "1px solid var(--glass-bd)", height: 54,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 16px", flexShrink: 0,
        }}>
            <Rw>
                <div style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: "linear-gradient(135deg, #00f0a0, #00b878, #008858)",
                    backgroundSize: "200% 200%",
                    animation: "gradientShift 4s ease infinite, glow 3s infinite",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, color: "#040d08", fontWeight: 700,
                    boxShadow: "0 0 16px rgba(0,240,160,.25)",
                }}>◎</div>
                <div>
                    <div style={{
                        fontFamily: "var(--disp)", fontWeight: 800, fontSize: 16,
                        letterSpacing: "-.02em", lineHeight: 1,
                        background: "linear-gradient(90deg, #00f0a0, #34d8e8)",
                        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                    }}>GreenOrb</div>
                    <M size={9} color="var(--tx3)">{T[tab]}</M>
                </div>
            </Rw>
            <Rw style={{ gap: 8 }}>
                <div style={{
                    padding: "4px 10px", borderRadius: 8,
                    background: "rgba(0,240,160,.06)", border: "1px solid rgba(0,240,160,.15)",
                    display: "flex", alignItems: "center", gap: 6,
                }}>
                    <Dot pulse size={5} />
                    <M size={9} color="var(--jade)" style={{ fontWeight: 600 }}>LIVE</M>
                </div>
            </Rw>
        </div>
    );
}
