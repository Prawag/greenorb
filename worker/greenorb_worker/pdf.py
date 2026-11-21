"""PDF parsing with layout awareness.

Each page is reconstructed into visual rows (words sharing a baseline) and each row
into cells (runs of words separated by a wide horizontal gap). This keeps table
columns apart, which plain text extraction mixes together, and gives every number
an x-position that can be matched to a column header such as "FY2023-24".
"""
from __future__ import annotations

import logging
import re
import statistics
from dataclasses import dataclass, field

import pymupdf

pymupdf.TOOLS.mupdf_display_errors(False)
log = logging.getLogger(__name__)


@dataclass
class Cell:
    x0: float
    x1: float
    text: str

    @property
    def xc(self) -> float:
        return (self.x0 + self.x1) / 2


@dataclass
class Row:
    y: float
    cells: list[Cell]

    @property
    def text(self) -> str:
        return " ".join(c.text for c in self.cells)

    def as_table_line(self) -> str:
        return " | ".join(c.text for c in self.cells)


@dataclass
class Page:
    number: int  # 1-based
    text: str
    rows: list[Row] = field(default_factory=list)
    width: float = 0.0
    scanned: bool = False
    ocr: bool = False

    def table_text(self, max_chars: int | None = None) -> str:
        out = "\n".join(r.as_table_line() for r in self.rows)
        return out[:max_chars] if max_chars else out


@dataclass
class Document:
    pages: list[Page]
    page_count: int
    metadata: dict

    def page(self, n: int) -> Page | None:
        if 1 <= n <= len(self.pages):
            return self.pages[n - 1]
        return None


_WS = re.compile(r"[ \t   ]+")


def _clean(s: str) -> str:
    return _WS.sub(" ", s.replace("­", "")).strip()


def build_rows(words: list[tuple], page_width: float) -> list[Row]:
    """Group PyMuPDF words (x0, y0, x1, y1, text, ...) into visual rows and cells."""
    words = [w for w in words if str(w[4]).strip()]
    if not words:
        return []
    heights = [w[3] - w[1] for w in words if w[3] > w[1]]
    h = statistics.median(heights) if heights else 8.0
    tol = max(1.5, h * 0.45)

    words.sort(key=lambda w: ((w[1] + w[3]) / 2, w[0]))
    rows: list[list[tuple]] = []
    centers: list[float] = []
    for w in words:
        yc = (w[1] + w[3]) / 2
        if rows and abs(yc - centers[-1]) <= tol:
            rows[-1].append(w)
            n = len(rows[-1])
            centers[-1] = centers[-1] + (yc - centers[-1]) / n
        else:
            rows.append([w])
            centers.append(yc)

    out: list[Row] = []
    for ws, yc in zip(rows, centers):
        ws.sort(key=lambda w: w[0])
        char_w = statistics.median([(w[2] - w[0]) / max(1, len(str(w[4]))) for w in ws]) or 4.0
        gap_limit = max(char_w * 2.2, h * 0.9, 6.0)
        cells: list[Cell] = []
        cur = [ws[0]]
        for prev, w in zip(ws, ws[1:]):
            if w[0] - prev[2] > gap_limit:
                cells.append(Cell(cur[0][0], cur[-1][2], _clean(" ".join(str(x[4]) for x in cur))))
                cur = [w]
            else:
                cur.append(w)
        cells.append(Cell(cur[0][0], cur[-1][2], _clean(" ".join(str(x[4]) for x in cur))))
        out.append(Row(y=yc, cells=[c for c in cells if c.text]))
    return out


def _ocr_page(page: "pymupdf.Page") -> str | None:
    try:
        import io

        import pytesseract
        from PIL import Image

        pix = page.get_pixmap(dpi=200)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        return pytesseract.image_to_string(img)
    except Exception as exc:  # tesseract missing or failed: degrade gracefully
        log.debug("OCR unavailable on page %s: %s", page.number + 1, exc)
        return None


def open_document(data: bytes, *, max_pages: int = 400, ocr_pages: int = 15) -> Document:
    doc = pymupdf.open(stream=data, filetype="pdf")
    if doc.needs_pass:
        raise ValueError("The PDF is password-protected.")
    pages: list[Page] = []
    ocr_budget = ocr_pages
    try:
        for i, pg in enumerate(doc):
            if i >= max_pages:
                break
            text = pg.get_text("text", sort=True) or ""
            words = pg.get_text("words", sort=False) or []
            scanned = len(text.strip()) < 40 and len(pg.get_images()) > 0
            page = Page(number=i + 1, text=_clean_block(text), rows=build_rows(list(words), pg.rect.width), width=pg.rect.width, scanned=scanned)
            if scanned and ocr_budget > 0:
                ocr_text = _ocr_page(pg)
                if ocr_text and len(ocr_text.strip()) > 40:
                    ocr_budget -= 1
                    page.text = _clean_block(ocr_text)
                    page.rows = [Row(y=float(j), cells=[Cell(0, 0, _clean(line))]) for j, line in enumerate(ocr_text.splitlines()) if line.strip()]
                    page.ocr = True
            pages.append(page)
        return Document(pages=pages, page_count=doc.page_count, metadata=dict(doc.metadata or {}))
    finally:
        doc.close()


def _clean_block(text: str) -> str:
    lines = [_clean(line) for line in text.splitlines()]
    return "\n".join(line for line in lines if line)
