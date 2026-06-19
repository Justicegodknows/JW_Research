export const runtime = "nodejs";

const ALLOWED_METHODS = "GET, OPTIONS";

export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: {
            Allow: ALLOWED_METHODS,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": ALLOWED_METHODS,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

export async function GET(req: Request) {
    const backendUrl = (process.env.BACKEND_URL || "").trim();
    const backendPath = (process.env.BACKEND_CHAT_PATH || "/api/chat").trim() || "/api/chat";
    const timeoutMs = Number(process.env.BACKEND_PROXY_TIMEOUT_MS || "5000");

    if (!backendUrl) {
        return Response.json(
            {
                ok: false,
                reachable: false,
                reason: "BACKEND_URL is not set",
            },
            {
                status: 400,
                headers: {
                    Allow: ALLOWED_METHODS,
                },
            }
        );
    }

    const normalizedPath = backendPath.startsWith("/") ? backendPath : "/" + backendPath;
    const target = backendUrl.replace(/\/$/, "") + normalizedPath;
    const startedAt = Date.now();

    try {
        const upstream = await fetch(target, {
            method: "OPTIONS",
            headers: {
                "x-jw-proxy-hop": "1",
            },
            signal: AbortSignal.timeout(timeoutMs),
        });

        const elapsedMs = Date.now() - startedAt;
        const allow = upstream.headers.get("allow");

        return Response.json(
            {
                ok: true,
                reachable: true,
                target,
                status: upstream.status,
                statusText: upstream.statusText,
                allow,
                elapsedMs,
            },
            {
                status: 200,
                headers: {
                    Allow: ALLOWED_METHODS,
                },
            }
        );
    } catch (err) {
        const elapsedMs = Date.now() - startedAt;
        const message = err instanceof Error ? err.message : String(err);
        const timeout = isTimeoutLikeError(err);

        return Response.json(
            {
                ok: false,
                reachable: false,
                target,
                timeout,
                elapsedMs,
                detail: message,
            },
            {
                status: timeout ? 504 : 502,
                headers: {
                    Allow: ALLOWED_METHODS,
                },
            }
        );
    }
}
