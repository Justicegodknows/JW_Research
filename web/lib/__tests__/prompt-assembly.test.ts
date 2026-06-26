import { createAsyncLRUCache, buildPromptCacheKey, normalizePrompt } from "../prompt-assembly";

describe("prompt assembly cache", () => {
    it("normalizes prompt whitespace before hashing", () => {
        const a = buildPromptCacheKey("hello   world", {
            contextBudgetChars: 10,
            retrievalTopK: 5,
            finalK: 3,
            lambda: 0.5,
            liveEnabled: true,
            liveMaxUrls: 2,
            collection: "jw_research",
        });
        const b = buildPromptCacheKey("hello world", {
            contextBudgetChars: 10,
            retrievalTopK: 5,
            finalK: 3,
            lambda: 0.5,
            liveEnabled: true,
            liveMaxUrls: 2,
            collection: "jw_research",
        });

        expect(a).toBe(b);
        expect(normalizePrompt("  hello\nworld  ")).toBe("hello world");
    });

    it("reuses in-flight values and evicts least-recently-used entries", async () => {
        const cache = createAsyncLRUCache<string>({ maxEntries: 2, ttlMs: 60_000 });
        let calls = 0;

        const first = cache.getOrSet("a", async () => {
            calls += 1;
            return "value-a";
        });
        const second = cache.getOrSet("a", async () => {
            calls += 1;
            return "value-a-2";
        });

        await expect(first).resolves.toBe("value-a");
        await expect(second).resolves.toBe("value-a");
        expect(calls).toBe(1);

        await cache.getOrSet("b", async () => "value-b");
        await cache.getOrSet("c", async () => "value-c");

        expect(cache.size()).toBeLessThanOrEqual(2);

        const refreshed = await cache.getOrSet("a", async () => {
            calls += 1;
            return "value-a-refreshed";
        });

        expect(refreshed).toBe("value-a-refreshed");
        expect(calls).toBe(2);
    });
});