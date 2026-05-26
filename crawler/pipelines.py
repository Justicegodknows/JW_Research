"""Persist raw pages to data/raw/<sha1-of-url>.json for downstream parsing."""

import hashlib
import json
from pathlib import Path


class RawHtmlPipeline:
    def open_spider(self, spider):
        self.out_dir = Path("data/raw")
        self.out_dir.mkdir(parents=True, exist_ok=True)

    def process_item(self, item, spider):
        key = hashlib.sha1(item["url"].encode("utf-8")).hexdigest()
        path = self.out_dir / f"{key}.json"
        path.write_text(json.dumps(dict(item), ensure_ascii=False))
        return item
