"""Scrapy settings - polite, single-domain, English only.

This project targets sites that may rate-limit or block aggressive crawlers.
Keep concurrency low, add delays, enable AutoThrottle and caching.
"""

from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]

BOT_NAME = "jw_research"

SPIDER_MODULES = ["crawler.spiders"]
NEWSPIDER_MODULE = "crawler.spiders"

# Identify the crawler (keep this honest and stable).
USER_AGENT = "JW_Research_Personal_Bot/0.1 (private study; contact: owner)"

# Be polite.
ROBOTSTXT_OBEY = True

# Conservative concurrency to reduce ban risk.
CONCURRENT_REQUESTS = 2
CONCURRENT_REQUESTS_PER_DOMAIN = 2

# Add small random-ish delay between requests.
DOWNLOAD_DELAY = 1.0
RANDOMIZE_DOWNLOAD_DELAY = True

# AutoThrottle helps adapt to server responses.
AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_START_DELAY = 2.0
AUTOTHROTTLE_MAX_DELAY = 30.0
AUTOTHROTTLE_TARGET_CONCURRENCY = 1.5

# Cache responses to avoid refetching during development.
HTTPCACHE_ENABLED = True
HTTPCACHE_DIR = str(ROOT_DIR / "data" / "httpcache")
HTTPCACHE_POLICY = "scrapy.extensions.httpcache.RFC2616Policy"
HTTPCACHE_STORAGE = "scrapy.extensions.httpcache.FilesystemCacheStorage"

# Retry transient errors and rate-limits.
RETRY_ENABLED = True
RETRY_TIMES = 2
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

# Add a bit of download timeout so hung connections don't stall the crawl.
DOWNLOAD_TIMEOUT = 45

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
