import React, { useState } from "react";
import { Rw, Dot, M } from "./primitives";

const NAV_ITEMS = [
    { key: "esg", label: "ESG Explorer" },
    { key: "compare", label: "Compare" },
    { key: "audit", label: "AI Auditor" },
    { key: "indore", label: "Smart Cities" },
];

export default function TopBar({ tab, setTab }) {
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <>
            <div style={{
                position: "sticky", top: 0, zIndex: 300,
                background: "var(--bg)",
                borderBottom: "1px solid var(--bd)", 
                height: 64,
                display: "flex", 
                alignItems: "center", 
                justifyContent: "space-between",
                padding: "0 24px", 
                flexShrink: 0,
            }}>
                {/* Brand Logo & Name */}
                <Rw style={{ gap: 12, cursor: "pointer" }} onClick={() => setTab("esg")}>
                    <div style={{
                        width: 32, height: 32, borderRadius: "var(--radius-pill)",
                        background: "var(--primary)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 16, color: "#ffffff", fontWeight: 700,
                    }}>◎</div>
                    <div>
                        <div style={{
                            fontFamily: "var(--disp)", 
                            fontWeight: 600, 
                            fontSize: 18,
                            color: "var(--ink)",
                            letterSpacing: "-0.5px"
                        }}>GreenOrb</div>
                    </div>
                </Rw>

                {/* Desktop Menu links (hidden on tablet/mobile) */}
                <div className="desktop-nav" style={{ display: "flex", gap: "24px", height: "100%", alignItems: "center" }}>
                    {NAV_ITEMS.map(item => {
                        const active = tab === item.key;
                        return (
                            <button
                                key={item.key}
                                onClick={() => setTab(item.key)}
                                style={{
                                    border: "none",
                                    background: "transparent",
                                    color: active ? "var(--ink)" : "var(--body-text)",
                                    fontFamily: "var(--body)",
                                    fontSize: "14px",
                                    fontWeight: active ? 600 : 500,
                                    cursor: "pointer",
                                    height: "100%",
                                    padding: "0 4px",
                                    position: "relative",
                                    transition: "color 0.2s"
                                }}
                            >
                                {item.label}
                                {active && (
                                    <div style={{
                                        position: "absolute",
                                        bottom: -1,
                                        left: 0,
                                        right: 0,
                                        height: 2,
                                        background: "var(--primary)"
                                    }} />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Right actions (Live Status badge & Hamburger) */}
                <Rw style={{ gap: 12 }}>
                    <div style={{
                        padding: "6px 12px", 
                        borderRadius: "var(--radius-pill)",
                        background: "var(--sf2)",
                        display: "flex", 
                        alignItems: "center", 
                        gap: 6,
                    }}>
                        <Dot pulse size={6} color="var(--primary)" />
                        <M size={12} color="var(--ink)" style={{ fontWeight: 600 }}>Live Data</M>
                    </div>

                    {/* Mobile Menu Toggle Button */}
                    <button
                        className="mobile-menu-toggle"
                        onClick={() => setMobileOpen(!mobileOpen)}
                        style={{
                            border: "none",
                            background: "transparent",
                            fontSize: "24px",
                            cursor: "pointer",
                            color: "var(--ink)",
                            display: "none", // Managed by CSS media query in global.css
                            padding: "4px"
                        }}
                    >
                        {mobileOpen ? "✕" : "☰"}
                    </button>
                </Rw>
            </div>

            {/* Mobile Drawer Dropdown */}
            {mobileOpen && (
                <div style={{
                    position: "fixed",
                    top: 64,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "var(--bg)",
                    zIndex: 290,
                    padding: "24px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                    borderTop: "1px solid var(--bd)",
                    animation: "fadeUp 0.2s ease"
                }}>
                    {NAV_ITEMS.map(item => {
                        const active = tab === item.key;
                        return (
                            <button
                                key={item.key}
                                onClick={() => {
                                    setTab(item.key);
                                    setMobileOpen(false);
                                }}
                                style={{
                                    border: "none",
                                    background: active ? "var(--sf2)" : "transparent",
                                    color: active ? "var(--primary)" : "var(--ink)",
                                    fontFamily: "var(--body)",
                                    fontSize: "18px",
                                    fontWeight: active ? 600 : 500,
                                    cursor: "pointer",
                                    padding: "12px 16px",
                                    borderRadius: "var(--radius-pill)",
                                    textAlign: "left",
                                    transition: "all 0.2s"
                                }}
                            >
                                {item.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </>
    );
}

