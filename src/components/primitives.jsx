import React from "react";

// ── M — Monospace text span ───────────────────────────────────────────────────
export const M = ({ children, color, size = 11, style }) => (
    <span style={{ fontFamily: "var(--mono)", fontSize: size, color: color || "var(--tx2)", lineHeight: 1.5, ...style }}>
        {children}
    </span>
);

// ── Bdg — Badge chip ──────────────────────────────────────────────────────────
export const Bdg = ({ color = "jade", children, style }) => {
    const C = {
        jade: ["rgba(0,232,122,.12)", "rgba(0,232,122,.28)", "#00e87a"],
        cyan: ["rgba(0,212,232,.1)", "rgba(0,212,232,.28)", "#00d4e8"],
        amb: ["rgba(245,166,35,.1)", "rgba(245,166,35,.28)", "#f5a623"],
        red: ["rgba(255,77,77,.1)", "rgba(255,77,77,.28)", "#ff4d4d"],
        pur: ["rgba(167,139,250,.1)", "rgba(167,139,250,.28)", "#a78bfa"],
        blu: ["rgba(96,165,250,.1)", "rgba(96,165,250,.28)", "#60a5fa"],
    }[color] || ["rgba(0,232,122,.12)", "rgba(0,232,122,.28)", "#00e87a"];
    return (
        <span style={{
            background: C[0], border: `1px solid ${C[1]}`, color: C[2],
            borderRadius: 4, padding: "2px 7px", fontSize: 10,
            fontFamily: "var(--mono)", fontWeight: 500, letterSpacing: ".06em",
            whiteSpace: "nowrap", ...style,
        }}>
            {children}
        </span>
    );
};

// ── Dot — Glowing dot indicator ───────────────────────────────────────────────
export const Dot = ({ color = "#00e87a", size = 7, pulse }) => (
    <span style={{
        display: "inline-block", width: size, height: size, borderRadius: "50%",
        background: color, boxShadow: `0 0 ${size + 2}px ${color}`,
        animation: pulse ? "pulse 2s infinite" : "none", flexShrink: 0,
    }} />
);

// ── Cd — Card container ───────────────────────────────────────────────────────
export const Cd = ({ children, style, accent, danger }) => (
    <div style={{
        background: "var(--sf)", borderRadius: 14,
        border: `1px solid ${accent ? "rgba(0,232,122,.22)" : danger ? "rgba(255,77,77,.2)" : "var(--bd)"}`,
        boxShadow: accent ? "0 0 20px rgba(0,232,122,.07)" : "none",
        ...style,
    }}>
        {children}
    </div>
);

// ── Rw — Row flex container ───────────────────────────────────────────────────
export const Rw = ({ children, style }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, ...style }}>
        {children}
    </div>
);

// ── PBar — Progress bar ───────────────────────────────────────────────────────
export const PBar = ({ v, color = "var(--jade)", h = 4, animate }) => (
    <div style={{ height: h, background: "var(--bg3)", borderRadius: h / 2, overflow: "hidden" }}>
        <div style={{
            width: `${Math.min(v, 100)}%`, height: "100%",
            background: color, borderRadius: h / 2,
            transition: animate ? "width 1.2s ease" : "none",
        }} />
    </div>
);

// ── Spin — Loading spinner ────────────────────────────────────────────────────
export const Spin = ({ size = 20, color = "var(--jade)" }) => (
    <div style={{
        width: size, height: size,
        border: `2px solid transparent`,
        borderTop: `2px solid ${color}`,
        borderRadius: "50%",
        animation: "spin .9s linear infinite",
        flexShrink: 0,
    }} />
);

// ── SHd — Section header ──────────────────────────────────────────────────────
export const SHd = ({ tag, title, sub }) => (
    <div style={{ marginBottom: 18, animation: "fadeUp .4s ease" }}>
        <M color="var(--jade)" size={10} style={{ display: "block", marginBottom: 5, letterSpacing: ".14em", textTransform: "uppercase" }}>
      // {tag}
        </M>
        <h2 style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 22, color: "var(--tx)", marginBottom: sub ? 6 : 0, lineHeight: 1.2 }}>
            {title}
        </h2>
        {sub && <p style={{ color: "var(--tx2)", fontSize: 13, lineHeight: 1.65 }}>{sub}</p>}
    </div>
);
