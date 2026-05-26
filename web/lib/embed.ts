// Embeds text using an OpenAI-compatible /v1/embeddings endpoint on DGX Spark.
export async function embedQuery(text: string): Promise<number[]> {
  const url = process.env.DGX_EMBED_URL;
  const model = process.env.DGX_EMBED_MODEL || "BAAI/bge-large-en-v1.5";
  const key = process.env.DGX_API_KEY;
  if (!url || !key) {
    throw new Error("DGX_EMBED_URL and DGX_API_KEY must be set");
  }

  const endpoint = url.replace(/\/$/, "") + "/embeddings";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + key
    },
    body: JSON.stringify({ model, input: text })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error("Embedding request failed: " + res.status + " " + body);
  }

  const json = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  if (!json.data || !json.data[0]) {
    throw new Error("Embedding response missing data");
  }
  return json.data[0].embedding;
}
