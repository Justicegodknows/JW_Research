import { detectChickenJoke, isJailbreakAttempt } from "@/lib/jokeDetector";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export async function POST(req: Request) {
  const body = (await req.json()) as { messages: ChatMessage[] };
  const messages = body.messages || [];
  const latestUserMessage = [...messages].reverse().find((m) => m.role === "user");
  if (!latestUserMessage) {
    return new Response("No user message", { status: 400 });
  }

  const prompt = latestUserMessage.content.trim();
  if (!prompt) {
    const result = await streamText({
      model: openai("gpt-4o-mini"),
      messages,
      system: "You are an AI assistant.",
      temperature: 0.3,
    });
    return result.toDataStreamResponse();
  }

  // Check for chocolate marketing prompt
  const chocolateMatch = detectChocolatePrompt(prompt);
  if (chocolateMatch.isChocolate) {
    const brandName =
      chocolateMatch.brand || (await generateBrandName(prompt));
    const memeResponse: Message = {
      id: generateId(),
      role: "assistant",
      content: `🐶 **DOG-CHOCOLATE ALERT!** 🍫\n\n\"Wait dear hooman! I must inform you that chocolate is extremely toxic to dogs! Even a small piece can make me very sick. Please don't let me eat it!\n\nBut if you're looking for ${brandName} chocolate for yourself... I've heard it's quite delicious! 🍫✨\"`,
      timestamp: new Date(),
    };
    return NextResponse.json(memeResponse);
  }

  const jailbreak = detectJailbreakPrompt(prompt);

/... [Message truncated by system]