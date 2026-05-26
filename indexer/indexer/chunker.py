from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

from .parser import ParsedDoc, stable_id


@dataclass
class Chunk:
    id: str
    text: str
    metadata: Dict


def chunk_doc(doc: ParsedDoc, max_chars: int = 1200, overlap_chars: int = 150) -> List[Chunk]:
    chunks: List[Chunk] = []
    buf: List[str] = []
    buf_len = 0

    def flush(paragraph_index_end: int) -> None:
        nonlocal buf, buf_len
        if not buf:
            return
        text = "\n\n".join(buf).strip()
        if not text:
            return
        chunks.append(
            Chunk(
                id=stable_id(doc.url, str(paragraph_index_end), text[:200]),
                text=text,
                metadata={
                    "url": doc.url,
                    "title": doc.title,
                    "publication": doc.publication,
                    "language": doc.language,
                    "date": doc.date,
                    "paragraph_end": paragraph_index_end,
                },
            )
        )
        buf = []
        buf_len = 0

    for i, paragraph in enumerate(doc.paragraphs):
        paragraph = paragraph.strip()
        if not paragraph:
            continue

        if buf and buf_len + len(paragraph) + 2 > max_chars:
            flush(i)
            if overlap_chars > 0:
                tail: List[str] = []
                tail_len = 0
                for prev in reversed(doc.paragraphs[max(0, i - 8):i]):
                    prev = prev.strip()
                    if not prev:
                        continue
                    if tail and tail_len + len(prev) + 2 > overlap_chars:
                        break
                    tail.insert(0, prev)
                    tail_len += len(prev) + 2
                buf = tail
                buf_len = sum(len(x) + 2 for x in buf)

        buf.append(paragraph)
        buf_len += len(paragraph) + 2

    flush(len(doc.paragraphs))
    return chunks
