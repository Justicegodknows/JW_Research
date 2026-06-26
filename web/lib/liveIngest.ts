// JW-only live fetch + ingest helper.
//
// IMPORTANT POLICY:
// - We may fetch live pages from jw.org / wol.jw.org.
// - But the assistant must ONLY answer from indexed chunks in Qdrant.
//
// So this helper does: fetch -> chunk -> embed -> upsert.

import { embedQuery } from "./embed";

const JW_HOSTS = new Set(["www.jw.org", "wol.jw.org"]);

function isAllowedJwUrl(u: string): boolean {
  try {
    const url = new URL(u);
    if (!JW_HOSTS.has(url.hostname)) return false;

    // Force https.
    if (url.protocol !== "https:") return false;

    // Basic path allowlist to avoid obvious junk.
    const p = url.pathname || "/";

    // Keep to English content areas.
    const isEnglish = p.startsWith("/en/") || p.includes("/lp-e/") || p.includes("/r1/");
    if (!isEnglish) return false;

    // Avoid large/binary assets.
    const lower = p.toLowerCase();
    if (
      lower.endsWith(".pdf") ||
      lower.endsWith(".mp3") ||
      lower.endsWith(".mp4") ||
      lower.endsWith(".zip") ||
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg") ||
      lower.endsWith(".png") ||
      lower.endsWith(".gif") ||
      lower.endsWith(".svg")
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function stripHtmlToText(html: string): { title: string; text: string } {
  // Very lightweight HTML-to-text extraction (no DOM libs in route).
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = ((titleMatch && titleMatch[1]) || "").replace(/\s+/g, " ").trim();

  // Remove scripts/styles.
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  // Remove tags.
  s = s.replace(/<[^>]+>/g, " ");
  // Decode a couple common entities.
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  s = s.replace(/\s+/g, " ").trim();

  return { title, text: s };
}

function chunkText(text: string, maxChars = 1200, overlap = 150): string[] {
  const out: string[] = [];
  const clean = text.trim();
  if (!clean) return out;

  let i = 0;
  while (i < clean.length) {
    const end = Math.min(clean.length, i + maxChars);
    const chunk = clean.slice(i, end).trim();
    if (chunk) out.push(chunk);
    if (end >= clean.length) break;
    i = Math.max(0, end - overlap);
  }
  return out;
}

function isLocalUrl(url: string): boolean {
  return url.includes("localhost") || url.includes("127.0.0.1");
}

async function qdrantUpsert(points: Array<{ id: string; vector: number[]; payload: any }>) {
  const base = process.env.QDRANT_URL;
  if (!base) throw new Error("QDRANT_URL must be set");
  const timeoutMs = Number(process.env.QDRANT_TIMEOUT_MS || "5000");
  const collection = process.env.QDRANT_COLLECTION || "jw_research";

  const endpoint =
    base.replace(/\/$/, "") + "/collections/" + collection + "/points?wait=true";

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = process.env.QDRANT_API_KEY;
  const isLocal = isLocalUrl(base);
  if (key || isLocal) {
    if (key) headers["api-key"] = key;
  }

  const res = await fetch(endpoint, {
    method: "PUT",
    headers,
    body: JSON.stringify({ points }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error("Qdrant upsert failed: " + res.status + " " + body);
  }
}

export async function liveFetchAndIngest(url: string): Promise<{ ingested: number }> {
  if (!isAllowedJwUrl(url)) {
    return { ingested: 0 };
  }

  const timeoutMs = Number(process.env.JW_LIVE_INGEST_TIMEOUT_MS || "8000");

  // Polite fetch: single page, no aggressive parallelism.
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent":
        process.env.JW_USER_AGENT ||
        "JW_Research_Personal_Bot/0.1 (private study; contact: owner)",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    // Live ingest is best-effort.
    return { ingested: 0 };
  }

  const html = await res.text();
  const extracted = stripHtmlToText(html);
  if (!extracted.text || extracted.text.length < 200) return { ingested: 0 };

  const chunks = chunkText(extracted.text);
  if (chunks.length === 0) return { ingested: 0 };

  // Embed & upsert.
  const points: Array<{ id: string; vector: number[]; payload: any }> = [];
  const maxChunks = Number(process.env.JW_LIVE_INGEST_MAX_CHUNKS || "6");
  for (let i = 0; i < Math.min(chunks.length, maxChunks); i++) {
    const c = chunks[i];
    const vec = await embedQuery(c);

    // Create deterministic ids from URL + chunk index.
    // Using base64 (not URL-safe) is fine for Qdrant ids as strings.
    const id = "live:" + Buffer.from(url + "#" + i).toString("base64");

    points.push({
      id,
      vector: vec,
      payload: {
        url,
        title: extracted.title || "Untitled",
        publication: "",
        language: "en",
        source: "live",
        text: c,
      },
    });
  }

  await qdrantUpsert(points);
  return { ingested: points.length };
}
