import React from "react";
import { Rw, Dot, M } from "./primitives";

const T = {
    globe: "NASA GIBS Globe",
    audit: "Deep AI Audit",
    compare: "LCA Comparison",
    trust: "Agent Observability",
    indore: "Indore Smart City",
    insights: "Company Insights",
};

export default function TopBar({ tab }) {
    return (
        <div style={{
            position: "sticky", top: 0, zIndex: 300,
            background: "var(--bg)",
            borderBottom: "1px solid var(--bd)", height: 64,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 20px", flexShrink: 0,
        }}>
            <Rw>
                <div style={{
                    width: 34, height: 34, borderRadius: "var(--radius-pill)",
                    background: "var(--primary)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, color: "var(--bg)", fontWeight: 700,
                }}>◎</div>
                <div>
                    <div style={{
                        fontFamily: "var(--disp)", fontWeight: 700, fontSize: 17,
                        color: "var(--ink)",
                    }}>GreenOrb</div>
                    <M size={12} color="var(--muted)">{T[tab]}</M>
                </div>
            </Rw>
            <Rw style={{ gap: 8 }}>
                <div style={{
                    padding: "6px 12px", borderRadius: "var(--radius-pill)",
                    background: "var(--sf2)",
                    display: "flex", alignItems: "center", gap: 6,
                }}>
                    <Dot pulse size={6} color="var(--primary)" />
                    <M size={12} color="var(--ink)" style={{ fontWeight: 600 }}>Live Data</M>
                </div>
            </Rw>
        </div>
    );
}
