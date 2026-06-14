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
export NVIDIA_LLM_URL="http://localhost:8000"
```

### Production (Vercel)
```bash
# These should be set in Vercel dashboard
NVIDIA_API_KEY
QDRANT_URL (pointing to Cloudflare tunnel)
NVIDIA_LLM_URL (pointing to Cloudflare tunnel)
```

### DGX Server
```bash
# In docker-compose environment
HF_TOKEN
DGX_API_KEY
CLOUDFLARE_TUNNEL_TOKEN
