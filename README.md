# JW_Research

A personal Retrieval-Augmented Generation (RAG) system over the JW Library
content at https://wol.jw.org/en and https://www.jw.org/en.

> Personal use only. Content is crawled and indexed strictly for the owner's
> private study. Nothing is republished. All copyrights remain with their
> respective owners (Watch Tower Bible and Tract Society).

## Stack

| Layer        | Choice                                                      |
|--------------|-------------------------------------------------------------|
| Crawler      | Python + Scrapy + httpx                                     |
| Parser       | BeautifulSoup, markdown chunker with rich metadata          |
| Embeddings   | BAAI/bge-large-en-v1.5 (local, on NVIDIA DGX Spark)         |
| LLM          | Qwen2.5-14B-Instruct via vLLM (OpenAI-compatible) on DGX    |
| Vector DB    | Qdrant (self-hosted, Docker, on DGX)                        |
| Backend      | Next.js 15 route handlers + Vercel AI SDK (@ai-sdk/openai)  |
| Frontend     | Next.js 15 chat UI, deployed on Vercel                      |
| Tunnel       | Cloudflare Tunnel (Vercel to DGX Spark)                     |
| Scheduler    | GitHub Actions cron (every Monday 03:00 UTC)                |
| Secret scan  | Talisman pre-commit hook + gitleaks in CI                   |

## Repository layout

```
JW_Research/
  README.md
  PLAN.md
  ARCHITECTURE.md
  .github/workflows/    # weekly crawl cron + CI
  crawler/              # Scrapy project (English, all publications)
  indexer/              # chunk + embed + Qdrant upsert
  web/                  # Next.js app + Vercel AI SDK chat
  infra/                # docker-compose (Qdrant, vLLM), Cloudflare config
  docs/
```

## Quick start

1. `cd infra && docker compose up -d`  (Qdrant + vLLM on the DGX)
2. `cd crawler && pip install -r requirements.txt && python -m crawler.run`
3. `cd indexer && python -m indexer.pipeline`
4. `cd web && pnpm install && pnpm dev`

See `PLAN.md` for milestones and `ARCHITECTURE.md` for the data flow.

## License

Code: MIT. Indexed content remains the property of its copyright holders
and is not redistributed by this project.
