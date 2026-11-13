#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
URL='http://127.0.0.1:4317'
LABEL='com.thomas.skill-manager'
DATA_DIR="$PROJECT_DIR/.skill-manager"
OPEN_BROWSER=true

case "${1:-}" in
  '') ;;
  --no-open) OPEN_BROWSER=false ;;
  *) printf '用法：%s [--no-open]\n' "$0" >&2; exit 1 ;;
esac
if [ "$#" -gt 1 ]; then
  printf '用法：%s [--no-open]\n' "$0" >&2
  exit 1
fi
if [ "$(uname -s)" != Darwin ]; then
  printf '此启动入口适用于 macOS；其他系统请运行 npm start。\n' >&2
  exit 1
fi

NODE_BIN=''
for candidate in "$(command -v node || true)" /opt/homebrew/bin/node /usr/local/bin/node /opt/homebrew/opt/node@24/bin/node /usr/local/opt/node@24/bin/node; do
  if [ -x "$candidate" ] && "$candidate" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' 2>/dev/null; then
    NODE_BIN="$candidate"
    break
  fi
done
if [ -z "$NODE_BIN" ]; then
  printf '需要 Node.js 22 或更新版本：https://nodejs.org/\n安装后重新打开此文件。\n' >&2
  exit 1
fi
VERSION="$("$NODE_BIN" -p 'JSON.parse(require("node:fs").readFileSync("package.json", "utf8")).version')"

ready() {
  local health
  health="$(/usr/bin/curl --noproxy '*' --fail --silent --max-time 2 "$URL/api/health")" || return 1
  "$NODE_BIN" -e 'try { const h = JSON.parse(process.argv[1]); process.exit(h.app === "thomas-skill-manager" && h.version === process.argv[2] ? 0 : 1); } catch { process.exit(1); }' "$health" "$VERSION"
}

if ! ready; then
  if /usr/sbin/lsof -nP -iTCP:4317 -sTCP:LISTEN -t >/dev/null 2>&1; then
    printf '4317 端口已有其他服务或旧版 Skill Manager。请确认后停止它，再重新启动。\n' >&2
    exit 1
  fi
  if /bin/launchctl list "$LABEL" >/dev/null 2>&1; then
    printf '后台任务已存在但未就绪。请检查：%s/server-error.log\n' "$DATA_DIR" >&2
    exit 1
  fi
  mkdir -p "$DATA_DIR"
  /bin/launchctl submit -l "$LABEL" -o "$DATA_DIR/server.log" -e "$DATA_DIR/server-error.log" -- "$NODE_BIN" "$PROJECT_DIR/server.mjs"
  for ((attempt = 0; attempt < 30; attempt++)); do
    if ready; then break; fi
    sleep 0.2
  done
fi

if ! ready; then
  printf '启动未完成。请检查：%s/server-error.log\n' "$DATA_DIR" >&2
  exit 1
fi
printf 'Skill Manager %s · %s\n%s\n仅可在这台 Mac 上访问。\n' "$VERSION" "$(hostname)" "$URL"
if [ "$OPEN_BROWSER" = true ]; then
  /usr/bin/open "$URL"
fi
