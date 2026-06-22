# Crawler Automation

This project includes a user-level systemd timer to run the crawler automatically every 6 hours.

## Install and start automation

From the repository root:

```bash
bash crawler/install_autocrawl.sh
```

The script installs:

- `~/.config/systemd/user/jw-crawler.service`
- `~/.config/systemd/user/jw-crawler.timer`
- `~/.config/jw-research/crawler.env` (optional overrides)

and enables/starts the timer.

## Optional configuration

Edit `~/.config/jw-research/crawler.env`:

```bash
CRAWLER_SPIDER=wol
CRAWLER_LIMIT=100
```

Then reload and restart timer:

```bash
systemctl --user daemon-reload
systemctl --user restart jw-crawler.timer
```

## Useful commands

```bash
systemctl --user status jw-crawler.timer
systemctl --user list-timers --all | grep jw-crawler
journalctl --user -u jw-crawler.service -n 100 --no-pager
```

## Stop automation

```bash
systemctl --user disable --now jw-crawler.timer
```
