"""CLI runner.

Examples:
  python -m crawler.run --spider wol --limit 200
  python -m crawler.run --spider wol --since 2026-01-01

Notes:
- "--since" is passed through as a spider argument; spiders may ignore it.
- Keep limits modest; these sites will rate-limit aggressive crawling.
"""

import argparse

from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings

from crawler.spiders.wol_spider import WolSpider
import os
os.environ.setdefault("SCRAPY_SETTINGS_MODULE", "crawler.settings")


SPIDERS = {
    "wol": WolSpider,
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the JW scraper")
    parser.add_argument(
        "--spider",
        type=str,
        default="wol",
        choices=sorted(SPIDERS.keys()),
        help="Which spider to run",
    )
    parser.add_argument(
        "--since",
        type=str,
        help="Only fetch pages newer than YYYY-MM-DD (optional; spider-dependent)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Limit the number of items to crawl (0 or unset means no limit)",
        default=None,
    )
    args = parser.parse_args()

    settings = get_project_settings()

    if args.limit is not None and args.limit > 0:
        settings.set("CLOSESPIDER_ITEMCOUNT", args.limit)

    process = CrawlerProcess(settings)

    spider_cls = SPIDERS[args.spider]
    spider_kwargs = {}
    if args.since:
        spider_kwargs["since"] = args.since

    process.crawl(spider_cls, **spider_kwargs)
    process.start()


if __name__ == "__main__":
    main()
