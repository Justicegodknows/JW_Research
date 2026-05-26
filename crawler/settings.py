"""Scrapy settings - polite, single-domain, English only."""

BOT_NAME = "jw_research"
SPIDER_MODULES = ["crawler.spiders"]
NEWSPIDER_MODULE = "crawler.spiders"

USER_AGENT = "JW_Research_Personal_Bot/0.1 (private study; contact: owner)"
ROBOTSTXT_OBEY = True

CONCURRENT_REQUESTS = 2
CONCURRENT_REQUESTS_PER_DOMAIN = 1
DOWNLOAD_DELAY = 1.0
RANDOMIZE_DOWNLOAD_DELAY = True
AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_START_DELAY = 1.0
AUTOTHROTTLE_MAX_DELAY = 10.0
AUTOTHROTTLE_TARGET_CONCURRENCY = 1.0

HTTPCACHE_ENABLED = True
HTTPCACHE_DIR = "data/httpcache"
HTTPCACHE_POLICY = "scrapy.extensions.httpcache.RFC2616Policy"
HTTPCACHE_STORAGE = "scrapy.extensions.httpcache.FilesystemCacheStorage"

RETRY_ENABLED = True
RETRY_TIMES = 3
RETRY_HTTP_CODES = [429, 500, 502, 503, 504, 522, 524]

DEFAULT_REQUEST_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
    "Accept-Language": "en-US,en;q=0.9",
}

FEED_EXPORT_ENCODING = "utf-8"
LOG_LEVEL = "INFO"

ITEM_PIPELINES = {
    "crawler.pipelines.RawHtmlPipeline": 100,
}
