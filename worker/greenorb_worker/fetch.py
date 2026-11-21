"""Safe PDF download: public hosts only, size-capped, follows a landing page to its report PDF."""
from __future__ import annotations

import ipaddress
import re
import socket
from urllib.parse import urljoin, urlparse

import httpx

UA = "Mozilla/5.0 (compatible; GreenOrbBot/4.0; +https://github.com/Prawag/greenorb)"


class FetchError(RuntimeError):
    pass


def assert_public(url: str) -> None:
    u = urlparse(url)
    if u.scheme not in ("http", "https") or not u.hostname:
        raise FetchError("Only http(s) URLs are allowed.")
    if u.username or u.password:
        raise FetchError("URLs with credentials are not allowed.")
    try:
        infos = socket.getaddrinfo(u.hostname, u.port or (443 if u.scheme == "https" else 80), proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise FetchError(f"Could not resolve {u.hostname}.") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise FetchError("URL resolves to a private or reserved address.")


def _get(client: httpx.Client, url: str, max_bytes: int) -> tuple[bytes, str, str]:
    """GET with manual redirects (each hop re-checked) and a hard size cap."""
    for _ in range(6):
        assert_public(url)
        with client.stream("GET", url) as r:
            if r.is_redirect:
                url = urljoin(url, r.headers.get("location", ""))
                continue
            if r.status_code >= 400:
                raise FetchError(f"Download failed: HTTP {r.status_code}.")
            declared = int(r.headers.get("content-length") or 0)
            if declared > max_bytes:
                raise FetchError(f"File is larger than the {max_bytes // 1_048_576} MB limit.")
            buf = bytearray()
            for chunk in r.iter_bytes():
                buf.extend(chunk)
                if len(buf) > max_bytes:
                    raise FetchError(f"File is larger than the {max_bytes // 1_048_576} MB limit.")
            return bytes(buf), r.headers.get("content-type", ""), str(r.url)
    raise FetchError("Too many redirects.")


_REPORT_WORDS = re.compile(r"sustainab|esg|brsr|business.responsibility|responsib|climate|impact|environment|annual|integrated|csr", re.I)


def fetch_pdf(url: str, *, max_mb: int = 80, timeout_s: int = 90) -> tuple[bytes, str]:
    """Return (pdf bytes, final url). If the URL is an HTML page, follow its most report-like PDF link."""
    max_bytes = max_mb * 1_048_576
    with httpx.Client(timeout=httpx.Timeout(timeout_s, connect=15), headers={"user-agent": UA}, follow_redirects=False) as client:
        data, ctype, final = _get(client, url, max_bytes)
        if b"%PDF-" in data[:1024]:
            return data, final
        if "html" not in ctype.lower() and b"<html" not in data[:2048].lower():
            raise FetchError("The URL did not return a PDF.")
        html = data.decode("utf-8", errors="ignore")
        links = []
        for m in re.finditer(r"""href\s*=\s*["']([^"']+?\.pdf(?:\?[^"']*)?)["'][^>]*>(.*?)</a>""", html, re.I | re.S):
            href, text = m.group(1), re.sub(r"<[^>]+>", " ", m.group(2))
            score = len(_REPORT_WORDS.findall(href + " " + text)) + (2 if re.search(r"20[2-3]\d", href + text) else 0)
            links.append((score, urljoin(final, href)))
        links.sort(reverse=True)
        if not links or links[0][0] == 0:
            raise FetchError("The URL is a web page without a sustainability-report PDF link. Paste the PDF link directly.")
        data, _, final2 = _get(client, links[0][1], max_bytes)
        if b"%PDF-" not in data[:1024]:
            raise FetchError("The linked file is not a PDF.")
        return data, final2
