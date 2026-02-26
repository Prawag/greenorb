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
            maxWidth: 1100, margin: "0 auto", zIndex: 300,
            background: "rgba(255,255,255,.9)", backdropFilter: "blur(16px)",
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
                        }}
                    >
                        <span style={{
                            fontSize: 17,
                            filter: on ? "none" : "grayscale(60%) opacity(.5)",
                            transition: "all .2s",
                            transform: on ? "scale(1.1)" : "scale(1)",
                        }}>
                            {t.icon}
                        </span>
                        <M size={9} color={on ? "var(--jade)" : "var(--tx3)"} style={{
                            transition: "all .2s", fontWeight: on ? 600 : 400,
                        }}>
                            {t.label}
                        </M>
                        {on && (
                            <div style={{
                                position: "absolute", top: 0, left: "50%",
                                transform: "translateX(-50%)",
                                width: 24, height: 2,
                                background: "var(--jade)",
                                borderRadius: "0 0 2px 2px",
                            }} />
                        )}
                    </button>
                );
            })}
        </div>
    );
}
