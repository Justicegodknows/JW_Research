# Local Deployment (DGX Spark) - Testing Only

This project's production setup uses Vercel + Cloudflare Tunnel + DGX docker-compose.
For local testing on your DGX Spark (or any dev box), use the SEPARATE local
compose file added in `infra/docker-compose.local.yml`.

## Goals
- Run the web app locally (Next.js dev server)
- Run Qdrant locally (no auth)
- Keep production infra unchanged

## Prereqs
- Docker + Docker Compose

## Setup
1) Create a local env file:
- Copy `infra/.env.local.example` to `infra/.env.local`
- Fill `NVIDIA_LLM_URL`, `NVIDIA_EMBED_URL`, and `NVIDIA_API_KEY`

2) Start local stack:
```bash
cd infra
docker compose -f docker-compose.local.yml --env-file .env.local up --build
```

The local env file also supports the chat fallback model settings used by the web app:
`NVIDIA_USE_FALLBACK_MODEL`, `NVIDIA_FALLBACK_MODEL`,
`NVIDIA_FALLBACK_ENABLE_THINKING`, and `NVIDIA_FALLBACK_REASONING_BUDGET`.

3) Open:
- http://localhost:3000

## Notes
- The web app talks to Qdrant at `http://qdrant:6333` inside the compose network.
- Live JW ingest is enabled by default (small limits). If jw.org starts blocking,
  set `JW_LIVE_INGEST_ENABLED=false` or reduce the `JW_LIVE_INGEST_MAX_*` values.
- This local stack does NOT run cloudflared and does NOT run the GPU vllm/embed
  containers. Point `NVIDIA_*` at your DGX endpoints (or any OpenAI-compatible
  server) so the web app can embed + chat.
