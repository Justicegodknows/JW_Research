// Embeds text using NVIDIA NIM (OpenAI-compatible /v1/embeddings endpoint).
export async function embedQuery(text: string): Promise<number[]> {
  const url = process.env.NVIDIA_EMBED_URL || "https://integrate.api.nvidia.com/v1";
  const model = process.env.NVIDIA_EMBED_MODEL || "NV-Embed-QA";
  const key = process.env.NVIDIA_API_KEY;
  if (!key) {
    throw new Error("NVIDIA_API_KEY must be set");
  }

  const endpoint = url.replace(/\/$/, "") + "/embeddings";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + key
    },
    body: JSON.stringify({ model, input: [text] })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error("Embedding request failed: " + res.status + " " + body);
  }

  const json = (await res.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
  };
  if (!json.data || json.data.length === 0) {
    throw new Error("Embedding response missing data");
  }

  // Sort by index to ensure correct order (matches Python implementation)
  const sortedData = json.data.sort((a, b) => a.index - b.index);
  return sortedData[0].embedding;
}
