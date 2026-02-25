import React from "react";
import { M } from "./primitives";

const TABS = [
    { id: "globe", icon: "🌍", label: "Globe" },
    { id: "companies", icon: "🏢", label: "ESG DB" },
    { id: "compare", icon: "⚖️", label: "Compare" },
    { id: "scan", icon: "📄", label: "Scan" },
    { id: "agent", icon: "🤖", label: "Agents" },
    { id: "token", icon: "🪙", label: "Token" },
    { id: "about", icon: "💡", label: "About" },
];

export default function BottomNav({ active, set }) {
    return (
        <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0,
            maxWidth: 560, margin: "0 auto", zIndex: 300,
            background: "var(--glass)", backdropFilter: "blur(24px) saturate(1.3)",
            borderTop: "1px solid var(--glass-bd)", display: "flex",
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
                            gap: 2, border: "none", background: "transparent",
                            cursor: "pointer", padding: "5px 2px", minHeight: 48,
                            position: "relative", transition: "all .2s",
                        }}
                    >
                        <span style={{
                            fontSize: 16,
                            filter: on ? "none" : "grayscale(80%) opacity(.3)",
                            transition: "all .25s",
                            transform: on ? "scale(1.12)" : "scale(1)",
                        }}>
                            {t.icon}
                        </span>
                        <M size={8} color={on ? "var(--jade)" : "var(--tx3)"} style={{
                            letterSpacing: ".03em", transition: "all .2s",
                            fontWeight: on ? 700 : 400,
                        }}>
                            {t.label}
                        </M>
                        {on && (
                            <div style={{
                                position: "absolute", top: 0, left: "50%",
                                transform: "translateX(-50%)",
                                width: 20, height: 2,
                                background: "linear-gradient(90deg, #00f0a0, #34d8e8)",
                                borderRadius: "0 0 2px 2px",
                                boxShadow: "0 0 10px rgba(0,240,160,.5)",
                            }} />
                        )}
                    </button>
                );
            })}
        </div>
    );
}
