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
function isLocalUrl(url: string): boolean {
  return url.includes("localhost") || url.includes("127.0.0.1");
}

export async function embedQuery(text: string): Promise<number[]> {
  const base =
    process.env.NVIDIA_EMBED_URL || "https://integrate.api.nvidia.com/v1";
  const model = process.env.NVIDIA_EMBED_MODEL || "NV-Embed-QA";
  const key = process.env.NVIDIA_API_KEY;
  const timeoutMs = Number(process.env.NVIDIA_EMBED_TIMEOUT_MS || "15000");

  // Allow empty API key for local development
  if (!key && !isLocalUrl(base)) {
    throw new Error("NVIDIA_API_KEY must be set");
  }

  // Try multiple endpoint variants to avoid 404s due to base URL differences.
  const trimmed = base.replace(/\/$/, "");
  const isLocal = isLocalUrl(trimmed);

  // For local TEI (Text Embeddings Inference), the base is just host:port
  // For NVIDIA NIM or vLLM, base typically ends with /v1
  const noV1Base = trimmed.replace(/\/v1$/, "");
  const candidates = Array.from(
    new Set([
      // Host + /embeddings (works for TEI and some hosted gateways)
      noV1Base + "/embeddings",
      // Host + /v1/embeddings (OpenAI-compatible default)
      noV1Base + "/v1/embeddings",
      // Preserve exact base shape with /embeddings for custom deployments
      trimmed + "/embeddings",
    ]),
  );

  let lastError: string | null = null;
  for (const endpoint of candidates) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (key) {
      headers["Authorization"] = "Bearer " + key;
    }

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ model, input: [text] }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const lower = message.toLowerCase();
      if (lower.includes("timeout") || lower.includes("abort")) {
        throw new Error(
          "Embedding request timed out after " +
            timeoutMs +
            "ms (endpoint: " +
            endpoint +
            ")",
        );
      }
      throw new Error(
        "Embedding request transport failed: " +
          message +
          " (endpoint: " +
          endpoint +
          ")",
      );
    }

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
        "Embedding request failed: " +
          res.status +
          " " +
          body +
          " (endpoint: " +
          endpoint +
          ")",
      );
    }
    lastError = body;
  }

  throw new Error(
    "Embedding request failed: 404 " +
      (lastError || "not found") +
      " (tried: " +
      candidates.join(", ") +
      ")",
  );
}
