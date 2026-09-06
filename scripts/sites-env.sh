#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_root="${SITES_RUNTIME_ROOT:-${project_root}/.sites-runtime}"

mkdir -p \
  "${runtime_root}/home" \
  "${runtime_root}/bun-cache" \
  "${runtime_root}/xdg-config" \
  "${runtime_root}/tmp"

export SITES_ENV_READY=1
export SITES_PROJECT_ROOT="${project_root}"
export HOME="${runtime_root}/home"
export XDG_CONFIG_HOME="${runtime_root}/xdg-config"
export TMPDIR="${runtime_root}/tmp"

# The runtime may provide a global package cache. Keep the image's read-only
# Sites seed separate and make this project's writable cache authoritative.
unset BUN_INSTALL_CACHE_DIR || true
export BUN_INSTALL_CACHE_DIR="${runtime_root}/bun-cache"

# Bun reads npm_config_* aliases for proxies; the runtime already supplies the
# standard HTTP(S)_PROXY variables, so drop the duplicates.
unset \
  npm_config_proxy \
  npm_config_http_proxy \
  npm_config_https_proxy \
  NPM_CONFIG_PROXY \
  NPM_CONFIG_HTTP_PROXY \
  NPM_CONFIG_HTTPS_PROXY \
  || true

if [[ "${1:-}" == "--" ]]; then
  shift
fi

if [[ "$#" -eq 0 ]]; then
  echo "usage: scripts/sites-env.sh -- command [args...]" >&2
  exit 64
fi

cd "${project_root}"
exec "$@"
