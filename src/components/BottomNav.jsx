import React from "react";
import { M } from "./primitives";

const TABS = [
    { id: "globe", icon: "🌍", label: "Globe" },
    { id: "companies", icon: "🏢", label: "ESG DB" },
    { id: "compare", icon: "⚖", label: "Compare" },
    { id: "scan", icon: "📄", label: "Scan" },
    { id: "agent", icon: "🤖", label: "Agent" },
    { id: "token", icon: "🪙", label: "Token" },
];

export default function BottomNav({ active, set }) {
    return (
        <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0,
            maxWidth: 430, margin: "0 auto", zIndex: 300,
            background: "rgba(0,0,0,0.97)", backdropFilter: "blur(20px)",
            borderTop: "1px solid var(--bd)", display: "flex",
            paddingBottom: "var(--safe)",
            height: `calc(var(--nav) + var(--safe))`,
        }}>
            {TABS.map(t => {
                const on = active === t.id;
                return (
                    <button
                        key={t.id}
                        onClick={() => set(t.id)}
                        style={{
                            flex: 1, display: "flex", flexDirection: "column",
                            alignItems: "center", justifyContent: "center",
                            gap: 3, border: "none", background: "transparent",
                            cursor: "pointer", padding: "6px 2px", minHeight: 48,
                            position: "relative",
                        }}
                    >
                        <span style={{ fontSize: 17, filter: on ? "none" : "grayscale(80%) opacity(.35)", transition: "all .2s" }}>
                            {t.icon}
                        </span>
                        <M size={9} color={on ? "var(--jade)" : "var(--tx3)"} style={{ letterSpacing: ".04em", transition: "all .2s", fontWeight: on ? 500 : 400 }}>
                            {t.label}
                        </M>
                        {on && (
                            <div style={{
                                position: "absolute", top: 0, left: "50%",
                                transform: "translateX(-50%)",
                                width: 22, height: 2, background: "var(--jade)",
                                borderRadius: "0 0 2px 2px", boxShadow: "0 0 8px var(--jade)",
                            }} />
                        )}
                    </button>
                );
            })}
        </div>
    );
}
