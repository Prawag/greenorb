"""Split page text into overlapping passages for Ask-the-report retrieval."""
from __future__ import annotations

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
