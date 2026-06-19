from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from bs4 import BeautifulSoup


@dataclass
class ParsedDoc:
    url: str
    title: str
    publication: str
    language: str
    date: Optional[str]
    text: str
    paragraphs: List[str]


def _norm_ws(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def guess_publication_from_url(url: str) -> str:
    # Heuristic: pull a stable segment from wol URLs.
    # Example patterns vary; keep simple.
    m = re.search(r"/lp-e/([^/]+)/", url)
    if m:
        return m.group(1)
    return "unknown"


def parse_wol_html(html: str, url: str, language: str = "en") -> ParsedDoc:
    soup = BeautifulSoup(html, "lxml")

    title = ""
    if soup.title and soup.title.string:
        title = _norm_ws(soup.title.string)

    # Main text - WOL pages generally have article content in identifiable containers.
    # We'll fall back to body text.
    main = soup.find("article") or soup.find("main") or soup.body
    text = _norm_ws(main.get_text(" ", strip=True) if main else "")

    # Paragraph-ish chunking: prefer <p>
    paragraphs: List[str] = []
    if main:
        for p in main.find_all("p"):
            t = _norm_ws(p.get_text(" ", strip=True))
            if t and len(t) >= 30:
                paragraphs.append(t)

    if not paragraphs and text:
        # Fallback split
        paragraphs = [t for t in re.split(r"(?<=[.!?])\s+", text) if len(t) >= 30]

    publication = guess_publication_from_url(url)

    # Date is hard to standardize; keep optional.
    date = None

    return ParsedDoc(
        url=url,
        title=title,
        publication=publication,
        language=language,
        date=date,
        text=text,
        paragraphs=paragraphs,
    )


def stable_id(*parts: str) -> str:
    h = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
    return h
