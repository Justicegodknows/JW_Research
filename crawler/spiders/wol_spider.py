"""WolSpider - crawls jw.org / wol.jw.org English publications.

Politeness notes:
- Keep depth modest
- Respect robots.txt via project settings
- Avoid overly aggressive follow rules
"""

import hashlib
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import scrapy

from crawler.items import JwPage


class WolSpider(scrapy.Spider):
    name = "wol"
    allowed_domains = ["wol.jw.org", "www.jw.org"]

    # Seed URLs provided by user.
    start_urls = [
        "https://www.jw.org/en/",
        "https://www.jw.org/en/library/",
        "https://wol.jw.org/en/wol/library/r1/lp-e/all-publications",
    ]

    custom_settings = {
        # Keep recursion under control; these sites are huge.
        "DEPTH_LIMIT": 6,
    }

    def __init__(self, since=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # For future use; currently not applied (no reliable last-modified across pages).
        self.since = since

    def start_requests(self):
        for url in self.start_urls:
            yield scrapy.Request(url, callback=self.parse_any)

    def parse(self, response):
        # Kept for Scrapy compatibility; route to parse_any.
        yield from self.parse_any(response)

    def parse_any(self, response):
        # Save article-like pages.
        if response.css("#article, article, .article").get():
            html = response.text
            yield JwPage(
                url=response.url,
                fetched_at=datetime.now(timezone.utc).isoformat(),
                publication=response.css(
                    "header .contextTtl::text, .publicationTitle::text"
                )
                .get(default="")
                .strip(),
                title=response.css("h1::text").get(default="").strip(),
                language="en",
                html=html,
                content_hash=hashlib.sha256(html.encode("utf-8")).hexdigest(),
            )
            return

        # Follow internal links that look like English content.
        for href in response.css("a::attr(href)").getall():
            url = urljoin(response.url, href)
            if self._should_follow(url):
                yield response.follow(url, callback=self.parse_any)

    @staticmethod
    def _should_follow(url):
        parsed = urlparse(url)
        host = parsed.netloc
        if host not in ("wol.jw.org", "www.jw.org"):
            return False

        path = parsed.path or "/"

        # Ignore obvious non-content paths / assets.
        lowered = path.lower()
        if lowered.endswith(
            (
                ".pdf",
                ".mp3",
                ".mp4",
                ".jpg",
                ".jpeg",
                ".png",
                ".gif",
                ".svg",
                ".zip",
            )
        ):
            return False

        # Only follow English sections.
        return path.startswith("/en/") or "/lp-e/" in path or "/r1/" in path
