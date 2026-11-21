"""Pluggable LLM client (OpenAI-compatible chat completions) + embeddings.

Mirrors Backend/src/services/llm.js so the API and the worker behave the same way.
"""
from __future__ import annotations

import json
import logging
import math
import re
import time
from dataclasses import dataclass

import httpx

from .config import Settings

log = logging.getLogger(__name__)
EMBED_DIM = 768


@dataclass
class Provider:
    name: str
    base_url: str
    api_key: str
    model: str


class LLMUnavailable(RuntimeError):
    pass


def build_providers(s: Settings) -> list[Provider]:
    all_ = {
        "groq": s.groq_api_key and Provider("groq", "https://api.groq.com/openai/v1", s.groq_api_key, s.groq_model),
        "gemini": s.gemini_api_key
        and Provider("gemini", "https://generativelanguage.googleapis.com/v1beta/openai", s.gemini_api_key, s.gemini_model),
        "openai": s.openai_api_key and Provider("openai", s.openai_base_url.rstrip("/"), s.openai_api_key, s.openai_model),
        "ollama": s.ollama_base_url and Provider("ollama", s.ollama_base_url.rstrip("/") + "/v1", "ollama", s.ollama_model),
    }
    return [all_[n] for n in s.llm_providers if all_.get(n)]


def parse_json_loose(text: str) -> dict | None:
    """Parse model output that should be JSON: strips code fences, trims to the outer object,
    and repairs truncation by balancing brackets."""
    if not text:
        return None
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.I)
    start = t.find("{")
    if start < 0:
        return None
    t = t[start:]
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        pass
    end = t.rfind("}")
    if end > 0:
        try:
            return json.loads(t[: end + 1])
        except json.JSONDecodeError:
            pass
    # Repair a truncated payload: drop the trailing partial element, close open brackets.
    stack, in_str, esc, last_good = [], False, False, 0
    for i, ch in enumerate(t):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in "{[":
            stack.append("}" if ch == "{" else "]")
        elif ch in "}]":
            if stack:
                stack.pop()
            last_good = i + 1
        elif ch == ",":
            last_good = i
    candidate = t[:last_good].rstrip().rstrip(",")
    closers, in_str, esc = [], False, False
    for ch in candidate:
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in "{[":
            closers.append("}" if ch == "{" else "]")
        elif ch in "}]" and closers:
            closers.pop()
    try:
        return json.loads(candidate + "".join(reversed(closers)))
    except json.JSONDecodeError:
        return None


class LLMClient:
    def __init__(self, settings: Settings, http: httpx.Client | None = None):
        self.s = settings
        self.providers = build_providers(settings)
        self.http = http or httpx.Client(timeout=settings.llm_timeout_s)
        self._cooldown: dict[str, float] = {}

    @property
    def configured(self) -> bool:
        return bool(self.providers)

    def _post(self, url: str, body: dict, headers: dict) -> httpx.Response:
        return self.http.post(url, json=body, headers={"content-type": "application/json", **headers})

    def chat_json(self, system: str, user: str, *, max_tokens: int = 2048) -> tuple[dict | None, str]:
        """Return (parsed JSON or None, provider name). Raises LLMUnavailable if every provider fails."""
        if not self.providers:
            raise LLMUnavailable("no LLM provider configured")
        errors = []
        for p in self.providers:
            if self._cooldown.get(p.name, 0) > time.time():
                continue
            body = {
                "model": p.model,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                "temperature": 0,
                "max_tokens": max_tokens,
                "response_format": {"type": "json_object"},
            }
            for attempt in range(3):
                try:
                    r = self._post(f"{p.base_url}/chat/completions", body, {"authorization": f"Bearer {p.api_key}"})
                except httpx.HTTPError as exc:
                    errors.append(f"{p.name}: {exc}")
                    self._cooldown[p.name] = time.time() + 60
                    break
                if r.status_code == 400 and "response_format" in body:
                    body.pop("response_format")
                    continue
                if r.status_code == 429 and attempt < 2:
                    wait = min(30.0, float(r.headers.get("retry-after", "0") or 0) or 8.0 * (attempt + 1))
                    log.info("%s rate limited, waiting %.0fs", p.name, wait)
                    time.sleep(wait)
                    continue
                if r.status_code >= 400:
                    errors.append(f"{p.name}: HTTP {r.status_code} {r.text[:160]}")
                    self._cooldown[p.name] = time.time() + (600 if r.status_code in (401, 403) else 60)
                    break
                try:
                    content = r.json()["choices"][0]["message"]["content"]
                except (KeyError, IndexError, ValueError) as exc:
                    errors.append(f"{p.name}: malformed response ({exc})")
                    break
                parsed = parse_json_loose(content)
                if parsed is None:
                    errors.append(f"{p.name}: response was not JSON")
                    break
                return parsed, p.name
        raise LLMUnavailable("; ".join(errors) or "all providers cooling down")

    # ── embeddings ──────────────────────────────────────────────────────────
    @property
    def embeddings_provider(self) -> str:
        return self.s.embeddings_provider

    def embed(self, texts: list[str], task_type: str = "RETRIEVAL_DOCUMENT") -> list[list[float]] | None:
        if not texts or self.s.embeddings_provider == "none":
            return None
        prov = self.s.embeddings_provider
        if prov == "gemini":
            model = self.s.gemini_embed_model
            r = self._post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents",
                {
                    "requests": [
                        {"model": f"models/{model}", "content": {"parts": [{"text": t}]}, "taskType": task_type, "outputDimensionality": EMBED_DIM}
                        for t in texts
                    ]
                },
                {"x-goog-api-key": self.s.gemini_api_key},
            )
            r.raise_for_status()
            vecs = [e["values"] for e in r.json()["embeddings"]]
        elif prov == "openai":
            r = self._post(
                f"{self.s.openai_base_url.rstrip('/')}/embeddings",
                {"model": self.s.openai_embed_model, "input": texts, "dimensions": EMBED_DIM},
                {"authorization": f"Bearer {self.s.openai_api_key}"},
            )
            r.raise_for_status()
            vecs = [d["embedding"] for d in r.json()["data"]]
        elif prov == "ollama":
            r = self._post(f"{self.s.ollama_base_url.rstrip('/')}/api/embed", {"model": self.s.ollama_embed_model, "input": texts}, {})
            r.raise_for_status()
            vecs = r.json()["embeddings"]
        else:
            return None
        out = []
        for v in vecs:
            if len(v) != EMBED_DIM:
                raise ValueError(f"{prov} returned {len(v)}-dim embeddings; GreenOrb stores {EMBED_DIM}")
            n = math.sqrt(sum(x * x for x in v)) or 1.0
            out.append([x / n for x in v])
        return out
