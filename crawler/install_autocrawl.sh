#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_SYSTEMD_DIR="${HOME}/.config/systemd/user"
USER_CONFIG_DIR="${HOME}/.config/jw-research"

mkdir -p "${USER_SYSTEMD_DIR}"
mkdir -p "${USER_CONFIG_DIR}"

cp "${ROOT_DIR}/crawler/systemd/jw-crawler.service" "${USER_SYSTEMD_DIR}/jw-crawler.service"
cp "${ROOT_DIR}/crawler/systemd/jw-crawler.timer" "${USER_SYSTEMD_DIR}/jw-crawler.timer"

if [[ ! -f "${USER_CONFIG_DIR}/crawler.env" ]]; then
  cat > "${USER_CONFIG_DIR}/crawler.env" <<'EOF'
# Optional overrides for jw-crawler.service
# CRAWLER_SPIDER=wol
# CRAWLER_LIMIT=5000
EOF
fi

# If user kept the old default in place, bump it to the broader crawl default.
if [[ -f "${USER_CONFIG_DIR}/crawler.env" ]]; then
  sed -i 's/^CRAWLER_LIMIT=100$/CRAWLER_LIMIT=5000/' "${USER_CONFIG_DIR}/crawler.env" || true
fi

systemctl --user daemon-reload
systemctl --user enable --now jw-crawler.timer

echo "Autocrawl timer installed and started."
systemctl --user list-timers --all | grep -E 'jw-crawler.timer|NEXT|LAST' || true
