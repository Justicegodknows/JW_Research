from __future__ import annotations

import os
from typing import Iterable, List

import requests


class EmbeddingClient:
    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        api_key: str | None = None,
    ) -> None:
        self.base_url = (
            base_url
            or os.getenv("NVIDIA_EMBED_URL")
            or "https://integrate.api.nvidia.com/v1"
        ).rstrip("/")
        self.model = model or os.getenv("NVIDIA_EMBED_MODEL") or "NV-Embed-QA"
        self.api_key = api_key if api_key is not None else os.getenv("NVIDIA_API_KEY", "")

    def embed(self, texts: Iterable[str], batch_size: int = 32) -> List[List[float]]:
        all_vectors: List[List[float]] = []
        batch: List[str] = []

        for text in texts:
            batch.append(text)
            if len(batch) >= batch_size:
                all_vectors.extend(self._embed_batch(batch))
                batch = []

        if batch:
            all_vectors.extend(self._embed_batch(batch))

        return all_vectors

    def _embed_batch(self, texts: List[str]) -> List[List[float]]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        base = self.base_url.rstrip("/")
        candidates = []
        candidates.append(f"{base}/embeddings")
        candidates.append(f"{base}/v1/embeddings")
        if base.endswith("/v1"):
            candidates.append(f"{base[:-3]}/v1/embeddings")

        last_404_body: str | None = None
        for endpoint in dict.fromkeys(candidates):
            resp = requests.post(
                endpoint,
                headers=headers,
                json={"model": self.model, "input": texts},
                timeout=120,
            )

            if resp.status_code == 404:
                last_404_body = resp.text
                continue

            resp.raise_for_status()
            payload = resp.json()
            data = sorted(payload["data"], key=lambda item: item.get("index", 0))
            return [item["embedding"] for item in data]

        raise RuntimeError(
            "Embedding request failed: 404 "
            + (last_404_body or "not found")
            + " (tried: "
            + ", ".join(dict.fromkeys(candidates))
            + ")"
        )
