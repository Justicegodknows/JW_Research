#!/usr/bin/env python3
"""Download JW publications (EPUB, English) via the pub-media API into a folder.

Scope: Watchtower (study=w, public=wp), Awake! (g), and a list of book pub codes.
Range: 2000-2026 for magazines.

Reliable because it uses the official media API:
  GET https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS
      ?output=json&pub=<code>&issue=<YYYYMM00|YYYYMMDD>&fileformat=EPUB
      &langwritten=E&txtCMSLang=E

Then downloads files.E.EPUB[].file.url to OUT_DIR, verifying md5 checksum,
and skipping anything already present (resumable).

Usage:
    python download_pubs.py                          # full scope, 2000-2026
    python download_pubs.py --start 2015 --end 2026  # magazines only that range
    python download_pubs.py --only books             # just the book list
    python download_pubs.py --only magazines
    python download_pubs.py --out indexer/data/books
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
import urllib.request
from pathlib import Path

API = "https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS"
UA = "Mozilla/5.0 (personal study; polite)"

# --- Book pub codes (common English titles available as EPUB). Extend freely. ---
BOOK_PUBS = [
    "bh",  # What Does the Bible Really Teach?
    "bhs",  # What Can the Bible Teach Us?
    "lff",  # Enjoy Life Forever!
    "jy",  # Jesus - The Way, the Truth, the Life
    "lr",  # Learn From the Great Teacher
    "lvs",  # How to Remain in God's Love
    "cl",  # Draw Close to Jehovah
    "cf",  # The Bible's Message
    "jd",  # God's Kingdom Rules!
    "ip-1",
    "ip-2",  # Isaiah's Prophecy
    "re",  # Revelation - Its Grand Climax
    "rr",  # Pure Worship of Jehovah Restored
    "yp1",
    "yp2",  # Young People Ask vol 1/2
    "fy",  # The Secret of Family Happiness
    "gf",  # God's Love
    "kr",  # Kingdom Proclaimers (Pt 1)
    "sjj",  # Sing Out Joyfully (songbook)
    "od",  # Organized to Do Jehovah's Will
    "sgd",  # Shepherd the Flock
    "scl",  # The Watchtower / study guides (varies)
    "ed",  # Education book
    "gt",  # Good News From God
    "ll",  # Listen to God and Live Forever
    "hl",  # Happy Life brochure
]


def fetch_links(pub: str, issue: str | None) -> dict | None:
    """Query the pub-media API for a given publication and issue."""
    q = f"{API}?output=json&fileformat=EPUB&langwritten=E&txtCMSLang=E&pub={pub}"
    if issue:
        q += f"&issue={issue}"
    req = urllib.request.Request(q, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            data = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print(f"  [err] {pub} {issue or ''}: {e}", flush=True)
        return None
    # API returns a list with a 404 object when not found
    if isinstance(data, list):
        return None
    return data


def epub_entries(data: dict):
    """Extract .epub file entries from API response."""
    files = (data.get("files") or {}).get("E", {}).get("EPUB", []) or []
    for f in files:
        url = (f.get("file") or {}).get("url")
        if url:
            yield url, (f.get("file") or {}).get("checksum"), f.get("filesize")


def md5(path: Path) -> str:
    """Compute MD5 checksum of a file."""
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for blk in iter(lambda: fh.read(1 << 20), b""):
            h.update(blk)
    return h.hexdigest()


def download(url: str, out_dir: Path, checksum: str | None) -> str:
    """Download a file to out_dir, verify checksum, skip if already present.
    
    Returns: 'skip-ok' (checksum match), 'skip-exists' (no checksum to verify),
             'downloaded' (newly downloaded), 'checksum-fail' (mismatch).
    """
    name = url.split("/")[-1].split("?")[0]
    dest = out_dir / name
    if dest.exists():
        if checksum and md5(dest) == checksum:
            return "skip-ok"
        if not checksum:
            return "skip-exists"
        # checksum mismatch -> redownload
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as fh:
        while True:
            blk = r.read(1 << 20)
            if not blk:
                break
            fh.write(blk)
    if checksum and md5(tmp) != checksum:
        tmp.unlink(missing_ok=True)
        return "checksum-fail"
    tmp.rename(dest)
    return "downloaded"


def magazine_issues(start: int, end: int):
    """Yield (pub, issue) for Watchtower study/public and Awake!, 2000-2026.

    Pre-2008 Watchtower was semi-monthly (01 and 15); we try both.
    Public/study split began 2008; before that 'w' covers it.
    """
    for year in range(start, end + 1):
        for month in range(1, 13):
            ym = f"{year}{month:02d}"
            if year < 2008:
                # semi-monthly Watchtower + Awake!
                for day in ("01", "15"):
                    yield "w", f"{ym}{day}"
                    yield "g", f"{ym}{day}"
            else:
                yield "w", f"{ym}00"  # study
                yield "wp", f"{ym}00"  # public
                yield "g", f"{ym}00"  # Awake!


def main():
    """Main CLI entrypoint."""
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="indexer/data/books")
    ap.add_argument("--start", type=int, default=2000)
    ap.add_argument("--end", type=int, default=2026)
    ap.add_argument("--delay", type=float, default=1.5, help="seconds between requests")
    ap.add_argument(
        "--only", choices=["magazines", "books"], default=None, help="scope"
    )
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    stats = {
        "downloaded": 0,
        "skip-ok": 0,
        "skip-exists": 0,
        "checksum-fail": 0,
        "miss": 0,
    }

    def handle(pub, issue, label):
        data = fetch_links(pub, issue)
        if not data:
            stats["miss"] += 1
            return
        got = False
        for url, checksum, size in epub_entries(data):
            got = True
            res = download(url, out_dir, checksum)
            stats[res] = stats.get(res, 0) + 1
            mb = (size or 0) / 1e6
            print(
                f"  [{res:11}] {label}: {url.split('/')[-1]} ({mb:.1f} MB)",
                flush=True,
            )
            time.sleep(args.delay)
        if not got:
            stats["miss"] += 1
        time.sleep(args.delay)

    if args.only != "books":
        print(f"== Magazines {args.start}-{args.end} ==", flush=True)
        for pub, issue in magazine_issues(args.start, args.end):
            handle(pub, issue, f"{pub} {issue}")

    if args.only != "magazines":
        print("== Books ==", flush=True)
        for pub in BOOK_PUBS:
            handle(pub, None, f"book:{pub}")

    print("\n=== Summary ===", flush=True)
    for k, v in stats.items():
        print(f"  {k:13}: {v}", flush=True)
    print(f"\nFiles now in {out_dir}:", len(list(out_dir.glob("*.epub"))), flush=True)


if __name__ == "__main__":
    main()
