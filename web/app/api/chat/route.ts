import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type CoreMessage } from "ai";
import { embedQuery } from "@/lib/embed";
import { qdrantSearch } from "@/lib/qdrant";
import { mmrRerank } from "@/lib/mmr";
import { liveFetchAndIngest } from "@/lib/liveIngest";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_METHODS = "POST, OPTIONS, GET";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": ALLOWED_METHODS,
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

export async function GET() {
  return Response.json(
    {
      ok: true,
      route: "/api/chat",
      message: "Use POST with a JSON body containing messages.",
      allowedMethods: ["POST", "OPTIONS", "GET"],
    },
    {
      status: 200,
      headers: {
        Allow: ALLOWED_METHODS,
        ...CORS_HEADERS,
      },
    }
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: ALLOWED_METHODS,
      ...CORS_HEADERS,
    },
  });
}

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type SourceKind = "book" | "web";

function getSourceKind(source: string): SourceKind {
  return source === "book" ? "book" : "web";
}

function interleaveBySource<T>(books: T[], webs: T[], target: number): T[] {
  const out: T[] = [];
  let bi = 0;
  let wi = 0;

  while (out.length < target && (bi < books.length || wi < webs.length)) {
    if (bi < books.length) {
      out.push(books[bi++]);
      if (out.length >= target) break;
    }
    if (wi < webs.length) {
      out.push(webs[wi++]);
    }
  }

  return out;
}

function buildContextEntries(
  ranked: Array<{
    title: string;
    publication: string;
    url: string;
    text: string;
    source?: string;
  }>,
  budgetChars: number
) {
  const entries: string[] = [];
  const keptIndices: number[] = [];
  let used = 0;

  for (let i = 0; i < ranked.length; i++) {
    const c = ranked[i];
    const sourceLabel = getSourceKind(c.source || "web");
    const header =
      "[" +
      (entries.length + 1) +
      "] " +
      c.title +
      (c.publication ? " - " + c.publication : "") +
      (c.url ? " (" + c.url + ")" : "") +
      " {source=" +
      sourceLabel +
      "}";

    const remaining = Math.max(0, budgetChars - used);
    if (remaining <= 0) break;

    const separatorCost = entries.length > 0 ? "\n\n---\n\n".length : 0;
    const maxText = Math.max(0, remaining - separatorCost - header.length - 1);
    if (maxText <= 0) break;

    const body = c.text.slice(0, maxText);
    if (!body.trim()) continue;

    entries.push(header + "\n" + body);
    keptIndices.push(i);
    used += separatorCost + header.length + 1 + body.length;
  }

  return {
    contextBlock: entries.join("\n\n---\n\n"),
    keptIndices,
  };
}

function extractJwUrls(text: string): string[] {
  const urls: string[] = [];
  const re = /(https?:\/\/[^\s)\]]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    urls.push(m[1]);
  }
  return urls;
}

function buildSystemPrompt(contextBlock: string): string {
  return (
    "You are JW Research, a careful retrieval-augmented assistant.\n\n" +
    "Mission:\n" +
    "Help users answer questions using ONLY content indexed in this project from JW sources (jw.org and wol.jw.org), including both scraped pages and downloaded publications.\n\n" +
    "Hard boundaries (non-negotiable):\n" +
    "1) Use ONLY the numbered context below. Do not use outside knowledge.\n" +
    "2) Do not browse the web. Do not claim you fetched pages live.\n" +
    "3) If the context is insufficient, reply EXACTLY: \"I cannot answer this from the provided sources.\"\n" +
    "4) Cite every factual claim inline using bracketed numbers like [1], [2] matching the context items.\n" +
    "5) Do not fabricate quotations, titles, publications, dates, URLs, or references.\n\n" +
    "Answer style:\n" +
    "- Be concise, neutral, accurate, and insightful.\n" +
    "- Prefer direct quotations when it improves precision, in double quotes, with a citation.\n\n" +
    "Context:\n" +
    contextBlock
  );
}

function isTimeoutLikeError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof DOMException) {
    return err.name === "TimeoutError" || err.name === "AbortError";
  }
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  return (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("abort") ||
    lower.includes("aborted")
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { messages: ChatMessage[] };
    const backendUrl = (process.env.BACKEND_URL || "").trim();
    const backendPath = (process.env.BACKEND_CHAT_PATH || "/api/chat").trim() || "/api/chat";
    const allowLocalFallback = (process.env.BACKEND_ALLOW_LOCAL_FALLBACK || "true") === "true";
    const proxyHop = req.headers.get("x-jw-proxy-hop") === "1";

    // Optional production mode: forward chat traffic to an external backend
    // (for example, a Cloudflare-routed backend) instead of running local RAG.
    if (backendUrl && !proxyHop) {
      const shouldProxy = true;

      if (shouldProxy) {
        const normalizedPath = backendPath.startsWith("/") ? backendPath : "/" + backendPath;
        const target = backendUrl.replace(/\/$/, "") + normalizedPath;
        const proxyTimeoutMs = Number(process.env.BACKEND_PROXY_TIMEOUT_MS || "5000");
        try {
          const upstream = await fetch(target, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-jw-proxy-hop": "1",
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(proxyTimeoutMs),
          });

          if (!upstream.ok) {
            const shouldForceLocalFallback = upstream.status === 404 || upstream.status === 405;
            if (!allowLocalFallback && !shouldForceLocalFallback) {
              const headers = new Headers(upstream.headers);
              return new Response(upstream.body, {
                status: upstream.status,
                statusText: upstream.statusText,
                headers,
              });
            }

            const allow = upstream.headers.get("allow") || "";
            console.warn(
              "Proxy backend returned non-OK; falling back to local RAG.",
              JSON.stringify({ status: upstream.status, allow, forced: shouldForceLocalFallback })
            );
          } else {
            const headers = new Headers(upstream.headers);
            return new Response(upstream.body, {
              status: upstream.status,
              statusText: upstream.statusText,
              headers,
            });
          }
        } catch (proxyErr) {
          const message = proxyErr instanceof Error ? proxyErr.message : String(proxyErr);
          const timeout = isTimeoutLikeError(proxyErr);
          if (!allowLocalFallback) {
            return Response.json(
              {
                error: "Proxy backend failed",
                detail: message,
                target,
                hint: timeout
                  ? "Proxy timeout to DGX backend. Verify Cloudflare Tunnel route and backend health."
                  : "Proxy connection to DGX backend failed. Verify BACKEND_URL/BACKEND_CHAT_PATH and network reachability.",
              },
              { status: timeout ? 504 : 502 }
            );
          }

          console.warn(
            "Proxy backend request failed; falling back to local RAG.",
            JSON.stringify({ target, message })
          );
        }
      }
    }

    const messages = body.messages || [];

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) {
      return new Response("No user message", { status: 400 });
    }

    // Live JW-only ingest (best-effort) BEFORE retrieval.
    // Policy: We still answer ONLY from Qdrant chunks; live fetch just populates Qdrant.
    const liveEnabled = (process.env.JW_LIVE_INGEST_ENABLED || "true") === "true";
    if (liveEnabled) {
      const candidates = extractJwUrls(lastUser.content);
      const maxUrls = Number(process.env.JW_LIVE_INGEST_MAX_URLS || "2");
      for (const u of candidates.slice(0, maxUrls)) {
        try {
          await liveFetchAndIngest(u);
        } catch {
          // ignore
        }
      }
    }

    // 1. Embed the latest user question.
    const qvec = await embedQuery(lastUser.content);

    // 2. Deep retrieval + source-aware blend (books + scraped pages).
    const retrievalTopK = Number(process.env.JW_RETRIEVAL_TOP_K || "120");
    const finalK = Number(process.env.JW_RETRIEVAL_FINAL_K || "12");
    const lambda = Number(process.env.JW_RETRIEVAL_MMR_LAMBDA || "0.58");

    const raw = await qdrantSearch(qvec, retrievalTopK);
    const bookCandidates = raw.filter((c) => getSourceKind(c.source || "web") === "book");
    const webCandidates = raw.filter((c) => getSourceKind(c.source || "web") === "web");

    const bookQuota = Math.floor(finalK / 2);
    const webQuota = finalK - bookQuota;

    const bookRanked = mmrRerank(
      qvec,
      bookCandidates,
      Math.min(bookCandidates.length, bookQuota * 3),
      lambda
    );
    const webRanked = mmrRerank(
      qvec,
      webCandidates,
      Math.min(webCandidates.length, webQuota * 3),
      lambda
    );

    let ranked = interleaveBySource(
      bookRanked.slice(0, bookQuota),
      webRanked.slice(0, webQuota),
      finalK
    );

    if (ranked.length < finalK) {
      const fallback = mmrRerank(qvec, raw, finalK * 2, lambda);
      const seen = new Set(ranked.map((c) => String(c.id)));
      for (const c of fallback) {
        if (ranked.length >= finalK) break;
        const key = String(c.id);
        if (seen.has(key)) continue;
        ranked.push(c);
        seen.add(key);
      }
    }

    // 3. Build prompt context with explicit budget (default 5000 chars).
    const contextBudgetChars = Number(process.env.JW_CONTEXT_BUDGET_CHARS || "5000");
    const { contextBlock, keptIndices } = buildContextEntries(ranked, contextBudgetChars);
    ranked = keptIndices.map((i) => ranked[i]);

    const system = buildSystemPrompt(contextBlock);

    // 4. Stream the answer via NVIDIA NIM (OpenAI-compatible).
    const nvidia = createOpenAI({
      baseURL: process.env.NVIDIA_LLM_URL || "https://integrate.api.nvidia.com/v1",
      apiKey: process.env.NVIDIA_API_KEY || "",
    });

    const coreMessages: CoreMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const result = streamText({
      model: nvidia(process.env.NVIDIA_MODEL || "qwen/qwen3.5-397b-a17b"),
      system,
      messages: coreMessages,
      temperature: Number(process.env.JW_CHAT_TEMPERATURE || "1.25"),
      topP: Number(process.env.JW_CHAT_TOP_P || "0.98"),
      topK: Number(process.env.JW_CHAT_TOP_K || "60"),
      maxTokens: 16384,
      presencePenalty: Number(process.env.JW_CHAT_PRESENCE_PENALTY || "0.6"),
      frequencyPenalty: Number(process.env.JW_CHAT_FREQUENCY_PENALTY || "0.3"),
      maxRetries: 0,
    });

    const isWebSource = (c: { url: string; source?: string }) => {
      const url = String(c.url || "");
      const isWebUrl =
        url.startsWith("https://www.jw.org") ||
        url.startsWith("https://jw.org") ||
        url.startsWith("https://wol.jw.org") ||
        url.startsWith("https://www.wol.jw.org");
      return isWebUrl && !url.startsWith("file://") && (c.source || "web") !== "book";
    };

    // Expose sources to the client via a custom header carrying JSON.
    const sourcesRanked = ranked.filter(isWebSource);
    const sourcesFallback = raw.filter(isWebSource).slice(0, 6);
    const sources = (sourcesRanked.length > 0 ? sourcesRanked : sourcesFallback).map((c, i) => ({
      n: i + 1,
      title: c.title,
      publication: c.publication,
      url: c.url,
      source: c.source,
      sourceFile: c.sourceFile,
      score: c.score,
    }));

    const response = result.toDataStreamResponse();
    response.headers.set("x-jw-sources", encodeURIComponent(JSON.stringify(sources)));
    response.headers.set("Allow", ALLOWED_METHODS);
    response.headers.set("Access-Control-Allow-Origin", CORS_HEADERS["Access-Control-Allow-Origin"]);
    response.headers.set("Access-Control-Allow-Methods", CORS_HEADERS["Access-Control-Allow-Methods"]);
    response.headers.set("Access-Control-Allow-Headers", CORS_HEADERS["Access-Control-Allow-Headers"]);
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const timeout = isTimeoutLikeError(err);
    console.error("/api/chat failed:", message);
    return Response.json(
      {
        error: "Chat backend failed",
        detail: message,
        hint: timeout
          ? "Upstream service timeout. Verify NVIDIA_EMBED_URL/NVIDIA_EMBED_MODEL, QDRANT_URL, firewall allowlists, and timeout env vars."
          : "Verify NVIDIA_EMBED_URL, NVIDIA_EMBED_MODEL, QDRANT_URL, and related service availability.",
      },
      {
        status: timeout ? 504 : 500,
        headers: {
          Allow: ALLOWED_METHODS,
          ...CORS_HEADERS,
        },
      }
    );
  }
}
