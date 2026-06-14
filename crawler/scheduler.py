"""Simple scheduler for running spiders periodically.

Why this exists:
- Keep crawl rate low to avoid being blocked.
- Provide a single entrypoint you can run under cron/systemd.

Examples:
  # Run once:
  python -m crawler.scheduler --spider wol --once

  # Run every 6 hours:
  python -m crawler.scheduler --spider wol --interval-minutes 360

Notes:
- This is intentionally simple (no distributed scheduling).
- For production, prefer cron or systemd timers calling this module.
"""

import argparse
import subprocess
import sys
import time
from datetime import datetime, timezone


def _utc_now():
    return datetime.now(timezone.utc).isoformat()


def run_once(spider, limit):
    cmd = [sys.executable, "-m", "crawler.run", "--spider", spider]
    if limit is not None:
        cmd += ["--limit", str(limit)]

    print(f"[{_utc_now()}] Running: {' '.join(cmd)}", flush=True)
    return subprocess.call(cmd)


def main():
    parser = argparse.ArgumentParser(description="Schedule JW spiders at a fixed interval")
    parser.add_argument("--spider", default="wol", help="Spider name")
    parser.add_argument(
        "--interval-minutes",
        type=int,
        default=360,
        help="Interval between runs (default: 360 minutes)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=200,
        help="Max items per run (default: 200)",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run once and exit",
    )

    args = parser.parse_args()

    if args.once:
        raise SystemExit(run_once(args.spider, args.limit))

    while True:
        code = run_once(args.spider, args.limit)
        if code != 0:
            print(f"[{_utc_now()}] Run exited with code {code}", flush=True)

        sleep_seconds = max(60, args.interval_minutes * 60)
        print(f"[{_utc_now()}] Sleeping {sleep_seconds} seconds", flush=True)
        time.sleep(sleep_seconds)


if __name__ == "__main__":
    main()
