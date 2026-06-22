"""Scrapy settings - polite, single-domain, English only.

This project targets sites that may rate-limit or block aggressive crawlers.
Use a fast crawl profile when you need broader coverage, but keep the cache on.
"""

from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]

BOT_NAME = "jw_research"

SPIDER_MODULES = ["crawler.spiders"]
NEWSPIDER_MODULE = "crawler.spiders"

# Identify the crawler (keep this honest and stable).
USER_AGENT = "JW_Research_Personal_Bot/0.1 (private study; contact: owner)"

# Fast crawl profile.
ROBOTSTXT_OBEY = False

# Higher concurrency for broader coverage.
CONCURRENT_REQUESTS = 8
CONCURRENT_REQUESTS_PER_DOMAIN = 4

# Remove artificial delay for faster crawling.
DOWNLOAD_DELAY = 0.0
RANDOMIZE_DOWNLOAD_DELAY = False

# Disable throttling in fast crawl mode.
AUTOTHROTTLE_ENABLED = False
AUTOTHROTTLE_START_DELAY = 0.0
AUTOTHROTTLE_MAX_DELAY = 0.0
AUTOTHROTTLE_TARGET_CONCURRENCY = 8.0

# Cache responses to avoid refetching during development.
HTTPCACHE_ENABLED = True
HTTPCACHE_DIR = str(ROOT_DIR / "data" / "httpcache")
HTTPCACHE_POLICY = "scrapy.extensions.httpcache.RFC2616Policy"
HTTPCACHE_STORAGE = "scrapy.extensions.httpcache.FilesystemCacheStorage"

# Retry transient errors and rate-limits.
RETRY_ENABLED = True
RETRY_TIMES = 1
RETRY_HTTP_CODES = [
    408,
    429,
    500,
    502,
    503,
    504,
    522,
    524,
]

# Keep timeouts shorter so stalled requests do not block progress.
DOWNLOAD_TIMEOUT = 20

DEFAULT_REQUEST_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
    "Accept-Language": "en-US,en;q=0.9",
}

FEED_EXPORT_ENCODING = "utf-8"
LOG_LEVEL = "INFO"

ITEM_PIPELINES = {
    "crawler.pipelines.RawHtmlPipeline": 100,
}

ADDONS = {
    "scrapy_poet.Addon": 300,
}

SCRAPY_POET_DISCOVER = [
    "crawler.pages",
]
