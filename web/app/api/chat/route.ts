import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type CoreMessage } from "ai";
import { embedQuery } from "@/lib/embed";
import { qdrantSearch } from "@/lib/qdrant";
import { mmrRerank } from "@/lib/mmr";
import { liveFetchAndIngest } from "@/lib/liveIngest";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

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
    "Help users answer questions using ONLY content indexed from this project\u2019s JW-only crawler (jw.org and wol.jw.org).\n\n" +
    "Hard boundaries (non-negotiable):\n" +
    "1) Use ONLY the numbered context below. Do not use outside knowledge.\n" +
    "2) Do not browse the web. Do not claim you fetched pages live.\n" +
    "3) If the context is insufficient, reply EXACTLY: \"I cannot answer this from the provided sources.\"\n" +
    "4) Cite every factual claim inline using bracketed numbers like [1], [2] matching the context items.\n" +
    "5) Do not fabricate quotations, titles, publications, dates, URLs, or references.\n\n" +
    "Answer style:\n" +
    "- Be concise, neutral, and accurate.\n" +
    "- Prefer direct quotations when it improves precision, in double quotes, with a citation.\n\n" +
    "Context:\n" +
    contextBlock
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { messages: ChatMessage[] };
    const backendUrl = (process.env.BACKEND_URL || "").trim();

    // Optional production mode: forward chat traffic to an external backend
    // (for example, a Cloudflare-routed backend) instead of running local RAG.
    if (backendUrl) {
      let shouldProxy = true;
      try {
        const incoming = new URL(req.url);
        const configured = new URL(backendUrl);
        if (incoming.origin === configured.origin) {
          shouldProxy = false;
        }
      } catch {
        shouldProxy = true;
      }

      if (shouldProxy) {
        const target = backendUrl.replace(/\/$/, "") + "/api/chat";
        const upstream = await fetch(target, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const headers = new Headers(upstream.headers);
        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers,
        });
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

    // 2. Top-k=8 from Qdrant, then MMR re-rank to 6.
    const raw = await qdrantSearch(qvec, 8);
    const ranked = mmrRerank(qvec, raw, 6, 0.6);

    // 3. Build a numbered context block and the system prompt.
    const contextBlock = ranked
      .map((c, i) => {
        const header =
          "[" +
          (i + 1) +
          "] " +
          c.title +
          (c.publication ? " - " + c.publication : "") +
          (c.url ? " (" + c.url + ")" : "");
        return header + "\n" + c.text;
      })
      .join("\n\n---\n\n");

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
      temperature: 0.2,
      maxRetries: 0,
    });

    // Expose sources to the client via a custom header carrying JSON.
    const sources = ranked.map((c, i) => ({
      n: i + 1,
      title: c.title,
      publication: c.publication,
      url: c.url,
      score: c.score,
    }));

    const response = result.toDataStreamResponse();
    response.headers.set("x-jw-sources", encodeURIComponent(JSON.stringify(sources)));
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/chat failed:", message);
    return Response.json(
      {
        error: "Chat backend failed",
        detail: message,
        hint: "Verify NVIDIA_EMBED_URL, NVIDIA_EMBED_MODEL, QDRANT_URL, and related service availability.",
      },
      { status: 500 }
    );
  }
}
