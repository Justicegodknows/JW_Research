import type { Chunk } from "./qdrant";

function dot(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function norm(a: number[]): number {
  return Math.sqrt(dot(a, a)) || 1;
}

function cosine(a: number[], b: number[]): number {
  if (!a.length || !b.length) return 0;
  return dot(a, b) / (norm(a) * norm(b));
}

// Maximal Marginal Relevance re-rank.
// lambda close to 1 = favor relevance; close to 0 = favor diversity.
export function mmrRerank(
  queryVec: number[],
  candidates: Chunk[],
  k: number,
  lambda = 0.6
): Chunk[] {
  const selected: Chunk[] = [];
  const remaining = candidates.slice();

  while (selected.length < k && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      const rel = cosine(queryVec, c.vector);
      let div = 0;
      for (const s of selected) {
        const sim = cosine(c.vector, s.vector);
        if (sim > div) div = sim;
      }
      const score = lambda * rel - (1 - lambda) * div;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    selected.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }

  return selected;
}
