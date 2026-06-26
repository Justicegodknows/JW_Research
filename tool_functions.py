"""Reusable browser and utility functions for the project.

The browser helpers are implemented with Selenium and are imported lazily so the
module can still be imported in environments where Selenium is not installed.
"""
from __future__ import annotations

import shutil
import smtplib
import time
from email.message import EmailMessage
from pathlib import Path
from typing import Any


def _require_selenium() -> Any:
    try:
        from selenium import webdriver as selenium_webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.support.ui import Select, WebDriverWait
    except ImportError as exc:  # pragma: no cover - import guard
        raise RuntimeError(
            "Selenium is required for browser automation helpers. Install it with 'pip install selenium'."
        ) from exc

    return {
        "webdriver": selenium_webdriver,
        "By": By,
        "EC": EC,
        "Select": Select,
        "WebDriverWait": WebDriverWait,
    }


def webdriver(browser: str = "chrome", headless: bool = True, download_dir: str | None = None):
    """Create a Selenium webdriver instance."""
    selenium = _require_selenium()
    selenium_webdriver = selenium["webdriver"]

    browser_name = browser.lower().strip()
    if browser_name == "firefox":
        from selenium.webdriver.firefox.options import Options as FirefoxOptions

        options = FirefoxOptions()
        if headless:
            options.add_argument("-headless")
        driver = selenium_webdriver.Firefox(options=options)
    else:
        from selenium.webdriver.chrome.options import Options as ChromeOptions
        from selenium.webdriver.chrome.service import Service as ChromeService

        options = ChromeOptions()
        if headless:
            options.add_argument("--headless=new")
        options.add_argument("--disable-gpu")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1920,1080")
        if download_dir:
            prefs = {
                "download.default_directory": str(Path(download_dir).expanduser().resolve()),
                "download.prompt_for_download": False,
                "download.directory_upgrade": True,
                "safebrowsing.enabled": True,
            }
            options.add_experimental_option("prefs", prefs)

        browser_binary = _find_first_binary("chromium", "chromium-browser", "google-chrome")
        if browser_binary:
            options.binary_location = browser_binary

        chromedriver_binary = _find_first_binary("chromedriver")
        if chromedriver_binary:
            driver = selenium_webdriver.Chrome(
                service=ChromeService(executable_path=chromedriver_binary),
                options=options,
            )
        else:
            driver = selenium_webdriver.Chrome(options=options)

    return driver


def get_url(driver, url: str) -> None:
    """Navigate the browser to a URL."""
    driver.get(url)


def open_browser(url: str | None = None, browser: str = "chrome", headless: bool = True):
    """Open a browser session and optionally navigate to a URL."""
    driver = webdriver(browser=browser, headless=headless)
    if url:
        get_url(driver, url)
    return driver


def close_browser(driver) -> None:
    """Close the browser session."""
    driver.quit()


def wait_for_element(driver, selector: str, timeout: int = 15, by: str = "css"):
    """Wait until an element is present and return it."""
    selenium = _require_selenium()
    locator = _resolve_locator(selenium["By"], selector, by)
    return selenium["WebDriverWait"](driver, timeout).until(
        selenium["EC"].presence_of_element_located(locator)
    )


def click_button(driver, selector: str, timeout: int = 15, by: str = "css") -> None:
    """Wait for a button-like element and click it."""
    element = wait_for_element(driver, selector, timeout=timeout, by=by)
    element.click()


def enter_text(
    driver,
    selector: str,
    text: str,
    timeout: int = 15,
    by: str = "css",
    clear: bool = True,
) -> None:
    """Enter text into an input or textarea."""
    element = wait_for_element(driver, selector, timeout=timeout, by=by)
    if clear:
        element.clear()
    element.send_keys(text)


def select_option(
    driver,
    selector: str,
    timeout: int = 15,
    by: str = "css",
    value: str | None = None,
    text: str | None = None,
    index: int | None = None,
) -> None:
    """Select an option from a <select> element."""
    selenium = _require_selenium()
    element = wait_for_element(driver, selector, timeout=timeout, by=by)
    selector_obj = selenium["Select"](element)
    if value is not None:
        selector_obj.select_by_value(value)
    elif text is not None:
        selector_obj.select_by_visible_text(text)
    elif index is not None:
        selector_obj.select_by_index(index)
    else:
        raise ValueError("Provide one of value, text, or index to select an option.")


def scroll_to_bottom(driver, pause: float = 0.25, max_scrolls: int = 50) -> None:
    """Scroll the page until the bottom is reached or no further growth occurs."""
    last_height = driver.execute_script("return document.body.scrollHeight")
    for _ in range(max_scrolls):
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(pause)
        new_height = driver.execute_script("return document.body.scrollHeight")
        if new_height == last_height:
            break
        last_height = new_height


def take_screenshot(driver, path: str = "screenshot.png", full_page: bool = True) -> str:
    """Capture a screenshot and return the saved path."""
    output_path = Path(path).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    driver.save_screenshot(str(output_path))
    return str(output_path)


def send_email(
    smtp_host: str,
    smtp_port: int,
    sender: str,
    password: str,
    recipient: str,
    subject: str,
    body: str,
    use_tls: bool = True,
) -> None:
    """Send a plain-text email through an SMTP server."""
    message = EmailMessage()
    message["From"] = sender
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)

    with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as client:
        if use_tls:
            client.starttls()
        client.login(sender, password)
        client.send_message(message)


def save_file(path: str, content: str | bytes, mode: str | None = None) -> str:
    """Save content to disk and return the file path."""
    output_path = Path(path).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if isinstance(content, bytes):
        output_path.write_bytes(content)
    else:
        file_mode = mode or "w"
        with output_path.open(file_mode, encoding="utf-8") as handle:
            handle.write(content)

    return str(output_path)


def upload_file(driver, selector: str, file_path: str, timeout: int = 15, by: str = "css") -> None:
    """Upload a file using an <input type="file"> element."""
    element = wait_for_element(driver, selector, timeout=timeout, by=by)
    element.send_keys(str(Path(file_path).expanduser().resolve()))


def _resolve_locator(by_cls, selector: str, by: str):
    normalized = by.lower().strip()
    if normalized == "css":
        return by_cls.CSS_SELECTOR, selector
    if normalized == "xpath":
        return by_cls.XPATH, selector
    if normalized == "id":
        return by_cls.ID, selector
    if normalized == "name":
        return by_cls.NAME, selector
    if normalized == "tag":
        return by_cls.TAG_NAME, selector
    if normalized == "class":
        return by_cls.CLASS_NAME, selector
    raise ValueError(f"Unsupported locator type: {by}")


def _find_first_binary(*names: str) -> str | None:
    for name in names:
        path = shutil.which(name)
        if path:
            return path
    return None
