// Shared helper functions
export function latLngToXYZ(lat, lng, r) {
    const THREE = window._THREE;
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lng + 180) * Math.PI / 180;
    return {
        x: -r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.cos(phi),
        z: r * Math.sin(phi) * Math.sin(theta),
    };
}

export function emissToHex(mt) {
    if (mt < 50) return 0x00e87a;
    if (mt < 200) return 0x34d399;
    if (mt < 500) return 0xf5a623;
    if (mt < 2000) return 0xfb923c;
    return 0xff4d4d;
}

export function emissToCSS(mt) {
    if (mt < 50) return "#00e87a";
    if (mt < 200) return "#34d399";
    if (mt < 500) return "#f5a623";
    if (mt < 2000) return "#fb923c";
    return "#ff4d4d";
}

export function gradeToColor(g) {
    if (!g) return "var(--tx3)";
    if (g.startsWith("A")) return "#00e87a";
    if (g.startsWith("B")) return "#00d4e8";
    if (g.startsWith("C")) return "#f5a623";
    return "#ff4d4d";
}

export function gradeToBdg(g) {
    if (!g) return "jade";
    if (g.startsWith("A")) return "jade";
    if (g.startsWith("B")) return "cyan";
    if (g.startsWith("C")) return "amb";
    return "red";
}

// LocalStorage shim (replaces window.storage from Claude sandbox)
export const storage = {
    get: (key) => {
        try {
            const val = localStorage.getItem(key);
            return val ? { value: val } : null;
        } catch { return null; }
    },
    set: (key, value) => {
        try { localStorage.setItem(key, value); } catch { }
    },
    delete: (key) => {
        try { localStorage.removeItem(key); } catch { }
    },
};

// Gemini API caller
const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY;
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export async function geminiGenerate(prompt, systemPrompt = "", stream = false) {
    const model = "gemini-2.0-flash";
    const url = stream
        ? `${GEMINI_BASE}/models/${model}:streamGenerateContent?alt=sse&key=${GEMINI_KEY}`
        : `${GEMINI_BASE}/models/${model}:generateContent?key=${GEMINI_KEY}`;

    const body = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
        generationConfig: { maxOutputTokens: 4096, temperature: 0.7 },
    };

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${err.slice(0, 200)}`);
    }

    return res;
}

export async function geminiGeneratePDF(pdfBase64, prompt, systemPrompt = "", stream = false) {
    const model = "gemini-2.0-flash";
    const url = stream
        ? `${GEMINI_BASE}/models/${model}:streamGenerateContent?alt=sse&key=${GEMINI_KEY}`
        : `${GEMINI_BASE}/models/${model}:generateContent?key=${GEMINI_KEY}`;

    const body = {
        contents: [{
            role: "user",
            parts: [
                { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
                { text: prompt },
            ],
        }],
        systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
        generationConfig: { maxOutputTokens: 8192, temperature: 0.7 },
    };

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${err.slice(0, 200)}`);
    }

    return res;
}

// Parse SSE stream from Gemini and yield text chunks
export async function* parseGeminiStream(response) {
    const reader = response.body.getReader();
    const dec = new TextDecoder();
    let buf = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const d = line.slice(6).trim();
            if (d === "[DONE]" || !d) continue;
            try {
                const j = JSON.parse(d);
                const text = j.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) yield text;
            } catch { }
        }
    }
}

// Gemini image analysis (for mobile photo uploads)
export async function geminiGenerateImage(imageBase64, mimeType, prompt, systemPrompt = "", stream = false) {
    const model = "gemini-2.0-flash";
    const url = stream
        ? `${GEMINI_BASE}/models/${model}:streamGenerateContent?alt=sse&key=${GEMINI_KEY}`
        : `${GEMINI_BASE}/models/${model}:generateContent?key=${GEMINI_KEY}`;

    const body = {
        contents: [{
            role: "user",
            parts: [
                { inlineData: { mimeType, data: imageBase64 } },
                { text: prompt },
            ],
        }],
        systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
        generationConfig: { maxOutputTokens: 8192, temperature: 0.7 },
    };

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${err.slice(0, 200)}`);
    }

    return res;
}
