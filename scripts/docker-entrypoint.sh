#!/bin/sh
set -eu

# Bind-mounted ./data is often root-owned; app runs as uid 10001.
# Ensure the SQLite parent directory exists and is writable before drop privileges.
state_path="${EXA_STATE_PATH:-/data/exa-proxy.sqlite}"
state_dir=$(dirname "$state_path")

mkdir -p "$state_dir"
if [ "$(id -u)" = "0" ]; then
  chown -R appuser:appuser "$state_dir" || true
  exec gosu appuser "$@"
fi

exec "$@"
