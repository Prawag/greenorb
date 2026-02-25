import React from "react";

// ── M — Monospace text span ───────────────────────────────────────────────────
export const M = ({ children, color, size = 11, style }) => (
    <span style={{ fontFamily: "var(--mono)", fontSize: size, color: color || "var(--tx2)", lineHeight: 1.5, ...style }}>
        {children}
    </span>
);

// ── Bdg — Badge chip (glassmorphic) ──────────────────────────────────────────
export const Bdg = ({ color = "jade", children, style }) => {
    const C = {
        jade: ["rgba(0,240,160,.1)", "rgba(0,240,160,.25)", "#00f0a0"],
        cyan: ["rgba(52,216,232,.08)", "rgba(52,216,232,.22)", "#34d8e8"],
        amb: ["rgba(240,192,64,.08)", "rgba(240,192,64,.22)", "#f0c040"],
        red: ["rgba(255,90,90,.08)", "rgba(255,90,90,.22)", "#ff5a5a"],
        pur: ["rgba(180,156,255,.08)", "rgba(180,156,255,.22)", "#b49cff"],
        blu: ["rgba(96,165,250,.08)", "rgba(96,165,250,.22)", "#60a5fa"],
        gold: ["rgba(240,192,64,.08)", "rgba(240,192,64,.22)", "#f0c040"],
    }[color] || ["rgba(0,240,160,.1)", "rgba(0,240,160,.25)", "#00f0a0"];
    return (
        <span style={{
            background: C[0], border: `1px solid ${C[1]}`, color: C[2],
            borderRadius: 6, padding: "3px 9px", fontSize: 10,
            fontFamily: "var(--mono)", fontWeight: 600, letterSpacing: ".06em",
            whiteSpace: "nowrap", backdropFilter: "blur(8px)", ...style,
        }}>
            {children}
        </span>
    );
};

// ── Dot — Glowing dot indicator ───────────────────────────────────────────────
export const Dot = ({ color = "#00f0a0", size = 7, pulse }) => (
    <span style={{
        display: "inline-block", width: size, height: size, borderRadius: "50%",
        background: color, boxShadow: `0 0 ${size + 3}px ${color}`,
        animation: pulse ? "pulse 2s infinite" : "none", flexShrink: 0,
    }} />
);

// ── Cd — Card container (glassmorphism) ───────────────────────────────────────
export const Cd = ({ children, style, accent, danger, glass }) => (
    <div style={{
        background: glass ? "var(--glass)" : "var(--sf)",
        backdropFilter: glass ? "blur(16px) saturate(1.2)" : "none",
        borderRadius: 16,
        border: `1px solid ${accent ? "rgba(0,240,160,.2)" : danger ? "rgba(255,90,90,.18)" : "var(--bd)"}`,
        boxShadow: accent
            ? "0 0 24px rgba(0,240,160,.06), inset 0 1px 0 rgba(0,240,160,.06)"
            : "inset 0 1px 0 rgba(255,255,255,.02)",
        transition: "border-color .2s, box-shadow .2s",
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

// ── PBar — Progress bar (gradient) ───────────────────────────────────────────
export const PBar = ({ v, color = "var(--jade)", h = 4, animate }) => (
    <div style={{ height: h, background: "var(--bg3)", borderRadius: h, overflow: "hidden" }}>
        <div style={{
            width: `${Math.min(v, 100)}%`, height: "100%",
            background: `linear-gradient(90deg, ${color}, ${color}88)`,
            borderRadius: h,
            transition: animate ? "width 1.2s ease" : "none",
            boxShadow: v > 0 ? `0 0 8px ${color}44` : "none",
        }} />
    </div>
);

// ── Spin — Loading spinner (gradient) ────────────────────────────────────────
export const Spin = ({ size = 20, color = "var(--jade)" }) => (
    <div style={{
        width: size, height: size,
        border: `2px solid rgba(0,240,160,.1)`,
        borderTop: `2px solid ${color}`,
        borderRadius: "50%",
        animation: "spin .8s linear infinite",
        flexShrink: 0,
    }} />
);

// ── SHd — Section header ──────────────────────────────────────────────────────
export const SHd = ({ tag, title, sub }) => (
    <div style={{ marginBottom: 18, animation: "fadeUp .4s ease" }}>
        <M color="var(--jade)" size={10} style={{ display: "block", marginBottom: 5, letterSpacing: ".14em", textTransform: "uppercase", fontWeight: 600 }}>
            {tag}
        </M>
        <h2 style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 22, color: "var(--tx)", marginBottom: sub ? 6 : 0, lineHeight: 1.2 }}>
            {title}
        </h2>
        {sub && <p style={{ color: "var(--tx2)", fontSize: 13, lineHeight: 1.65 }}>{sub}</p>}
    </div>
);

// ── GlassBtn — Premium button ─────────────────────────────────────────────────
export const GlassBtn = ({ children, onClick, disabled, primary, danger, style }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        style={{
            width: "100%", padding: "14px 20px", borderRadius: 14,
            border: primary ? "none" : danger ? "1px solid rgba(255,90,90,.3)" : "1px solid var(--bd2)",
            background: primary
                ? "linear-gradient(135deg, #00f0a0, #00b878)"
                : danger
                    ? "rgba(255,90,90,.06)"
                    : "var(--glass)",
            backdropFilter: primary ? "none" : "blur(12px)",
            color: primary ? "#040d08" : danger ? "var(--red)" : "var(--tx)",
            fontFamily: "var(--disp)", fontWeight: 800, fontSize: 15,
            cursor: disabled ? "default" : "pointer",
            opacity: disabled ? 0.5 : 1,
            boxShadow: primary ? "0 0 28px rgba(0,240,160,.3), inset 0 1px 0 rgba(255,255,255,.15)" : "none",
            transition: "all .2s", display: "flex", alignItems: "center",
            justifyContent: "center", gap: 8, ...style,
        }}
    >
        {children}
    </button>
);
