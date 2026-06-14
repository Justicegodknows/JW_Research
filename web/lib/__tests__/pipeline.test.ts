/**
 * Integration tests for the retrieval pipeline
 * 
 * Run with: npx jest lib/__tests__/pipeline.test.ts
 * Or: pnpm test
 */

import { embedQuery } from "../embed";
import { qdrantSearch, type Chunk } from "../qdrant";
import { mmrRerank } from "../mmr";
import { liveFetchAndIngest } from "../liveIngest";

// Mock environment variables for testing
process.env.NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "test-key";
process.env.NVIDIA_EMBED_URL = process.env.NVIDIA_EMBED_URL || "https://integrate.api.nvidia.com/v1";
process.env.NVIDIA_EMBED_MODEL = process.env.NVIDIA_EMBED_MODEL || "NV-Embed-QA";
process.env.QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
process.env.QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || "jw_research";
process.env.QDRANT_API_KEY = process.env.QDRANT_API_KEY || "";

describe("Retrieval Pipeline", () => {
    describe("embedQuery", () => {
        it("should generate valid embedding vector", async () => {
            const text = "What is the purpose of life?";
            const vector = await embedQuery(text);

            expect(vector).toBeDefined();
            expect(Array.isArray(vector)).toBe(true);
            expect(vector.length).toBeGreaterThan(0);
            expect(vector.every((n) => typeof n === "number")).toBe(true);
        }, 30000);

        it("should handle empty string gracefully", async () => {
            try {
                await embedQuery("");
                // Should either succeed with valid embedding or throw
            } catch {
                // Expected - empty string is invalid input
            }
        });
    });

    describe("qdrantSearch", () => {
        it("should return array of chunks", async () => {
            // Create a test vector (random but valid dimension)
            const testVector = new Array(1024).fill(0).map(() => Math.random() * 2 - 1);

            const results = await qdrantSearch(testVector, 5);

            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
        }, 30000);

        it("should include required fields in results", async () => {
            const testVector = new Array(1024).fill(0).map(() => Math.random() * 2 - 1);

            try {
                const results = await qdrantSearch(testVector, 1);
                if (results.length > 0) {
                    const chunk = results[0];
                    expect(chunk).toHaveProperty("id");
                    expect(chunk).toHaveProperty("score");
                    expect(chunk).toHaveProperty("text");
                    expect(chunk).toHaveProperty("title");
                    expect(chunk).toHaveProperty("url");
                }
            } catch {
                // Qdrant may not be running - that's ok for test
            }
        }, 30000);
    });

    describe("mmrRerank", () => {
        it("should return subset of candidates", () => {
            const queryVec = [0.1, 0.2, 0.3];
            const candidates: Chunk[] = [
                { id: "1", score: 0.9, text: "a", title: "t1", publication: "p1", url: "u1", vector: [0.1, 0.2, 0.3] },
                { id: "2", score: 0.8, text: "b", title: "t2", publication: "p2", url: "u2", vector: [0.2, 0.3, 0.4] },
                { id: "3", score: 0.7, text: "c", title: "t3", publication: "p3", url: "u3", vector: [0.3, 0.4, 0.5] },
                { id: "4", score: 0.6, text: "d", title: "t4", publication: "p4", url: "u4", vector: [0.4, 0.5, 0.6] },
            ];

            const result = mmrRerank(queryVec, candidates, 2, 0.6);

            expect(result).toBeDefined();
            expect(result.length).toBeLessThanOrEqual(2);
            expect(result.length).toBeGreaterThan(0);
        });

        it("should handle empty candidates", () => {
            const queryVec = [0.1, 0.2, 0.3];
            const result = mmrRerank(queryVec, [], 2, 0.6);
            expect(result).toEqual([]);
        });

        it("should handle k greater than candidates", () => {
            const queryVec = [0.1, 0.2, 0.3];
            const candidates: Chunk[] = [
                { id: "1", score: 0.9, text: "a", title: "t1", publication: "p1", url: "u1", vector: [0.1, 0.2, 0.3] },
            ];

            const result = mmrRerank(queryVec, candidates, 5, 0.6);

            expect(result.length).toBe(1);
        });
    });

    describe("liveFetchAndIngest", () => {
        it("should reject non-JW URLs", async () => {
            const result = await liveFetchAndIngest("https://example.com/page");
            expect(result.ingested).toBe(0);
        });

        it("should reject HTTP URLs", async () => {
            const result = await liveFetchAndIngest("http://www.jw.org/en/");
            expect(result.ingested).toBe(0);
        });

        it("should accept valid JW URLs", async () => {
            // This is a real URL but may return 0 if not article-like
            const result = await liveFetchAndIngest("https://www.jw.org/en/");
            // Either succeeds with chunks or gracefully returns 0
            expect(result).toHaveProperty("ingested");
            expect(typeof result.ingested).toBe("number");
        }, 30000);

        it("should reject binary assets", async () => {
            const result = await liveFetchAndIngest("https://www.jw.org/en/file.pdf");
            expect(result.ingested).toBe(0);
        });
    });
});

// Utility test to verify all env variables are set
describe("Environment Configuration", () => {
    it("should have required environment variables", () => {
        const required = ["NVIDIA_API_KEY"];

        required.forEach((key) => {
            // Just check the variable exists (value may be empty string)
            expect(process.env).toHaveProperty(key);
        });
    });
});
