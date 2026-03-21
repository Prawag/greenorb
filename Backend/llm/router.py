import os
import time
import asyncio
import logging
from enum import Enum

"""
Multi-provider LLM router with automatic fallback and rate-limit tracking.
Chain: Gemini Flash → Groq Llama 3.1 → Ollama (local).
Returns {text, provider_used, error} dict for transparency.
"""

logger = logging.getLogger("llm_router")

# ─── Configuration ───────────────────────────────────────────
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}" if GEMINI_API_KEY else None

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.1-70b-versatile"

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")


class Provider(Enum):
    GEMINI = "gemini"
    GROQ   = "groq"
    OLLAMA = "ollama"


PROVIDER_CHAIN = [Provider.GEMINI, Provider.GROQ, Provider.OLLAMA]

# ─── Rate-limit tracking ─────────────────────────────────────
_rate_state = {
    Provider.GEMINI: {"calls": 0, "window_start": time.time(), "rpm": 14},
    Provider.GROQ:   {"calls": 0, "window_start": time.time(), "rpm": 28},
}


def _is_rate_limited(provider: Provider) -> bool:
    """Check if a provider has exceeded its RPM budget in the current window."""
    if provider not in _rate_state:
        return False
    s = _rate_state[provider]
    now = time.time()
    if now - s["window_start"] > 60:
        s["calls"] = 0
        s["window_start"] = now
    return s["calls"] >= s["rpm"]


def _record_call(provider: Provider):
    """Record a successful API call for rate tracking."""
    if provider in _rate_state:
        _rate_state[provider]["calls"] += 1


# ─── Provider-specific callers ────────────────────────────────
async def _call_gemini(prompt: str, system: str) -> str:
    import requests
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 4096}
    }
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}

    response = await asyncio.wait_for(
        asyncio.to_thread(requests.post, GEMINI_URL, json=body, timeout=110),
        timeout=120.0
    )
    if response.status_code != 200:
        raise RuntimeError(f"Gemini HTTP {response.status_code}: {response.text[:150]}")

    data = response.json()
    usage = data.get("usageMetadata", {})
    tokens = usage.get("totalTokenCount", 0)
    logger.info(f"Gemini tokens: {tokens}")

    text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    if not text:
        raise RuntimeError("Gemini returned empty text")
    return text


async def _call_groq(prompt: str, system: str) -> str:
    import requests
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    body = {
        "model": GROQ_MODEL,
        "messages": messages,
        "temperature": 0.1,
        "max_tokens": 4096
    }
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }

    response = await asyncio.wait_for(
        asyncio.to_thread(requests.post, GROQ_URL, json=body, headers=headers, timeout=60),
        timeout=90.0
    )
    if response.status_code != 200:
        raise RuntimeError(f"Groq HTTP {response.status_code}: {response.text[:150]}")

    data = response.json()
    tokens = data.get("usage", {}).get("total_tokens", 0)
    logger.info(f"Groq tokens: {tokens}")

    text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    if not text:
        raise RuntimeError("Groq returned empty text")
    return text


async def _call_ollama(prompt: str, system: str) -> str:
    import requests
    full_prompt = f"{system}\n\n{prompt}" if system else prompt

    response = await asyncio.wait_for(
        asyncio.to_thread(
            requests.post,
            OLLAMA_URL,
            json={"model": OLLAMA_MODEL, "prompt": full_prompt, "stream": False},
            timeout=180
        ),
        timeout=200.0
    )
    if response.status_code != 200:
        raise RuntimeError(f"Ollama HTTP {response.status_code}")

    text = response.json().get("response", "")
    if not text:
        raise RuntimeError("Ollama returned empty text")
    return text


_CALLERS = {
    Provider.GEMINI: _call_gemini,
    Provider.GROQ:   _call_groq,
    Provider.OLLAMA: _call_ollama,
}


# ─── Main router ──────────────────────────────────────────────
async def llm_call(prompt: str, system: str = "", task_id: str = "", company: str = "") -> dict:
    """
    Route an LLM call through the provider chain with automatic fallback.

    Returns: {"text": str, "provider_used": str, "error": str | None}

    The `company` param is an alias for `task_id` for backwards-compatibility
    with the analyst_agent.py calling convention.
    """
    tag = task_id or company or "unknown"
    last_error = None

    for provider in PROVIDER_CHAIN:
        if _is_rate_limited(provider):
            logger.info(f"[{tag}] {provider.value} rate-limited ({_rate_state[provider]['calls']} calls in window), skipping")
            print(f"[LLM Router] {provider.value} rate-limited, skipping")
            continue

        try:
            logger.info(f"[{tag}] Attempting {provider.value}")
            print(f"[LLM Router] Attempting {provider.value} for: {tag}")

            start = time.time()
            text = await _CALLERS[provider](prompt, system)
            duration_ms = int((time.time() - start) * 1000)

            _record_call(provider)
            logger.info(f"[{tag}] Success via {provider.value} ({duration_ms}ms)")
            print(f"[LLM Router] Success via {provider.value} ({duration_ms}ms)")

            return {"text": text, "provider_used": provider.value, "error": None}

        except Exception as e:
            last_error = str(e)[:200]
            logger.warning(f"[{tag}] {provider.value} failed: {last_error}")
            print(f"[LLM Router] {provider.value} failed: {last_error}")

    return {"text": None, "provider_used": None, "error": f"All providers failed. Last: {last_error}"}
