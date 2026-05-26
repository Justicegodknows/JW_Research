export type Chunk = {
  id: string | number;
  score: number;
  text: string;
  title: string;
  publication: string;
  url: string;
  vector: number[];
};

const COLLECTION = "jw_research";

export async function qdrantSearch(
  vector: number[],
  topK: number
): Promise<Chunk[]> {
  const base = process.env.QDRANT_URL;
  const key = process.env.QDRANT_API_KEY;
  if (!base || !key) {
    throw new Error("QDRANT_URL and QDRANT_API_KEY must be set");
  }

  const endpoint =
    base.replace(/\/$/, "") + "/collections/" + COLLECTION + "/points/search";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": key
    },
    body: JSON.stringify({
      vector,
      limit: topK,
      with_payload: true,
      with_vector: true
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error("Qdrant search failed: " + res.status + " " + body);
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
      vector: vec
    };
  });
}
