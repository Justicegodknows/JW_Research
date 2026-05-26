import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type CoreMessage } from "ai";
import { embedQuery } from "@/lib/embed";
import { qdrantSearch } from "@/lib/qdrant";
import { mmrRerank } from "@/lib/mmr";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export async function POST(req: Request) {
  const body = (await req.json()) as { messages: ChatMessage[] };
  const messages = body.messages || [];

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return new Response("No user message", { status: 400 });
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

  const system =
    "You are JW Research, a careful assistant that answers questions strictly from the provided JW Library context.\n" +
    "Rules:\n" +
    "1. Use ONLY the numbered context below. Do not use outside knowledge.\n" +
    "2. Cite every claim inline using bracketed numbers like [1], [2], matching the context items.\n" +
    "3. If the context does not contain enough information to answer, reply exactly: \"I cannot answer this from the provided sources.\" Do not guess.\n" +
    "4. Be concise, neutral, and accurate. Prefer direct quotations when helpful, in quotes, with a citation.\n" +
    "5. Do not invent titles, URLs, or publications.\n\n" +
    "Context:\n" +
    contextBlock;

  // 4. Stream the answer via the DGX LLM (OpenAI-compatible).
  const dgx = createOpenAI({
    baseURL: process.env.DGX_LLM_URL,
    apiKey: process.env.DGX_API_KEY || ""
  });

  const coreMessages: CoreMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content
  }));

  const result = streamText({
    model: dgx("jw-llm"),
    system,
    messages: coreMessages,
    temperature: 0.2
  });

  // Expose sources to the client via a custom header carrying JSON.
  const sources = ranked.map((c, i) => ({
    n: i + 1,
    title: c.title,
    publication: c.publication,
    url: c.url,
    score: c.score
  }));

  const response = result.toDataStreamResponse();
  response.headers.set("x-jw-sources", encodeURIComponent(JSON.stringify(sources)));
  return response;
}
