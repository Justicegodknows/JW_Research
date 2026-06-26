import { createOpenAI } from "@ai-sdk/openai";
import { experimental_wrapLanguageModel, streamText, type CoreMessage } from "ai";
import { buildPromptArtifacts, type ChatMessage } from "@/lib/prompt-assembly";

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

function readBooleanEnv(name: string, defaultValue = false): boolean {
  const rawValue = (process.env[name] || "").trim().toLowerCase();
  if (!rawValue) {
    return defaultValue;
  }

  return rawValue === "true" || rawValue === "1" || rawValue === "yes";
}

function readNumberEnv(name: string, defaultValue: number): number {
  const rawValue = (process.env[name] || "").trim();
  if (!rawValue) {
    return defaultValue;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function buildFallbackModel(
  nvidia: ReturnType<typeof createOpenAI>,
  fallbackModelId: string,
) {
  const enableThinking = readBooleanEnv("NVIDIA_FALLBACK_ENABLE_THINKING", true);
  const reasoningBudget = readNumberEnv("NVIDIA_FALLBACK_REASONING_BUDGET", 16384);

  return experimental_wrapLanguageModel({
    model: nvidia(fallbackModelId),
    modelId: fallbackModelId,
    middleware: {
      transformParams: async ({ params }) => ({
        ...params,
        providerOptions: {
          openai: {
            chat_template_kwargs: {
              enable_thinking: enableThinking,
            },
            reasoning_budget: reasoningBudget,
          },
        },
      }),
    },
  });
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

    const { system, sources } = await buildPromptArtifacts(lastUser.content);

    // 4. Stream the answer via NVIDIA NIM (OpenAI-compatible).
    const nvidia = createOpenAI({
      baseURL: process.env.NVIDIA_LLM_URL || "https://integrate.api.nvidia.com/v1",
      apiKey: process.env.NVIDIA_API_KEY || "",
    });

    const primaryModelId = (process.env.NVIDIA_MODEL || "qwen/qwen3.5-397b-a17b").trim();
    const fallbackModelId = (process.env.NVIDIA_FALLBACK_MODEL || "nvidia/nemotron-3-ultra-550b-a55b").trim();
    const useFallbackModel = readBooleanEnv("NVIDIA_USE_FALLBACK_MODEL", false);

    const activeModel = useFallbackModel
      ? buildFallbackModel(nvidia, fallbackModelId)
      : nvidia(primaryModelId);

    const coreMessages: CoreMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const result = streamText({
      model: activeModel,
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

    void result.text.then((finalMessage) => {
      if (finalMessage.trim()) {
        console.info("/api/chat final assistant message assembled.", {
          chars: finalMessage.length,
        });
      }
    }).catch((finalErr) => {
      const message = finalErr instanceof Error ? finalErr.message : String(finalErr);
      console.warn("/api/chat final assistant message capture failed:", message);
    });

    const response = result.toDataStreamResponse({
      getErrorMessage: (error) => {
        const detail = error instanceof Error ? error.message : String(error);
        const timeout = isTimeoutLikeError(error);
        console.error("/api/chat stream error:", detail, error);
        return timeout
          ? "Upstream LLM timed out. Verify NVIDIA_LLM_URL/NVIDIA_MODEL and network reachability."
          : `LLM stream failed: ${detail}`;
      },
    });
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
