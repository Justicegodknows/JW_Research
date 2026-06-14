# JW_Research Project TODOs

## Active Tasks

- [ ] M2 - Trigger the Crawler (crawler/) to fetch data from wol.jw.org
- [ ] M3 - Implement Parser + Chunker (indexer/parser.py) for parsing HTML and creating chunks
- [ ] M4 - Implement Embeddings + Qdrant (indexer/embed.py) for embedding and upserting to vector DB
- [ ] M5 - Verify Next.js chat integration works with retrieval

## Completed

- [x] Fix TypeScript deprecation error in web/tsconfig.json (added ignoreDeprecations: "6.0")

## Next Steps

1. Run the scraper's crawler to collect HTML from wol.jw.org
2. Parse the raw HTML and create text chunks using chunker.py
3. Generate embeddings and upsert to Qdrant
4. Test the chat API with retrieval
