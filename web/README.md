# JW Research - Web Frontend

Next.js 15 chat UI for a personal RAG system over JW Library content. It embeds the
user question on a NVIDIA DGX Spark (OpenAI-compatible endpoint), queries a Qdrant
collection, MMR re-ranks the results, and streams a grounded answer with inline
citations and a Sources panel.

## Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS + shadcn-style UI primitives
- Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/react`)
- Qdrant for vector search
- DGX Spark for embeddings (BAAI/bge-large-en-v1.5) and LLM (`jw-llm`)

## Local development

1. Copy env:
   ```
   cp .env.example .env.local
   ```
   Fill in `DGX_LLM_URL`, `DGX_EMBED_URL`, `DGX_EMBED_MODEL`, `DGX_API_KEY`,
   `QDRANT_URL`, `QDRANT_API_KEY`.

2. Install and run:
   ```
   npm install
   npm run dev
   ```
   Open http://localhost:3000

## Required env vars

See `.env.example`. All of these must be set in any environment:

- `DGX_LLM_URL` - OpenAI-compatible base URL for the chat model
- `DGX_EMBED_URL` - OpenAI-compatible base URL for embeddings
- `DGX_EMBED_MODEL` - defaults to `BAAI/bge-large-en-v1.5`
- `DGX_API_KEY` - bearer key for both endpoints
- `QDRANT_URL` - Qdrant base URL
- `QDRANT_API_KEY` - Qdrant API key

The Qdrant collection name is hardcoded to `jw_research`.

## Deploy on Vercel

1. Push the repo to GitHub (already done).
2. On Vercel, import the project and set the Root Directory to `web`.
3. Add every env var from `.env.example` in Project Settings -> Environment Variables.
4. Deploy. The chat is served at `/` and the streaming endpoint at `/api/chat`.

## Notes

- No authentication. Put this behind Vercel Password Protection or your own
  auth layer if needed.
- The DGX endpoints must be reachable from Vercel's serverless region. If your
  DGX is on a private network, expose it via Tailscale Funnel, Cloudflare
  Tunnel, or run this app on your own infra.
