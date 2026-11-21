import React from "react";

// ── M — Text span ─────────────────────────────────────────────────────────────
export const M = ({ children, color, size = 13, style, mono }) => (
    <span style={{ fontFamily: mono ? "var(--mono)" : "var(--body)", fontSize: size, color: color || "var(--tx2)", lineHeight: 1.5, ...style }}>
        {children}
    </span>
);

// ── Bdg — Badge chip ──────────────────────────────────────────────────────────
export const Bdg = ({ color = "jade", children, style }) => {
    // Badges in Coinbase are pill-shaped with surface-strong background
    return (
        <span style={{
            background: "var(--sf2)", color: "var(--ink)",
            borderRadius: "var(--radius-pill)", padding: "4px 12px", fontSize: 12,
            fontFamily: "var(--body)", fontWeight: 600,
            whiteSpace: "nowrap", ...style,
        }}>
            {children}
        </span>
    );
};

// ── Dot — Indicator dot ───────────────────────────────────────────────────────
export const Dot = ({ color = "var(--primary)", size = 7, pulse }) => (
    <span style={{
        display: "inline-block", width: size, height: size, borderRadius: "50%",
        background: color,
        animation: pulse ? "pulse 2s infinite" : "none", flexShrink: 0,
    }} />
);

// ── Cd — Card container ───────────────────────────────────────────────────────
export const Cd = ({ children, style, accent, danger }) => (
    <div style={{
        background: "var(--sf)",
        borderRadius: "var(--radius)",
        border: `1px solid ${accent ? "var(--primary)" : danger ? "var(--semantic-down)" : "var(--bd)"}`,
        boxShadow: "var(--shadow-sm)",
        transition: "box-shadow .2s, border-color .2s",
        ...style,
    }}
    onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "var(--shadow)"; }}
    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-sm)"; }}
    >
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

// ── PillBtn — Primary button (Coinbase) ──────────────────────────────────────
export const PillBtn = ({ children, onClick, disabled, primary, danger, style }) => {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            onMouseEnter={(e) => { if(primary && !disabled) e.currentTarget.style.background = "var(--primary-active)"; }}
            onMouseLeave={(e) => { if(primary && !disabled) e.currentTarget.style.background = "var(--primary)"; }}
            style={{
                width: "100%", padding: "12px 20px", borderRadius: "var(--radius-pill)",
                border: "none",
                background: primary ? (disabled ? "var(--primary-disabled)" : "var(--primary)") : danger ? "rgba(207,32,47,.08)" : "var(--sf2)",
                color: primary ? "#ffffff" : danger ? "var(--semantic-down)" : "var(--ink)",
                fontFamily: "var(--body)", fontWeight: 600, fontSize: 16,
                cursor: disabled ? "not-allowed" : "pointer",
                boxShadow: "none",
                transition: "background 0.2s",
                display: "flex", alignItems: "center",
                justifyContent: "center", gap: 8, ...style,
            }}
        >
            {children}
        </button>
    );
}

// Alias for compatibility
export const GlassBtn = PillBtn;
