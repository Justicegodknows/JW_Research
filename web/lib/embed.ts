// Embeds text using an OpenAI-compatible embeddings endpoint.
//
// Supported:
// - NVIDIA NIM (often base URL ends with /v1)
// - TEI OpenAI-compatible server (commonly /v1/embeddings)
// - vLLM OpenAI server (commonly /v1/embeddings)
//
// This function is defensive about URL shapes because a common misconfig is
// setting NVIDIA_EMBED_URL to include "/v1" while the server expects it, or
// setting it without "/v1" while the code assumes it.
export async function embedQuery(text: string): Promise<number[]> {
  const base = process.env.NVIDIA_EMBED_URL || "https://integrate.api.nvidia.com/v1";
  const model = process.env.NVIDIA_EMBED_MODEL || "NV-Embed-QA";
  const key = process.env.NVIDIA_API_KEY;
  if (!key) {
    throw new Error("NVIDIA_API_KEY must be set");
  }

  // Try multiple endpoint variants to avoid 404s due to base URL differences.
  const trimmed = base.replace(/\/$/, "");
  const candidates = Array.from(
    new Set([
      // If base already ends with /v1
      trimmed + "/embeddings",
      // If base is host only
      trimmed + "/v1/embeddings",
      // If base mistakenly contains /v1/v1
      trimmed.replace(/\/v1$/, "") + "/v1/embeddings",
    ])
  );

  let lastError: string | null = null;
  for (const endpoint of candidates) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + key,
      },
      body: JSON.stringify({ model, input: [text] }),
    });

    if (res.ok) {
      const json = (await res.json()) as {
        data: Array<{ embedding: number[]; index: number }>;
      };
      if (!json.data || json.data.length === 0) {
        throw new Error("Embedding response missing data");
      }
      const sortedData = json.data.sort((a, b) => a.index - b.index);
      return sortedData[0].embedding;
    }

    const body = await res.text();
    // If we got a 404, try the next candidate. Otherwise fail fast.
    if (res.status !== 404) {
      throw new Error(
        "Embedding request failed: " + res.status + " " + body + " (endpoint: " + endpoint + ")"
      );
    }
    lastError = body;
  }

  throw new Error(
    "Embedding request failed: 404 " +
      (lastError || "not found") +
      " (tried: " +
      candidates.join(", ") +
      ")"
  );
}
