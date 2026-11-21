"""Split page text into overlapping passages for Ask-the-report retrieval."""
from __future__ import annotations

import re
from dataclasses import dataclass

from .pdf import Document


@dataclass
class Chunk:
    page: int
    ord: int
    content: str


def chunk_document(doc: Document, *, size: int = 1100, overlap: int = 150, min_chars: int = 60) -> list[Chunk]:
    out: list[Chunk] = []
    for p in doc.pages:
        text = p.text.strip()
        if len(text) < min_chars:
            continue
        start, ord_ = 0, 0
        while start < len(text):
            end = min(len(text), start + size)
            if end < len(text):
                # prefer to cut at a paragraph, line or sentence boundary
                window = text[start:end]
                cut = max(window.rfind("\n\n"), window.rfind("\n"), window.rfind(". "))
                if cut > size * 0.5:
                    end = start + cut + 1
            piece = text[start:end].strip()
            if len(piece) >= min_chars:
                out.append(Chunk(p.number, ord_, piece))
                ord_ += 1
            if end >= len(text):
                break
            start = max(end - overlap, start + 1)
    return out


_ESG = re.compile(
    r"scope\s*[123]|greenhouse|\bghg\b|emission|carbon|co2|energy|renewable|electricity|fuel|water|"
    r"effluent|waste|recycl|assurance|net[\s-]?zero|climate|target|biodivers|sustainab",
    re.I,
)


def select_chunks(chunks: list[Chunk], keep_pages: set[int], limit: int) -> list[Chunk]:
    """Keep every passage from cited pages, then the most ESG-dense passages up to `limit` in total.

    Storing every passage of a 300-page annual report costs ~1 MB per report, which would fill a
    small database after a few hundred reports. limit <= 0 keeps everything.
    """
    if limit <= 0 or len(chunks) <= limit:
        return chunks
    must = [c for c in chunks if c.page in keep_pages]
    rest = [c for c in chunks if c.page not in keep_pages]
    scored = sorted(rest, key=lambda c: len(_ESG.findall(c.content)) / max(200, len(c.content)), reverse=True)
    extra = [c for c in scored[: max(0, limit - len(must))] if _ESG.search(c.content)]
    keep = {id(c) for c in must + extra}
    return [c for c in chunks if id(c) in keep]
