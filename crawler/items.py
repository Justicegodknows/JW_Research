import scrapy


class JwPage(scrapy.Item):
    url = scrapy.Field()
    fetched_at = scrapy.Field()
    publication = scrapy.Field()
    title = scrapy.Field()
    language = scrapy.Field()
    html = scrapy.Field()
    content_hash = scrapy.Field()
