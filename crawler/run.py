"""CLI runner: python -m crawler.run"""

import argparse
from datetime import datetime, timedelta

from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings

from crawler.spiders.wol_spider import WolSpider


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the JW scraper")
    parser.add_argument(
        "--since",
        type=str,
        help="Only fetch pages newer than YYYY-MM-DD",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Limit the number of pages to crawl",
        default=100,
    )
    args = parser.parse_args()

    settings = get_project_settings()
    
    if args.limit:
        settings.set("CLOSESPIDER_ITEMCOUNT", args.limit)
    
    if args.since:
        settings.set("SINCE_DATE", args.since)
    
    process = CrawlerProcess(settings)
    process.crawl(WolSpider)
    process.start()


if __name__ == "__main__":
    main()
