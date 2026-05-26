"""CLI runner: python -m crawler.run"""

from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings

from crawler.spiders.wol_spider import WolSpider


def main() -> None:
    settings = get_project_settings()
    process = CrawlerProcess(settings)
    process.crawl(WolSpider)
    process.start()


if __name__ == "__main__":
    main()
