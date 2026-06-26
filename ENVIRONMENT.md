# Environment Variables Reference

This document lists all environment variables used in the JW Research retrieval pipeline.

## Web API (Next.js)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NVIDIA_API_KEY` | Yes | - | API key for NVIDIA NIM services |
| `NVIDIA_EMBED_URL` | No | `https://integrate.api.nvidia.com/v1` | Embedding API endpoint |
| `NVIDIA_EMBED_MODEL` | No | `NV-Embed-QA` | Embedding model name |
| `QDRANT_URL` | Yes | - | Qdrant vector database URL |
| `QDRANT_COLLECTION` | No | `jw_research` | Qdrant collection name |
| `QDRANT_API_KEY` | No | - | Qdrant API key |
| `NVIDIA_LLM_URL` | No | `https://integrate.api.nvidia.com/v1` | LLM API endpoint |
| `NVIDIA_MODEL` | No | `qwen/qwen3.5-397b-a17b` | LLM model name |
| `NVIDIA_USE_FALLBACK_MODEL` | No | `false` | Switch chat to the fallback model |
| `NVIDIA_FALLBACK_MODEL` | No | `nvidia/nemotron-3-ultra-550b-a55b` | Fallback chat model name |
| `NVIDIA_FALLBACK_ENABLE_THINKING` | No | `true` | Enable Nemotron thinking template kwargs |
| `NVIDIA_FALLBACK_REASONING_BUDGET` | No | `16384` | Nemotron reasoning budget |
| `JW_LIVE_INGEST_ENABLED` | No | `true` | Enable live URL ingestion |
| `JW_LIVE_INGEST_MAX_URLS` | No | `2` | Max URLs to ingest per request |
| `JW_LIVE_INGEST_MAX_CHUNKS` | No | `6` | Max chunks per ingested URL |
| `JW_USER_AGENT` | No | `JW_Research_Personal_Bot/0.1` | User agent for crawling |

## Indexer (Python)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `QDRANT_URL` | Yes | - | Qdrant vector database URL |
| `QDRANT_COLLECTION` | No | `jw_research` | Qdrant collection name |
| `QDRANT_API_KEY` | No | - | Qdrant API key |
| `NVIDIA_EMBED_URL` | No | `https://integrate.api.nvidia.com/v1` | Embedding API endpoint |
| `NVIDIA_EMBED_MODEL` | No | `NV-Embed-QA` | Embedding model name |
| `NVIDIA_API_KEY` | Yes | - | API key for NVIDIA NIM services |

## Infrastructure (Docker Compose)

| Variable | Required | Description |
|----------|----------|-------------|
| `QDRANT_URL` | Yes | Qdrant URL (set in compose) |
| `QDRANT_API_KEY` | No | Qdrant API key |
| `QDRANT_COLLECTION` | No | Collection name |
| `NVIDIA_EMBED_URL` | Yes | Embedding service URL |
| `NVIDIA_EMBED_MODEL` | No | Embedding model |
| `NVIDIA_API_KEY` | Yes | API key for all NVIDIA services |
| `HF_TOKEN` | No | HuggingFace token for vLLM |
| `DGX_API_KEY` | Yes | Main API key for DGX services |
| `CLOUDFLARE_TUNNEL_TOKEN` | Yes | Cloudflare tunnel token |

## API Endpoints

The pipeline uses these endpoint patterns:

### Embedding
- `{NVIDIA_EMBED_URL}/embeddings`
- `{NVIDIA_EMBED_URL}/v1/embeddings`

### Vector Search
- `{QDRANT_URL}/collections/{COLLECTION}/points/search`
- `{QDRANT_URL}/collections/{COLLECTION}/points?wait=true` (upsert)

### LLM
- `{NVIDIA_LLM_URL}/chat/completions`

## Environment Setup

### Development
```bash
# Required
export NVIDIA_API_KEY="your-key"
export QDRANT_URL="http://localhost:6333"
export NVIDIA_EMBED_URL="http://localhost:8001"
export NVIDIA_LLM_URL="http://localhost:8000/v1"
```

### Production (Vercel) with Cloudflare Tunnel
```bash
# Set in Vercel Dashboard → Environment Variables
NVIDIA_API_KEY=<your-nvidia-api-key>
QDRANT_URL=https://qdrant.theocracy.me
NVIDIA_LLM_URL=https://llm.theocracy.me
NVIDIA_EMBED_URL=https://embed.theocracy.me
NVIDIA_USE_FALLBACK_MODEL=true
NVIDIA_FALLBACK_MODEL=nvidia/nemotron-3-ultra-550b-a55b
```

### DGX Server (Docker Compose)
```bash
# Export before running docker compose up
export CLOUDFLARE_TUNNEL_TOKEN="<tunnel-token-from-cloudflare-dashboard>"
export DGX_API_KEY="<api-key-for-vllm-and-embeddings>"
export HF_TOKEN="<hugging-face-token-for-model-downloads>"
export QDRANT_API_KEY="<optional-qdrant-api-key>"

# Start services
cd infra && docker compose up -d
```
