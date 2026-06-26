"""Command entrypoint for project tools."""
from __future__ import annotations

import argparse
from urllib.parse import quote_plus

from tool_functions import (
    close_browser,
    get_url,
    open_browser,
    wait_for_element,
)


ALLOWED_URL_PREFIXES = (
    "https://www.jw.org/en/",
    "https://wol.jw.org/en/wol/library/r1/lp-e/all-publications",
)


def _is_allowed_url(url: str) -> bool:
    return any(url.startswith(prefix) for prefix in ALLOWED_URL_PREFIXES)


def web_search(query: str, max_results: int = 5, browser: str = "chrome", headless: bool = True):
    """Run a web search and return the top results."""
    scoped_query = (
        f"{query} (site:jw.org/en OR "
        "site:wol.jw.org/en/wol/library/r1/lp-e/all-publications)"
    )
    search_url = f"https://html.duckduckgo.com/html/?q={quote_plus(scoped_query)}"
    driver = open_browser(browser=browser, headless=headless)
    try:
        get_url(driver, search_url)
        wait_for_element(driver, "a.result__a", timeout=20)
        results = []
        links = driver.find_elements("css selector", "a.result__a")
        snippets = driver.find_elements("css selector", "div.result__snippet")
        for index, link in enumerate(links):
            if len(results) >= max_results:
                break

            href = link.get_attribute("href") or ""
            if not _is_allowed_url(href):
                continue

            snippet = snippets[index].text if index < len(snippets) else ""
            results.append(
                {
                    "title": link.text.strip(),
                    "url": href,
                    "snippet": snippet.strip(),
                }
            )
        return results
    finally:
        close_browser(driver)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Project tool runner")
    subparsers = parser.add_subparsers(dest="command")

    search_parser = subparsers.add_parser("web_search", help="Search the web")
    search_parser.add_argument("query", help="Search query")
    search_parser.add_argument("--max-results", type=int, default=5)
    search_parser.add_argument("--browser", default="chrome")
    search_parser.add_argument("--headed", action="store_true", help="Run with a visible browser")

    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    if args.command == "web_search":
        results = web_search(
            query=args.query,
            max_results=args.max_results,
            browser=args.browser,
            headless=not args.headed,
        )
        for item in results:
            print(f"{item['title']}\n{item['url']}\n{item['snippet']}\n")
        return 0

    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())