# AI Agent Instructions for JW_Research

This is a **personal RAG (Retrieval-Augmented Generation) system** over JW Library content. The codebase is a monorepo with three main components: a Scrapy crawler, a Python indexer pipeline, and a Next.js chat application.

## Quick Navigation

- **[README.md](README.md)** - Project overview, stack, quick start
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Data flow diagram, design decisions, security
- **[PLAN.md](PLAN.md)** - Milestones and implementation details
- **[ENVIRONMENT.md](ENVIRONMENT.md)** - Environment variables and endpoint configuration

## Monorepo Structure & Build Commands

This is a **monorepo** with three independent subsystems. Always `cd` to the correct directory before running commands:

| Directory | Language | Purpose | Key Commands |
|-----------|----------|---------|--------------|
| `web/` | TypeScript/Next.js 15 | Chat UI + streaming API | `npm run dev`, `npm run build`, `npm run test`, `npm run lint` |
| `crawler/` | Python 3 + Scrapy | Web scraper for jw.org | `python -m crawler.run [--since YYYY-MM-DD]`, `pip install -r requirements.txt` |
| `indexer/` | Python 3 | Chunking + embedding pipeline | `python -m indexer.pipeline`, `pip install -r requirements.txt` |
| `infra/` | Docker Compose | Local services (Qdrant, vLLM) | `docker compose up -d`, `docker compose down` |

**Root-level convenience scripts** exist in `package.json` but delegate to `web/`:
```bash
npm run dev      # Starts web dev server
npm run build    # Builds web app
npm run start    # Runs web production build
npm run test     # Runs web tests
```

## Environment & Infrastructure

### Local Development
The project expects **local ML services** (Qdrant vector DB, LLM via vLLM or NVIDIA NIM). See [ENVIRONMENT.md](ENVIRONMENT.md) for all variables.

**Critical variables**:
- `NVIDIA_API_KEY` or local endpoint setup
- `QDRANT_URL` (e.g., `http://localhost:6333`)
- `NVIDIA_EMBED_URL`, `NVIDIA_LLM_URL`

Local development typically uses:
```bash
# Terminal 1: Start infrastructure
cd infra && docker compose up -d

# Terminal 2: Start web dev server
cd web && npm run dev
```

### Production (Vercel)
- Web frontend deploys to Vercel (via GitHub Actions or manual push)
- Backend API hits DGX services through **Cloudflare Tunnel** (no open ports)
- Weekly crawl triggered by GitHub Actions cron (Mondays 03:00 UTC)

## Data Flow & Component Boundaries

```
wol.jw.org / jw.org  →  [crawler/]  →  raw HTML  →  [indexer/parser]
     ↓
   chunks (markdown)  →  [indexer/embed]  →  vectors  →  Qdrant
     ↑
   user query  ←  [web/api/chat]  ←  MMR re-ranked top-k results  ←  Qdrant
     ↑
   streaming tokens from vLLM/NVIDIA NIM via Vercel AI SDK
```

### Key Modules
- **crawler/spiders/wol_spider.py** - Scrapy spider traversing jw.org hierarchy
- **indexer/chunker.py** - Markdown splitter with metadata preservation
- **indexer/embedder.py** - OpenAI-compatible embedding calls
- **web/app/api/chat/route.ts** - Streaming chat handler using Vercel AI SDK
- **web/lib/qdrant.ts** - Qdrant search (top-k + MMR re-ranking)

## Development Patterns & Conventions

### Web (TypeScript/Next.js)
- **Framework**: Next.js 15 with React 19, TypeScript
- **Styling**: Tailwind + shadcn/ui components
- **API**: Route handlers in `app/api/` with streaming support
- **Testing**: Jest with ts-jest, test files use `.test.ts`
- **Linting**: ESLint + `next lint`
- **Module paths**: Use `@/` alias for imports from `lib/`

### Crawler (Python)
- **Framework**: Scrapy for async crawling
- **Dependencies**: requests via httpx, parsing via BeautifulSoup
- **Storage**: Raw HTML cached in `data/raw/`, respects robots.txt
- **Run**: `python -m crawler.run` with optional `--since` date filter
- **Caching**: ETag/Last-Modified headers to minimize re-fetches

### Indexer (Python)
- **Pipeline**: Parse → chunk → embed → upsert
- **Input**: JSONL from crawler (raw HTML + metadata)
- **Output**: Upserted vectors in Qdrant with rich payloads (publication, year, etc.)
- **Idempotency**: Re-runs only process changed chunks via SHA256 comparison
- **Run**: `python -m indexer.pipeline`

### Infrastructure
- **Qdrant**: Self-hosted on DGX, cosine similarity, 1024-dim vectors (bge-large-en-v1.5)
- **LLM**: Qwen2.5-14B via vLLM or NVIDIA NIM (OpenAI-compatible protocol)
- **Tunnel**: Cloudflare Tunnel in `infra/cloudflared/config.yml`
- **Secret scanning**: Talisman pre-commit + gitleaks in CI

## Common Development Tasks

### Add a New Feature to the Chat UI
1. Start: `cd web && npm run dev`
2. Modify files in `web/app/` or `web/components/`
3. Test: `npm run test` and `npm run lint`
4. Check streaming response in `web/app/api/chat/route.ts`

### Modify Chunking or Embeddings
1. Edit `indexer/chunker.py` or `indexer/embedder.py`
2. Test locally: `cd infra && docker compose up -d` (ensure Qdrant + LLM are running)
3. Run: `cd indexer && python -m indexer.pipeline` to re-index a small subset
4. Verify results in web chat

### Crawl New Content
1. Ensure infra is up: `cd infra && docker compose up -d`
2. Run: `cd crawler && python -m crawler.run --since 2024-01-01` (optional date filter)
3. Monitor `data/raw/` for new HTML files
4. Then re-index: `cd indexer && python -m indexer.pipeline`

### Deploy to Production
1. Merge PR to `main` (triggers GitHub Actions)
2. Web builds and deploys to Vercel automatically
3. Verify Cloudflare Tunnel is still active on DGX
4. Check Vercel logs for backend connectivity issues

## Important Context

### Privacy & Licensing
- This is **personal use only** — content is for the owner's private study
- No content is republished; all copyrights remain with Watch Tower Bible and Tract Society
- Code is MIT licensed

### Security Notes
- **Secrets**: Use Talisman + gitleaks to prevent API key leaks (DGX_API_KEY, NVIDIA_API_KEY)
- **Rate limiting**: `/api/chat` has IP-based rate limiting via Vercel KV
- **DGX access**: Protected by bearer token; Cloudflare Tunnel adds TLS layer
- **Source attribution**: Every answer cites URL + paragraph number

## Debugging

### VS Code launch configurations (`.vscode/launch.json`)

| Config name | What it debugs |
|---|---|
| `Next.js: debug server` | Launches `npm run dev` in `web/` with `--inspect` and attaches Chrome DevTools |
| `Next.js: attach to running dev server` | Attaches to an already-running `next dev` on port 9229 |
| `Python: crawler (wol spider)` | Runs `crawler.run` limited to 10 items via debugpy |
| `Python: indexer pipeline` | Runs `indexer.pipeline` end-to-end via debugpy |
| `Python: download_pubs` | Runs `download_pubs.py --only books` via debugpy |
| `Python: main.py web_search` | Runs `main.py web_search` tool with a sample query |
| `Python: attach to remote debugpy` | Attaches to a remote/container debugpy on port 5678 |
| `Jest: run all web tests` | Launches Jest in the `web/` directory with breakpoint support |
| `Playwright: debug E2E tests` | Runs Playwright tests with the interactive debugger |

### Installing debug dependencies

**Python** (all Python components share the crawler venv):
```bash
cd crawler && pip install debugpy  # or: pip install -r requirements.txt
```
`debugpy>=1.8.0` is now listed in `crawler/requirements.txt`.

**Node.js/Next.js**: The VS Code built-in Node debugger (`ms-vscode.js-debug`) works without extra packages. Install recommended extensions from `.vscode/extensions.json`:
```
Extensions: Install Workspace Recommended Extensions
```

### Python debugpy — quick remote attach
```python
import debugpy
debugpy.listen(5678)
debugpy.wait_for_client()  # pauses until VS Code attaches
```
Then launch `Python: attach to remote debugpy` in VS Code.

### Recommended VS Code extensions

All recommendations are in [.vscode/extensions.json](.vscode/extensions.json):
- **ms-python.python** + **ms-python.debugpy** — Python language server and debugger
- **charliermarsh.ruff** — fast Python linter/formatter
- **dbaeumer.vscode-eslint** + **esbenp.prettier-vscode** — TypeScript/React linting
- **firsttris.vscode-jest-runner** — run individual Jest tests with one click
- **ms-playwright.playwright** — Playwright test runner integration
- **usernamehw.errorlens** — inline error highlighting

## When to Ask for Help

- **Unsure which component to modify?** → See [ARCHITECTURE.md](ARCHITECTURE.md) data flow
- **Missing environment variable?** → Check [ENVIRONMENT.md](ENVIRONMENT.md)
- **Deployment failing?** → Verify Cloudflare Tunnel token and DGX connectivity
- **Tests failing?** → See milestones in [PLAN.md](PLAN.md) for expected test coverage
