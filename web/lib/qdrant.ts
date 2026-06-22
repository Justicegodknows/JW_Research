export type Chunk = {
  id: string | number;
  score: number;
  text: string;
  title: string;
  publication: string;
  url: string;
  source?: string;
  sourceFile?: string;
  vector: number[];
};

const COLLECTION = process.env.QDRANT_COLLECTION || "jw_research";

function isLocalUrl(url: string): boolean {
  return url.includes("localhost") || url.includes("127.0.0.1");
}

export async function qdrantSearch(
  vector: number[],
  topK: number,
  filter?: Record<string, unknown>
): Promise<Chunk[]> {
  const base = process.env.QDRANT_URL;
  const timeoutMs = Number(process.env.QDRANT_TIMEOUT_MS || "5000");
  if (!base) {
    throw new Error("QDRANT_URL must be set");
  }

  const isLocal = isLocalUrl(base);
  const endpoint =
    base.replace(/\/$/, "") + "/collections/" + COLLECTION + "/points/search";

  const key = process.env.QDRANT_API_KEY;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  // Only require API key for non-local connections
  if (key || isLocal) {
    if (key) headers["api-key"] = key;
  }

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        vector,
        limit: topK,
        filter,
        with_payload: true,
        with_vector: true,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const lower = message.toLowerCase();
    if (lower.includes("timeout") || lower.includes("abort")) {
      throw new Error("Qdrant search timed out after " + timeoutMs + "ms (endpoint: " + endpoint + ")");
    }
    throw new Error("Qdrant search transport failed: " + message + " (endpoint: " + endpoint + ")");
  }

  if (!res.ok) {
    const body = await res.text();
    const trimmed = body.trimStart();
    const isHtml = trimmed.startsWith("<!") || trimmed.toLowerCase().startsWith("<html");
    const detail = isHtml
      ? `gateway/proxy error — the Qdrant host is unreachable (endpoint: ${endpoint})`
      : body.slice(0, 300);
    throw new Error(`Qdrant search failed with status ${res.status}: ${detail}`);
  }

  const json = (await res.json()) as {
    result: Array<{
      id: string | number;
      score: number;
      payload?: Record<string, unknown>;
      vector?: number[] | { [k: string]: number[] };
    }>;
  };

  return (json.result || []).map((p) => {
    const payload = (p.payload || {}) as Record<string, unknown>;
    let vec: number[] = [];
    if (Array.isArray(p.vector)) vec = p.vector as number[];
    else if (p.vector && typeof p.vector === "object") {
      const first = Object.values(p.vector)[0];
      if (Array.isArray(first)) vec = first as number[];
    }
    return {
      id: p.id,
      score: p.score,
      text: String(payload.text || payload.content || ""),
      title: String(payload.title || "Untitled"),
      publication: String(payload.publication || payload.pub || ""),
      url: String(payload.url || ""),
      source: String(payload.source || "web"),
      sourceFile: String(payload.source_file || ""),
      vector: vec,
    };
  });
}
