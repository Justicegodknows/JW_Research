from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path
from typing import Dict, Iterable, List, Set

import requests
from dotenv import load_dotenv

from .chunker import Chunk, chunk_doc
from .embedder import EmbeddingClient
from .parser import parse_wol_html


def iter_raw_items(raw_dir: Path) -> Iterable[Dict]:
    for p in sorted(raw_dir.glob("*.json")):
        try:
            yield json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue


def ensure_collection(qdrant_url: str, api_key: str | None, dim: int) -> None:
    headers = {}
    if api_key:
        headers["api-key"] = api_key

    name = os.getenv("QDRANT_COLLECTION", "jw_research")
    r = requests.get(
        f"{qdrant_url.rstrip('/')}/collections/{name}", headers=headers, timeout=30
    )
    if r.status_code == 200:
        return

    create = {
        "vectors": {"size": dim, "distance": "Cosine"},
    }
    rc = requests.put(
        f"{qdrant_url.rstrip('/')}/collections/{name}",
        headers={**headers, "Content-Type": "application/json"},
        json=create,
        timeout=60,
    )
    rc.raise_for_status()


def upsert_chunks(
    qdrant_url: str,
    api_key: str | None,
    chunks: List[Chunk],
    vectors: List[List[float]],
) -> None:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["api-key"] = api_key

    name = os.getenv("QDRANT_COLLECTION", "jw_research")

    points = []
    for c, v in zip(chunks, vectors):
        points.append(
            {
                "id": c.id,
                "vector": v,
                "payload": {**c.metadata, "text": c.text},
            }
        )

    payload = {"points": points}
    r = requests.put(
        f"{qdrant_url.rstrip('/')}/collections/{name}/points?wait=true",
        headers=headers,
        json=payload,
        timeout=120,
    )
    r.raise_for_status()


def _read_state(path: Path) -> Set[str]:
    if not path.exists():
        return set()
    try:
        return set(json.loads(path.read_text(encoding="utf-8")))
    except Exception:
        return set()


def _write_state(path: Path, seen: Set[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(sorted(seen)), encoding="utf-8")


def run_once(
    raw_dir: Path,
    state_path: Path,
    embed: EmbeddingClient,
    qdrant_url: str,
    qdrant_key: str | None,
    batch_size: int,
    max_chars: int,
    overlap_chars: int,
) -> int:
    seen = _read_state(state_path)

    to_embed_texts: List[str] = []
    to_embed_chunks: List[Chunk] = []
    new_files = 0

    for p in sorted(raw_dir.glob("*.json")):
        if str(p) in seen:
            continue

        try:
            item = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            seen.add(str(p))
            continue

        url = str(item.get("url", ""))
        html = str(item.get("html", ""))
        if not url or not html:
            seen.add(str(p))
            continue

        doc = parse_wol_html(html, url, language=str(item.get("language", "en")))
        chunks = chunk_doc(doc, max_chars=max_chars, overlap_chars=overlap_chars)

        for c in chunks:
            to_embed_chunks.append(c)
            to_embed_texts.append(c.text)

            if len(to_embed_texts) >= batch_size:
                vectors = embed.embed(to_embed_texts, batch_size=batch_size)
                if vectors:
                    ensure_collection(qdrant_url, qdrant_key, dim=len(vectors[0]))
                    upsert_chunks(qdrant_url, qdrant_key, to_embed_chunks, vectors)
                to_embed_texts = []
                to_embed_chunks = []

        seen.add(str(p))
        new_files += 1

    if to_embed_texts:
        vectors = embed.embed(to_embed_texts, batch_size=batch_size)
        if vectors:
            ensure_collection(qdrant_url, qdrant_key, dim=len(vectors[0]))
            upsert_chunks(qdrant_url, qdrant_key, to_embed_chunks, vectors)

    if new_files:
        _write_state(state_path, seen)

    return new_files


def main() -> None:
    load_dotenv()

    ap = argparse.ArgumentParser(
        description="Index crawler raw HTML JSON files into Qdrant (follow new files)"
    )
    ap.add_argument(
        "--raw-dir",
        type=str,
        default="../data/raw",
        help="Directory with crawler raw *.json files",
    )
    ap.add_argument("--state", type=str, default="data/indexer_state.json")
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--max-chars", type=int, default=1200)
    ap.add_argument("--overlap-chars", type=int, default=150)
    ap.add_argument(
        "--poll-seconds",
        type=int,
        default=30,
        help="How often to check for new raw files",
    )

    args = ap.parse_args()

    qdrant_url = os.getenv("QDRANT_URL")
    if not qdrant_url:
        raise SystemExit("QDRANT_URL must be set")
    qdrant_key = os.getenv("QDRANT_API_KEY")

    embed = EmbeddingClient()

    raw_dir = Path(args.raw_dir)
    if not raw_dir.exists():
        raise SystemExit(f"raw dir not found: {raw_dir}")

    state_path = Path(args.state)

    while True:
        new_files = run_once(
            raw_dir=raw_dir,
            state_path=state_path,
            embed=embed,
            qdrant_url=qdrant_url,
            qdrant_key=qdrant_key,
            batch_size=args.batch_size,
            max_chars=args.max_chars,
            overlap_chars=args.overlap_chars,
        )

        # If nothing new, sleep.
        if new_files == 0:
            time.sleep(max(5, args.poll_seconds))


if __name__ == "__main__":
    main()
