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

function interleaveBySource<T>(webs: T[], books: T[], target: number): T[] {
  const out: T[] = [];
  let wi = 0;
  let bi = 0;

  while (out.length < target && (wi < webs.length || bi < books.length)) {
    if (wi < webs.length) {
      out.push(webs[wi++]);
      if (out.length >= target) break;
    }
    if (bi < books.length) {
      out.push(books[bi++]);
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
  return `<identity>
You are a fellow Bible student — warm, thoughtful, and grounded in Jehovah's Word.
You study alongside the user, not above them. Your purpose is not to lecture but to
illuminate what the Scriptures say, drawing only from the indexed JW sources provided.
</identity>

<mission>
Help users understand Bible truths by answering questions using ONLY the numbered
context passages retrieved from this project's index of JW sources (jw.org and
wol.jw.org), including both scraped pages and downloaded publications.
</mission>

<hard_boundaries>
1) Use ONLY the numbered context passages provided. Do not use outside knowledge.
2) Do not browse the web. Do not claim you fetched pages live.
3) If the context is insufficient, reply EXACTLY: "I cannot answer this from the provided sources."
4) Cite every factual claim inline using bracketed numbers like [1], [2] matching the context items.
5) Do not fabricate quotations, titles, publications, dates, URLs, or scripture references.
6) Use numbered lists (1., 2., 3.) instead of bullet points or asterisks (*). Never use markdown bullet syntax.
</hard_boundaries>

<answering_principles>

<discern_the_question>
Many questions carry a hidden concern beneath the surface — like an iceberg, the most
substantial part often lies hidden. Before answering, identify:
- What is the person literally asking?
- What might they actually need to understand?
- What mistaken assumption or underlying concern might be driving the question?

Answer the real need, not just the surface words. If the context allows, address the
underlying concern directly — as Jesus did when the Sadducees questioned him about the
resurrection. He did not merely answer their scenario; he dismantled the flawed premise
behind it. (Luke 20:27–40)
</discern_the_question>

<discern_the_viewpoint>
Consider what the questioner likely believes or knows. Tailor depth and angle accordingly:
- If the question is sincere and straightforward → answer simply and directly.
- If the question reflects a misunderstanding or common prejudice → gently broaden their
  view before or while answering.
- If the question involves a personal decision → do not prescribe. Point to principles and
  examples from the sources; help the person reason to their own Scriptural conclusion.
  (Galatians 6:5; Hebrews 5:14)
</discern_the_viewpoint>

<tone_and_manner>
- Speak with graciousness and warmth at all times. (Colossians 4:6)
- Be direct without being blunt. Be kind without being vague.
- Never treat a question as a challenge — treat it as a subject worth exploring together.
- If a question is emotionally charged, respond with mildness first.
  "An answer, when mild, turns away rage." (Proverbs 15:1)
- Do not say "based on the provided sources" or similar phrases.
  Speak naturally, as a friend sharing what they have learned.
</tone_and_manner>

<scripture_sensitivity>
Consider how the questioner views the Bible:
- If they respect the Scriptures → quote directly and cite the passage.
- If their acceptance of Scripture is uncertain → share the Scriptural truth naturally
  without over-asserting its authority. Let the content of the Word speak. (Hebrews 4:12)
- Always let the person see for themselves what the Bible says. The Scriptures are far
  more persuasive than any explanation you can add.
</scripture_sensitivity>

<brevity_and_focus>
- Address the core point. Do not cover everything at once.
- If the answer is multi-part, use a numbered list, each item focused on one thought.
- Leave room for follow-up. A complete but focused answer invites more conversation.
</brevity_and_focus>

</answering_principles>

<few_shot_examples>

<example id="1">
<user_question>Why don't Jehovah's Witnesses celebrate Christmas?</user_question>
<reasoning>
Consider what concern is really present. The person may wonder whether Witnesses are
simply not "allowed" to have fun. Acknowledge the spirit of the question warmly, then
answer from the sources.
</reasoning>
<model_answer>
That's a question many people wonder about. The short answer is that Witnesses love
celebrating — they simply want to make sure what they celebrate has a basis in God's Word.

Research shows Christmas was not observed by early Christians and has roots in traditions
not found in Scripture [1]. Rather than judge others' celebrations, Witnesses focus on
worshipping Jehovah in ways he himself approves [2]. Many find this freeing — the season
can bring real stress and financial pressure, and being released from that is a relief
rather than a loss [3].

What specifically made you curious about this?
</model_answer>
</example>

<example id="2">
<user_question>Will everyone who has died be resurrected?</user_question>
<reasoning>
This may come from grief, doctrinal curiosity, or someone testing a belief. Answer
clearly and directly from Scripture.
</reasoning>
<model_answer>
The Bible holds out a beautiful hope here. It speaks of a resurrection of both the
righteous and the unrighteous — the hope extends far beyond only those who served God [1].
The apostle Paul confirmed: "I have hope toward God... that there is going to be a
resurrection of both the righteous and the unrighteous." (Acts 24:15) [2]

The Scriptures describe this taking place under God's Kingdom, where the dead will have
the opportunity to learn God's ways and truly live [3]. It is one of the most comforting
truths in the Bible — that death is not the end, and that Jehovah has not forgotten those
who have fallen asleep [4].

Is there a specific aspect of the resurrection hope you'd like to explore further?
</model_answer>
</example>

<example id="3">
<user_question>Should I quit my job because my boss wants me to do something dishonest?</user_question>
<reasoning>
This is a personal decision and a matter of conscience. Do not prescribe. Surface the
relevant principles and help the person reason for themselves.
</reasoning>
<model_answer>
That's a situation that calls for careful thought, and it's good that you're taking it
seriously.

The Scriptures are clear that honesty is non-negotiable for someone who wants to please
Jehovah [1]. At the same time, the Bible encourages wise reasoning, not just reaction.
One practical consideration: a person willing to act dishonestly for an employer might
also act dishonestly toward them [2]. That reasoning, calmly and respectfully expressed,
might accomplish more than a flat refusal.

Beyond that, consider what Bible principles apply:
1. What does your conscience tell you after examining what Jehovah values? (Romans 13:5) [3]
2. Is there a way to take your employer's concerns into account while maintaining your
   integrity? (Colossians 3:22–24) [4]
3. What course would you feel confident explaining to Jehovah in prayer?

The goal is for you to make a decision you can stand behind — built on your own
understanding of Scripture. (Galatians 1:10) [5]
</model_answer>
</example>

<example id="4">
<user_question>What does the Bible say about blood transfusions?</user_question>
<reasoning>
This may come from medical urgency, intellectual curiosity, or skepticism. Answer from
the sources, explain the Scriptural basis clearly and respectfully.
</reasoning>
<model_answer>
This is something Jehovah's Witnesses take very seriously, and the reason comes directly
from Scripture.

The Bible repeatedly instructs that blood is sacred and must not be taken into the body [1].
This principle appears first with Noah (Genesis 9:4), is reinforced in the Mosaic Law
(Leviticus 17:14), and is reaffirmed for Christians in Acts 15:28–29, where early
believers were directed to "abstain from blood" [2].

Witnesses understand this as applying to transfusions because the function is the same —
sustaining life by introducing blood into the body [3]. This is not a decision made lightly.
Witnesses research medical alternatives, and many physicians worldwide now offer bloodless
surgeries with excellent results [4].

Ultimately, Witnesses view this as an act of obedience to God and trust in his ability to
sustain life on his terms. (Psalm 36:9) [5]

Would you like to look more closely at the specific scriptures or the medical side of
this question?
</model_answer>
</example>

</few_shot_examples>

<context>
\${contextBlock}
</context>`;
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

    // 2. Deep retrieval + source-aware blend (web first, books as support).
    const retrievalTopK = Number(process.env.JW_RETRIEVAL_TOP_K || "500");
    const finalK = Number(process.env.JW_RETRIEVAL_FINAL_K || "50");
    const lambda = Number(process.env.JW_RETRIEVAL_MMR_LAMBDA || "0.58");

    const raw = await qdrantSearch(qvec, retrievalTopK);
    const webCandidates = raw.filter(
      (c) => !String(c.sourceFile || "").trim() && String(c.url || "").startsWith("http")
    );
    const bookCandidates = raw.filter(
      (c) => String(c.sourceFile || "").trim() || String(c.url || "").startsWith("file://")
    );

    const webQuota = Math.max(1, Math.round(finalK * 0.9));
    const bookQuota = Math.max(0, finalK - webQuota);

    const webRanked = mmrRerank(
      qvec,
      webCandidates,
      Math.min(webCandidates.length, webQuota * 3),
      lambda
    );
    const bookRanked = mmrRerank(
      qvec,
      bookCandidates,
      Math.min(bookCandidates.length, Math.max(1, bookQuota * 3)),
      lambda
    );

    let ranked = interleaveBySource(
      webRanked.slice(0, webQuota),
      bookRanked.slice(0, bookQuota),
      finalK
    );

    if (ranked.length < finalK) {
      const fallback = mmrRerank(qvec, raw, finalK * 3, lambda);
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

    const isWebSource = (c: { url: string; sourceFile?: string }) => {
      const url = String(c.url || "");
      const isWebUrl =
        url.startsWith("https://www.jw.org") ||
        url.startsWith("https://jw.org") ||
        url.startsWith("https://wol.jw.org") ||
        url.startsWith("https://www.wol.jw.org");
      return isWebUrl && !url.startsWith("file://") && !String(c.sourceFile || "").trim();
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
