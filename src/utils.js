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
    if (mt < 50) return 0x10b981;
    if (mt < 200) return 0x34d399;
    if (mt < 500) return 0xd97706;
    if (mt < 2000) return 0xea580c;
    return 0xdc2626;
}

export function emissToCSS(mt) {
    if (mt < 50) return "#10b981";
    if (mt < 200) return "#34d399";
    if (mt < 500) return "#d97706";
    if (mt < 2000) return "#ea580c";
    return "#dc2626";
}

export function gradeToColor(g) {
    if (!g) return "var(--tx3)";
    if (g.startsWith("A")) return "#059669";
    if (g.startsWith("B")) return "#0891b2";
    if (g.startsWith("C")) return "#d97706";
    return "#dc2626";
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

export const API_BASE = "http://localhost:5000/api";
export const OLLAMA_BASE = "http://localhost:11434/api";

const PREFER_LOCAL_AI = true; // Set to true to use Llama 3.2 locally

// Gemini API caller
const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY;
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export async function geminiGenerate(prompt, systemPrompt = "", stream = false) {
    // If local preference is on, try Ollama first
    if (PREFER_LOCAL_AI && !stream) {
        try {
            const ollamaRes = await ollamaGenerate(prompt, systemPrompt);
            const ollamaData = await ollamaRes.json();
            if (ollamaData.response) {
                // Return a "Shim" that looks like a fetch response to keep existing code working
                return {
                    ok: true,
                    json: async () => ({
                        candidates: [{ content: { parts: [{ text: ollamaData.response }] } }]
                    }),
                    text: async () => JSON.stringify({
                        candidates: [{ content: { parts: [{ text: ollamaData.response }] } }]
                    })
                };
            }
        } catch (e) {
            console.warn("Local Ollama failed, falling back to Gemini:", e);
        }
    }

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

export async function ollamaGenerate(prompt, systemPrompt = "") {
    const body = {
        model: "llama3.2",
        prompt: systemPrompt ? `System: ${systemPrompt}\n\nUser: ${prompt}` : prompt,
        stream: false,
        options: { temperature: 0.7 }
    };

    return await fetch(`${OLLAMA_BASE}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
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
