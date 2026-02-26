import React from "react";
import { Rw, Dot, M } from "./primitives";

const T = {
    globe: "Carbon Globe",
    companies: "ESG Database",
    compare: "Compare Products",
    scan: "AI Analyzer",
    agent: "Agent HQ",
    token: "$GORB Token",
    about: "About",
};

export default function TopBar({ tab }) {
    return (
        <div style={{
            position: "sticky", top: 0, zIndex: 300,
            background: "rgba(255,255,255,.85)", backdropFilter: "blur(16px)",
            borderBottom: "1px solid var(--bd)", height: 56,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 20px", flexShrink: 0,
        }}>
            <Rw>
                <div style={{
                    width: 34, height: 34, borderRadius: 10,
                    background: "var(--jade)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, color: "#fff", fontWeight: 700,
                    boxShadow: "0 2px 8px rgba(16,185,129,.25)",
                }}>◎</div>
                <div>
                    <div style={{
                        fontFamily: "var(--disp)", fontWeight: 700, fontSize: 17,
                        letterSpacing: "-.02em", lineHeight: 1, color: "var(--tx)",
                    }}>GreenOrb</div>
                    <M size={11} color="var(--tx3)">{T[tab]}</M>
                </div>
            </Rw>
            <Rw style={{ gap: 8 }}>
                <div style={{
                    padding: "5px 10px", borderRadius: 20,
                    background: "var(--jg)", border: "1px solid rgba(16,185,129,.15)",
                    display: "flex", alignItems: "center", gap: 6,
                }}>
                    <Dot pulse size={5} />
                    <M size={11} color="var(--jade)" style={{ fontWeight: 600 }}>Live</M>
                </div>
            </Rw>
        </div>
    );
}
