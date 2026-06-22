"""Ingest EPUB + PDF publications into Qdrant via the existing indexer stack.

Usage:
    cd /home/admin/Documents/JW_Research        # project root
    # put .pdf / .epub files in indexer/data/books/
    python -m indexer.ingest_files
    # options:
    python -m indexer.ingest_files --books-dir indexer/data/books --batch-size 16 \
        --max-chars 1200 --overlap-chars 150

Reuses your existing code:
  - indexer.embedder.EmbeddingClient
  - indexer.pipeline.ensure_collection / upsert_chunks
  - indexer.chunker.Chunk  (we build Chunk objects directly from extracted text)

Why a separate text chunker here:
  chunk_doc() expects a parsed-HTML "doc". Books are plain text, so we chunk the
  text directly and emit the SAME Chunk shape your upsert already understands.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import re
import uuid
from pathlib import Path
from typing import Iterable, List

from dotenv import load_dotenv

from .chunker import Chunk
from .embedder import EmbeddingClient
from .indexer.pipeline import ensure_collection, upsert_chunks

# A stable namespace so re-ingesting the same file updates (not duplicates) points.
_NS = uuid.UUID("6f9619ff-8b86-d011-b42d-00c04fc964ff")


def _clean(text: str) -> str:
    """Normalize whitespace and line endings."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_pdf(path: Path) -> str:
    """Extract text from PDF via pymupdf (fitz)."""
    import fitz  # pymupdf

    parts = []
    with fitz.open(path) as doc:
        for page in doc:
            parts.append(page.get_text("text"))
    return _clean("\n".join(parts))


def extract_epub(path: Path) -> str:
    """Extract text from EPUB via ebooklib or zipfile fallback."""
    # Try ebooklib first; fall back to unzip+bs4 if unavailable.
    try:
        from ebooklib import epub, ITEM_DOCUMENT

        from bs4 import BeautifulSoup

        book = epub.read_epub(str(path))
        parts = []
        for item in book.get_items_of_type(ITEM_DOCUMENT):
            soup = BeautifulSoup(item.get_content(), "html.parser")
            parts.append(soup.get_text("\n"))
        return _clean("\n".join(parts))
    except Exception:
        import zipfile

        from bs4 import BeautifulSoup

        parts = []
        with zipfile.ZipFile(path) as z:
            for name in z.namelist():
                if name.lower().endswith((".xhtml", ".html", ".htm")):
                    soup = BeautifulSoup(z.read(name), "html.parser")
                    parts.append(soup.get_text("\n"))
        return _clean("\n".join(parts))


def extract(path: Path) -> str:
    """Dispatch to appropriate extractor based on file suffix."""
    suf = path.suffix.lower()
    if suf == ".pdf":
        return extract_pdf(path)
    if suf == ".epub":
        return extract_epub(path)
    raise ValueError(f"unsupported file type: {path}")


def chunk_text(text: str, max_chars: int, overlap_chars: int) -> List[str]:
    """Paragraph-aware sliding window chunking."""
    if not text:
        return []
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks, buf = [], ""
    for p in paras:
        if len(buf) + len(p) + 2 <= max_chars:
            buf = f"{buf}\n\n{p}" if buf else p
        else:
            if buf:
                chunks.append(buf)
            if len(p) <= max_chars:
                buf = p
            else:
                # hard-split an oversized paragraph
                start = 0
                while start < len(p):
                    chunks.append(p[start : start + max_chars])
                    start += max_chars - overlap_chars
                buf = ""
    if buf:
        chunks.append(buf)

    # add overlap between adjacent chunks
    if overlap_chars > 0 and len(chunks) > 1:
        out = [chunks[0]]
        for i in range(1, len(chunks)):
            tail = chunks[i - 1][-overlap_chars:]
            out.append((tail + "\n" + chunks[i]).strip())
        chunks = out
    return chunks


def build_chunks(
    path: Path, text: str, max_chars: int, overlap_chars: int
) -> List[Chunk]:
    """Convert extracted text into Chunk objects with metadata."""
    title = path.stem
    pieces = chunk_text(text, max_chars, overlap_chars)
    chunks: List[Chunk] = []
    for i, piece in enumerate(pieces):
        pid = str(uuid.uuid5(_NS, f"{path.name}:{i}"))
        meta = {
            "url": f"file://{path.name}",
            "title": title,
            "publication": title,
            "language": "en",
            "date": None,
            "source": "book",
            "source_file": path.name,
            "chunk_index": i,
        }
        chunks.append(Chunk(id=pid, text=piece, metadata=meta))
    return chunks


def iter_files(books_dir: Path) -> Iterable[Path]:
    """Yield all .pdf and .epub files in books_dir (recursive)."""
    for p in sorted(books_dir.rglob("*")):
        if p.suffix.lower() in (".pdf", ".epub"):
            yield p


def main() -> None:
    """Main CLI entrypoint."""
    load_dotenv()
    ap = argparse.ArgumentParser(description="Ingest EPUB/PDF books into Qdrant")
    ap.add_argument("--books-dir", default="indexer/data/books")
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--max-chars", type=int, default=1200)
    ap.add_argument("--overlap-chars", type=int, default=150)
    args = ap.parse_args()

    qdrant_url = os.getenv("QDRANT_URL")
    if not qdrant_url:
        raise SystemExit("QDRANT_URL must be set")
    qdrant_key = os.getenv("QDRANT_API_KEY")

    books_dir = Path(args.books_dir)
    if not books_dir.exists():
        raise SystemExit(f"books dir not found: {books_dir}")

    embed = EmbeddingClient()

    files = list(iter_files(books_dir))
    if not files:
        print(f"[info] no .pdf/.epub files in {books_dir}", flush=True)
        return

    total_chunks = 0
    for path in files:
        try:
            text = extract(path)
        except Exception as e:
            print(f"[skip] {path.name}: extract failed: {e}", flush=True)
            continue
        if not text:
            print(f"[skip] {path.name}: no text extracted", flush=True)
            continue

        chunks = build_chunks(path, text, args.max_chars, args.overlap_chars)
        print(
            f"[{path.name}] {len(text)} chars -> {len(chunks)} chunks", flush=True
        )

        # embed + upsert in batches
        for start in range(0, len(chunks), args.batch_size):
            batch = chunks[start : start + args.batch_size]
            vectors = embed.embed([c.text for c in batch], batch_size=args.batch_size)
            if not vectors:
                print(f"  [warn] empty embeddings for batch at {start}", flush=True)
                continue
            ensure_collection(qdrant_url, qdrant_key, dim=len(vectors[0]))
            upsert_chunks(qdrant_url, qdrant_key, batch, vectors)
            total_chunks += len(batch)
            print(f"  upserted {start + len(batch)}/{len(chunks)}", flush=True)

    print(
        f"\nDone. {len(files)} files, {total_chunks} chunks upserted.", flush=True
    )


if __name__ == "__main__":
    main()
