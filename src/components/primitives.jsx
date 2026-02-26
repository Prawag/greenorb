import React from "react";

// ── M — Text span ─────────────────────────────────────────────────────────────
export const M = ({ children, color, size = 13, style, mono }) => (
    <span style={{ fontFamily: mono ? "var(--mono)" : "var(--body)", fontSize: size, color: color || "var(--tx2)", lineHeight: 1.5, ...style }}>
        {children}
    </span>
);

// ── Bdg — Badge chip ──────────────────────────────────────────────────────────
export const Bdg = ({ color = "jade", children, style }) => {
    const C = {
        jade: ["rgba(16,185,129,.08)", "rgba(16,185,129,.2)", "#059669"],
        cyan: ["rgba(8,145,178,.06)", "rgba(8,145,178,.18)", "#0891b2"],
        amb: ["rgba(217,119,6,.06)", "rgba(217,119,6,.18)", "#d97706"],
        red: ["rgba(220,38,38,.06)", "rgba(220,38,38,.18)", "#dc2626"],
        pur: ["rgba(124,58,237,.06)", "rgba(124,58,237,.18)", "#7c3aed"],
        blu: ["rgba(37,99,235,.06)", "rgba(37,99,235,.18)", "#2563eb"],
        gold: ["rgba(202,138,4,.06)", "rgba(202,138,4,.18)", "#ca8a04"],
    }[color] || ["rgba(16,185,129,.08)", "rgba(16,185,129,.2)", "#059669"];
    return (
        <span style={{
            background: C[0], border: `1px solid ${C[1]}`, color: C[2],
            borderRadius: 6, padding: "2px 8px", fontSize: 11,
            fontFamily: "var(--body)", fontWeight: 600, letterSpacing: ".01em",
            whiteSpace: "nowrap", ...style,
        }}>
            {children}
        </span>
    );
};

// ── Dot — Indicator dot ───────────────────────────────────────────────────────
export const Dot = ({ color = "#10b981", size = 7, pulse }) => (
    <span style={{
        display: "inline-block", width: size, height: size, borderRadius: "50%",
        background: color, boxShadow: `0 0 ${size}px ${color}40`,
        animation: pulse ? "pulse 2s infinite" : "none", flexShrink: 0,
    }} />
);

// ── Cd — Card container ───────────────────────────────────────────────────────
export const Cd = ({ children, style, accent, danger, glass }) => (
    <div style={{
        background: "var(--sf)",
        borderRadius: "var(--radius)",
        border: `1px solid ${accent ? "rgba(16,185,129,.25)" : danger ? "rgba(220,38,38,.2)" : "var(--bd)"}`,
        boxShadow: accent ? "0 0 0 1px rgba(16,185,129,.08), var(--shadow)" : "var(--shadow-sm)",
        transition: "box-shadow .2s, border-color .2s",
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

// ── PBar — Progress bar ──────────────────────────────────────────────────────
export const PBar = ({ v, color = "var(--jade)", h = 4, animate }) => (
    <div style={{ height: h, background: "var(--bg3)", borderRadius: h, overflow: "hidden" }}>
        <div style={{
            width: `${Math.min(v, 100)}%`, height: "100%",
            background: color, borderRadius: h,
            transition: animate ? "width 1s ease" : "none",
        }} />
    </div>
);

// ── Spin — Loading spinner ───────────────────────────────────────────────────
export const Spin = ({ size = 20, color = "var(--jade)" }) => (
    <div style={{
        width: size, height: size,
        border: `2px solid var(--bg3)`,
        borderTop: `2px solid ${color}`,
        borderRadius: "50%",
        animation: "spin .8s linear infinite",
        flexShrink: 0,
    }} />
);

// ── SHd — Section header ─────────────────────────────────────────────────────
export const SHd = ({ tag, title, sub }) => (
    <div style={{ marginBottom: 20, animation: "fadeUp .4s ease" }}>
        <M color="var(--jade)" size={11} style={{ display: "block", marginBottom: 4, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 600 }}>
            {tag}
        </M>
        <h2 style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 24, color: "var(--tx)", marginBottom: sub ? 6 : 0, lineHeight: 1.25, letterSpacing: "-.02em" }}>
            {title}
        </h2>
        {sub && <p style={{ color: "var(--tx2)", fontSize: 14, lineHeight: 1.6 }}>{sub}</p>}
    </div>
);

// ── GlassBtn — Primary button ─────────────────────────────────────────────────
export const GlassBtn = ({ children, onClick, disabled, primary, danger, style }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        style={{
            width: "100%", padding: "12px 20px", borderRadius: "var(--radius)",
            border: primary ? "none" : danger ? "1px solid rgba(220,38,38,.25)" : "1px solid var(--bd)",
            background: primary ? "var(--jade)" : danger ? "rgba(220,38,38,.04)" : "var(--sf)",
            color: primary ? "#ffffff" : danger ? "var(--red)" : "var(--tx)",
            fontFamily: "var(--disp)", fontWeight: 600, fontSize: 14,
            cursor: disabled ? "default" : "pointer",
            opacity: disabled ? 0.5 : 1,
            boxShadow: primary ? "0 1px 3px rgba(16,185,129,.3)" : "var(--shadow-sm)",
            transition: "all .2s", display: "flex", alignItems: "center",
            justifyContent: "center", gap: 8, ...style,
        }}
    >
        {children}
    </button>
);
