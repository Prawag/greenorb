"""Semantic-aware overlapping chunking for text blocks."""
import re
from typing import List
from core.config import settings


def split_into_sentences(text: str) -> List[str]:
    """Split text into sentences using regex."""
    text = re.sub(r'\s+', ' ', text).strip()
    sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
    return [s.strip() for s in sentences if len(s.strip()) > 10]


def create_chunks(text_blocks: List[dict]) -> List[dict]:
    """Create overlapping chunks respecting sentence boundaries."""
    chunk_size = settings.chunk_size
    chunk_overlap = settings.chunk_overlap

    all_sentences = []
    for block in text_blocks:
        page = block["page"]
        sentences = split_into_sentences(block["text"])
        for s in sentences:
            all_sentences.append({"page": page, "text": s})

    chunks = []
    chunk_index = 0
    i = 0

    while i < len(all_sentences):
        current_text = ""
        current_page = all_sentences[i]["page"]
        j = i
        while j < len(all_sentences) and len(current_text) + len(all_sentences[j]["text"]) < chunk_size:
            current_text += (" " if current_text else "") + all_sentences[j]["text"]
            j += 1
        if not current_text and j < len(all_sentences):
            current_text = all_sentences[j]["text"]
            j += 1
        if current_text.strip():
            chunks.append({
                "chunk_index": chunk_index,
                "chunk_text": current_text.strip(),
                "page_number": current_page
            })
            chunk_index += 1
        overlap_chars = 0
        k = j - 1
        while k >= i and overlap_chars < chunk_overlap:
            overlap_chars += len(all_sentences[k]["text"])
            k -= 1
        i = max(k + 1, i + 1)

    return chunks
