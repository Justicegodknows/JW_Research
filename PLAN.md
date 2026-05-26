# Project Plan

Each milestone becomes a GitHub Issue and is delivered via a Pull Request.

## M1 - Repo scaffold
- README, PLAN, ARCHITECTURE, LICENSE, .gitignore
- infra/docker-compose.yml with Qdrant and vLLM
- Talisman pre-commit hook

## M2 - Crawler (crawler/)
- Scrapy spider starting at https://wol.jw.org/en/wol/library/r1/lp-e/all-publications
- Follows publication -> chapter -> paragraph pages
- Respects robots.txt, 1 req/sec, randomized delay, ETag/Last-Modified caching
- Stores raw HTML + URL + fetched_at in data/raw/
- CLI: python -m crawler.run --since YYYY-MM-DD

## M3 - Parser + chunker (indexer/parser.py)
- BS4 extraction: title, publication, year, paragraph numbers, URL fragment
- Clean to markdown
- Chunking: ~800 tokens, 100 token overlap, never splits a paragraph
- Output: JSONL with {id, text, metadata}

## M4 - Embeddings + Qdrant (indexer/embed.py, indexer/upsert.py)
- Embed via OpenAI-compatible endpoint on DGX (bge-large-en-v1.5, 1024 dims)
- Upsert into Qdrant collection jw_research (cosine, payload index)
- Idempotent: re-runs only embed new/changed chunks (sha256 hash check)

## M5 - Next.js chat (web/)
- Next.js 15 + Tailwind + shadcn/ui (DONE by web-developer sub-agent)
- /api/chat route uses Vercel AI SDK streamText
- Provider: createOpenAI({ baseURL: process.env.DGX_LLM_URL })
- Retrieval: top-k=8 from Qdrant, MMR re-ranking to 6
- Cites every answer with source URL + paragraph number

## M6 - Cloudflare Tunnel (infra/cloudflared/)
- config.yml exposes qdrant, llm, embed hostnames
- Vercel env vars point at the tunnel hostnames

## M7 - Weekly cron (.github/workflows/weekly-crawl.yml)
- Runs 0 3 * * 1 (Mondays 03:00 UTC)
- crawl -> diff -> re-embed only changed -> upsert

## M8 - Hardening
- Talisman + gitleaks in CI
- Rate-limit middleware on /api/chat
- README privacy and ToS notice
- Smoke tests with Vitest + Playwright
