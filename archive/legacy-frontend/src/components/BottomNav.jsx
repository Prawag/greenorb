import React from "react";
import { M } from "./primitives";

const TABS = [
    { id: "globe", icon: "GL", label: "Globe" },
    { id: "audit", icon: "AU", label: "Audit" },
    { id: "intel", icon: "IN", label: "Intel" },
    { id: "agent", icon: "AI", label: "Agents" },
    { id: "esg", icon: "DT", label: "ESG Data" },
    { id: "facilities", icon: "FA", label: "Facilities" },
    { id: "compare", icon: "VS", label: "Compare" },
    { id: "trust", icon: "TR", label: "Trust UI" },
    { id: "indore", icon: "SC", label: "Smart City" },
    { id: "insights", icon: "AN", label: "Insights" },
];

export default function BottomNav({ active, set }) {
    return (
        <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0,
            maxWidth: 1100, margin: "0 auto", zIndex: 300,
            background: "var(--bg)",
            borderTop: "1px solid var(--bd)", display: "flex",
            paddingBottom: "var(--safe)",
            height: `calc(var(--nav) + var(--safe))`,
            boxShadow: "0 -1px 4px rgba(0,0,0,.04)",
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
                            gap: 2, border: "none", background: "transparent",
                            cursor: "pointer", padding: "4px 2px", minHeight: 48,
                            position: "relative", transition: "all .2s",
                            color: on ? "var(--primary)" : "var(--muted)"
                        }}
                    >
                        <div style={{ fontSize: 13, fontFamily: "var(--mono)", fontWeight: 700, marginBottom: 4, transition: "transform .2s", transform: active === t.id ? "scale(1.1)" : "scale(1)", color: active === t.id ? "var(--primary)" : "var(--muted)" }}>
                            {t.icon}
                        </div>
                        <M size={9} color={on ? "var(--primary)" : "var(--muted)"} style={{
                            transition: "all .2s", fontWeight: on ? 600 : 400,
                        }}>
                            {t.label}
                        </M>
                        {on && (
                            <div style={{
                                position: "absolute", bottom: -2, width: 4, height: 4,
                                background: "var(--primary)",
                                borderRadius: "50%",
                            }} />
                        )}
                    </button>
                );
            })}
        </div>
    );
}
