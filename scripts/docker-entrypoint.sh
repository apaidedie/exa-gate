#!/bin/sh
set -eu

# Bind-mounted ./data is often root-owned; app runs as uid 10001.
# Ensure the SQLite parent directory exists and is writable before drop privileges.
state_path="${EXA_STATE_PATH:-/data/exa-proxy.sqlite}"
state_dir=$(dirname "$state_path")

mkdir -p "$state_dir"
if [ "$(id -u)" = "0" ]; then
  chown -R appuser:appuser "$state_dir" || true
  if command -v gosu > /dev/null 2>&1; then
    exec gosu appuser "$@"
  fi
  if command -v su-exec > /dev/null 2>&1; then
    exec su-exec appuser "$@"
  fi
  echo "no privilege-drop helper (gosu/su-exec) found; running as current user" >&2
fi

exec "$@"
