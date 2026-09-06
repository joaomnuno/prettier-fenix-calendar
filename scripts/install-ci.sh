#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

command -v bun || {
  echo "install-ci.sh requires bun." >&2
  exit 69
}
command -v flock || {
  echo "install-ci.sh requires Linux flock." >&2
  exit 69
}
command -v timeout || {
  echo "install-ci.sh requires GNU timeout." >&2
  exit 69
}
command -v curl || {
  echo "install-ci.sh requires curl for the locked-tarball preflight." >&2
  exit 69
}
command -v sha256sum || {
  echo "install-ci.sh requires sha256sum for cache and install verification." >&2
  exit 69
}

runtime_root="${SITES_PROJECT_ROOT}/.sites-runtime"
expected_home="${runtime_root}/home"
expected_cache="${runtime_root}/bun-cache"

echo "[sites] validating writable install environment"
if [[ "${HOME}" != "${expected_home}" ]]; then
  echo "Expected HOME=${expected_home}, got HOME=${HOME}." >&2
  exit 78
fi
actual_cache="$(bun pm cache)"
if [[ "${actual_cache}" != "${expected_cache}" ]]; then
  echo "Expected bun cache ${expected_cache}, got ${actual_cache}." >&2
  exit 78
fi
mkdir -p "${expected_cache}"
touch "${HOME}/.sites-write-test" "${expected_cache}/.sites-write-test"
rm -f "${HOME}/.sites-write-test" "${expected_cache}/.sites-write-test"
echo "[sites] environment passed: HOME=${HOME}, cache=${expected_cache}"

lock_file="${runtime_root}/install.lock"
exec 9>"${lock_file}"
if ! flock -n 9; then
  echo "Another dependency install is already running for ${SITES_PROJECT_ROOT}." >&2
  exit 75
fi

# Catch an installer started outside this helper. Linux exposes both its command
# line and working directory through /proc, so avoid broad process-name matches.
for process in /proc/[0-9]*; do
  pid="${process##*/}"
  [[ "${pid}" != "$$" && "${pid}" != "${PPID}" ]] || continue
  process_cwd="$(readlink -f "${process}/cwd" || true)"
  [[ "${process_cwd}" == "${SITES_PROJECT_ROOT}" ]] || continue
  process_command="$(tr '\0' ' ' <"${process}/cmdline" || true)"
  if [[ "${process_command}" == *"bun install"* ]]; then
    echo "Another bun install is visible in ${SITES_PROJECT_ROOT}; refusing to overlap installs." >&2
    exit 75
  fi
done

lockfile_sha256="$(sha256sum "${SITES_PROJECT_ROOT}/bun.lock" | awk '{print $1}')"
use_seeded_cache=0
# Report seed selection separately from package cache hits or downloads.
cache_seed_result=seed_unavailable
seed_cache="${SITES_BUN_CACHE_SEED:-${SITES_NPM_CACHE_SEED:-}}"
if [[ -n "${seed_cache}" && -d "${seed_cache}" ]]; then
  seed_lockfile_sha256="$(cat "${seed_cache}/.sites-lockfile-sha256" || true)"
  if [[ "${seed_lockfile_sha256}" == "${lockfile_sha256}" ]]; then
    echo "[sites] restoring image-seeded bun cache"
    cp -a "${seed_cache}/." "${expected_cache}/"
    use_seeded_cache=1
    cache_seed_result=seed_used
    echo "[sites] image cache seed matched; registry fallback remains available"
  else
    cache_seed_result=seed_lockfile_mismatch
    echo "[sites] image cache seed does not match this lockfile; using the network path"
  fi
fi

locked_vinext_output="$({ bun "${SITES_PROJECT_ROOT}/scripts/read-locked-vinext.mjs" "${SITES_PROJECT_ROOT}/bun.lock"; })" || {
  echo "Could not read the integrity-pinned vinext tarball from bun.lock." >&2
  exit 65
}
mapfile -t locked_vinext <<<"${locked_vinext_output}"
if [[ "${#locked_vinext[@]}" -ne 2 ]]; then
  echo "Expected exactly one Vinext tarball path and integrity value from bun.lock." >&2
  exit 65
fi

locked_tarball_path="${locked_vinext[0]}"
locked_integrity="${locked_vinext[1]}"

if [[ "${use_seeded_cache}" == "0" ]]; then
  registry="${SITES_NPM_REGISTRY:-https://registry.npmjs.org}"
  preflight_url="${registry%/}${locked_tarball_path}"

  preflight_dir="${runtime_root}/preflight"
  preflight_tarball="${preflight_dir}/vinext.tgz"
  mkdir -p "${preflight_dir}"

  echo "[sites] downloading the complete locked vinext tarball"
  curl \
    --fail \
    --location \
    --silent \
    --show-error \
    --retry 0 \
    --connect-timeout 15 \
    --max-time 120 \
    --output "${preflight_tarball}" \
    "${preflight_url}"

  echo "[sites] verifying locked vinext tarball integrity"
  bun "${SITES_PROJECT_ROOT}/scripts/verify-integrity.mjs" "${preflight_tarball}" "${locked_integrity}"
  echo "[sites] network and integrity preflight passed"
fi

echo "[sites] running exactly one bounded bun install"
bun_install_args=(install --frozen-lockfile --no-progress --no-summary)
if [[ "${use_seeded_cache}" == "1" ]]; then
  bun_install_args+=(--prefer-offline)
fi
timeout \
  --signal=TERM \
  --kill-after="${SITES_INSTALL_KILL_AFTER:-15s}" \
  "${SITES_INSTALL_TIMEOUT:-8m}" \
  bun "${bun_install_args[@]}"

vinext="${SITES_PROJECT_ROOT}/node_modules/.bin/vinext"
if [[ ! -x "${vinext}" ]]; then
  echo "bun install exited successfully but node_modules/.bin/vinext is unavailable." >&2
  exit 69
fi

bun "${SITES_PROJECT_ROOT}/scripts/write-install-report.mjs" \
  "${SITES_PROJECT_ROOT}/node_modules/.sites-install.json" \
  "${lockfile_sha256}" \
  "${cache_seed_result}"
echo "[sites] bun install passed and vinext is available"
