from __future__ import annotations

import os
from typing import Iterable, List

import requests


class EmbeddingClient:
    def __init__(self, base_url: str | None = None, model: str | None = None, api_key: str | None = None) -> None:
        self.base_url = (base_url or os.getenv("DGX_EMBED_URL") or "http://127.0.0.1:8001/v1").rstrip("/")
        self.model = model or os.getenv("DGX_EMBED_MODEL") or "bge-large-en-v1.5"
        self.api_key = api_key if api_key is not None else os.getenv("DGX_API_KEY", "")

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

        response = requests.post(
            f"{self.base_url}/embeddings",
            headers=headers,
            json={"model": self.model, "input": texts},
            timeout=120,
        )
        response.raise_for_status()
        payload = response.json()
        data = sorted(payload["data"], key=lambda item: item.get("index", 0))
        return [item["embedding"] for item in data]
