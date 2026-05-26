# indexer

Python indexing pipeline:

1. Read crawler output JSONL
2. Parse & clean HTML
3. Chunk into passages
4. Embed via OpenAI-compatible embeddings endpoint (DGX)
5. Upsert into Qdrant

## Quickstart

```bash
cd indexer
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m indexer.pipeline --input ../data/crawl/latest.jsonl
```

### Environment

See `.env.example`.
