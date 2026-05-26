"""WolSpider - crawls wol.jw.org English publications."""

import hashlib
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import scrapy

from crawler.items import JwPage


class WolSpider(scrapy.Spider):
    name = "wol"
    allowed_domains = ["wol.jw.org", "www.jw.org"]
    start_urls = ["https://wol.jw.org/en/wol/library/r1/lp-e/all-publications"]

    custom_settings = {"DEPTH_LIMIT": 6}

    def parse(self, response):
        for href in response.css("a::attr(href)").getall():
            url = urljoin(response.url, href)
            if self._same_lang(url):
                yield response.follow(url, callback=self.parse_any)

    def parse_any(self, response):
        if response.css("#article, article, .article").get():
            html = response.text
            yield JwPage(
                url=response.url,
                fetched_at=datetime.now(timezone.utc).isoformat(),
                publication=response.css("header .contextTtl::text, .publicationTitle::text")
                .get(default="")
                .strip(),
                title=response.css("h1::text").get(default="").strip(),
                language="en",
                html=html,
                content_hash=hashlib.sha256(html.encode("utf-8")).hexdigest(),
            )
            return

        for href in response.css("a::attr(href)").getall():
            url = urljoin(response.url, href)
            if self._same_lang(url):
                yield response.follow(url, callback=self.parse_any)

    @staticmethod
    def _same_lang(url: str) -> bool:
        host = urlparse(url).netloc
        if host not in ("wol.jw.org", "www.jw.org"):
            return False
        path = urlparse(url).path
        return path.startswith("/en/") or "/lp-e/" in path or "/r1/" in path
