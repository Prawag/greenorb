import React from "react";
import { Rw, Dot, M } from "./primitives";

const T = { globe: "Carbon Globe", companies: "ESG Database", compare: "Carbon Compare", scan: "AI Analyzer", agent: "ESG Agent" };

export default function TopBar({ tab }) {
    return (
        <div style={{
            position: "sticky", top: 0, zIndex: 300,
            background: "rgba(0,0,0,0.95)", backdropFilter: "blur(20px)",
            borderBottom: "1px solid var(--bd)", height: 52,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 16px", flexShrink: 0,
        }}>
            <Rw>
                <div style={{
                    width: 30, height: 30, borderRadius: 8,
                    background: "linear-gradient(135deg,#00e87a,#00a854)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, animation: "glow 3s infinite",
                }}>◎</div>
                <div>
                    <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 15, letterSpacing: "-.02em", lineHeight: 1 }}>GreenOrb</div>
                    <M size={9} color="var(--jd)">{T[tab]}</M>
                </div>
            </Rw>
            <Rw style={{ gap: 6 }}>
                <Dot pulse size={6} />
                <M size={10} color="var(--jade)">Gemini · LIVE</M>
            </Rw>
        </div>
    );
}
