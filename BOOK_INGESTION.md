# Book Ingestion Pipeline - Implementation Summary

## Files Created

### 1. `/home/admin/Documents/JW_Research/indexer/indexer/ingest_files.py`
- **Purpose**: Ingest EPUB + PDF publications into Qdrant
- **Type**: Python module (runnable as `python -m indexer.ingest_files`)
- **Key Functions**:
  - `extract_pdf(path)` - Uses pymupdf (fitz) to extract text
  - `extract_epub(path)` - Uses ebooklib + BeautifulSoup with zipfile fallback
  - `chunk_text(text, max_chars, overlap_chars)` - Paragraph-aware chunking
  - `build_chunks(path, text, max_chars, overlap_chars)` - Creates Chunk objects with metadata
  - `main()` - CLI with argparse

**Usage**:
```bash
cd /home/admin/Documents/JW_Research
# Basic: ingest all .pdf/.epub files in indexer/data/books/
python -m indexer.ingest_files

# With options:
python -m indexer.ingest_files \
  --books-dir indexer/data/books \
  --batch-size 16 \
  --max-chars 1200 \
  --overlap-chars 150
```

**Integration**:
- Imports from `indexer.chunker.Chunk`
- Imports from `indexer.embedder.EmbeddingClient` 
- Imports from `indexer.pipeline.ensure_collection` and `upsert_chunks`
- Uses a stable UUID namespace so re-ingesting the same file updates (not duplicates) Qdrant points

---

### 2. `/home/admin/Documents/JW_Research/download_pubs.py`
- **Purpose**: Download JW publications (EPUB, English) via the pub-media API
- **Type**: Standalone CLI script (stdlib only, no internal dependencies)
- **Key Functions**:
  - `fetch_links(pub, issue)` - Queries API with retry/timeout
  - `epub_entries(data)` - Extracts .epub URLs from API response
  - `md5(path)` - Verifies checksums
  - `download(url, out_dir, checksum)` - Downloads with resume + checksum verification
  - `magazine_issues(start, end)` - Generator for (pub, issue) tuples
  - `main()` - Orchestrates magazine + book downloads

**Usage**:
```bash
cd /home/admin/Documents/JW_Research

# Full scope (magazines 2000-2026 + all books):
python download_pubs.py

# Magazines only, specific date range:
python download_pubs.py --start 2015 --end 2026 --only magazines

# Books only:
python download_pubs.py --only books

# Custom output directory:
python download_pubs.py --out /custom/path/to/books

# With custom request delay:
python download_pubs.py --delay 2.0
```

**Features**:
- Magazines: Watchtower (w, wp), Awake! (g) for 2000-2026
- Books: 25 pub codes (bh, bhs, lff, jy, lr, lvs, cl, cf, jd, ip-1, ip-2, re, rr, yp1, yp2, fy, gf, kr, sjj, od, sgd, scl, ed, gt, ll, hl)
- Resume support: Checks existing files, skips if checksum matches
- Official pub-media API: `https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS`

**Output**:
- Downloads to `indexer/data/books/` (default) in EPUB format
- Ready to be ingested by `ingest_files.py`

---

## Directory Structure

```
JW_Research/
├── download_pubs.py                      ← NEW: standalone tool (run from root)
├── indexer/
│   ├── __init__.py
│   ├── chunker.py
│   ├── embedder.py
│   ├── parser.py
│   ├── requirements.txt                  ← UPDATED: added pymupdf, ebooklib
│   ├── data/
│   │   └── books/                        ← NEW: created for downloads + ingestion
│   └── indexer/
│       ├── __init__.py
│       ├── chunker.py
│       ├── embedder.py
│       ├── parser.py
│       ├── pipeline.py
│       └── ingest_files.py               ← NEW: module for ingesting PDFs/EPUBs
└── crawler/
    └── ...
```

---

## Dependencies Added

Updated `indexer/requirements.txt` with:
- `pymupdf==1.24.1` - For PDF text extraction
- `ebooklib==0.18.0` - For EPUB extraction

Install with:
```bash
cd /home/admin/Documents/JW_Research/indexer
pip install -r requirements.txt
```

---

## Workflow: Download → Ingest → Search

1. **Download books**:
   ```bash
   python download_pubs.py
   # Downloads 2000-2026 magazines + all major books to indexer/data/books/
   ```

2. **Ingest into Qdrant**:
   ```bash
   python -m indexer.ingest_files
   # Reads .epub/.pdf from indexer/data/books/, chunks them, embeds via NVIDIA API
   # Upserts chunks into Qdrant (creates points with stable IDs for updates)
   ```

3. **Chat uses indexed content**:
   - Web chat endpoint `/api/chat` now searches Qdrant corpus
   - Results include both crawled pages + ingested book content
   - Source attribution via `x-jw-sources` header

---

## Key Design Decisions

1. **Stable UUID namespace**: File → chunk ID mapping via `uuid.uuid5(_NS, f"{path.name}:{i}")` ensures re-ingesting updates existing points (idempotent)

2. **Metadata structure**: Each chunk carries:
   - `source: "book"` (vs "web" for crawler)
   - `source_file: filename` (for provenance)
   - `chunk_index: i` (for ordering)
   - `publication`, `title`, `url`, `language`, `date` (for retrieval context)

3. **Paragraph-aware chunking**: Respects paragraph boundaries up to max_chars, adds overlap for context

4. **API-driven downloads**: Uses official jw-cdn pub-media API (no scraping needed)

5. **Resume support**: Checks MD5 checksums; skips existing files to allow restart without re-downloading

---

## Next Steps (Optional)

1. **Automate downloads**: Add systemd timer (similar to crawler) to run `download_pubs.py` weekly/monthly
2. **Selective ingestion**: Pass `--only magazines` to `download_pubs.py` for incremental updates
3. **Book selection**: Extend `BOOK_PUBS` list in `download_pubs.py` with additional titles
4. **Monitoring**: Check Qdrant collection stats after ingestion: `curl http://localhost:6333/collections/jw_research`
