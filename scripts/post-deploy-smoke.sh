#!/usr/bin/env bash
# Read-only smoke checks for the public production surface after a deployment.
set -euo pipefail

base_url="${1:-https://equitywise.io}"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

get() {
  local path="$1"
  local expected="$2"
  local output="$tmp_dir/body"
  local status
  status="$(curl --silent --show-error --location --output "$output" --write-out '%{http_code}' "${base_url}${path}")"
  if [[ "$status" != "$expected" ]]; then
    echo "${path}: expected HTTP ${expected}, received ${status}" >&2
    return 1
  fi
}

# PM2 has only just restarted the web app, and Nginx answers 502 until Next.js is
# listening. Wait for it (up to ~90 s) before checking anything.
for attempt in $(seq 1 30); do
  status="$(curl --silent --output /dev/null --write-out '%{http_code}' "${base_url}/" || true)"
  [[ "$status" == '200' ]] && break
  echo "waiting for ${base_url} to come up (attempt ${attempt}, HTTP ${status})" >&2
  sleep 3
done

get / 200
grep --quiet 'Know why a stock deserves your attention' "$tmp_dir/body"

get /about 200
get /privacy 200
get /robots.txt 200
grep --quiet 'Sitemap:' "$tmp_dir/body"

api_status="$(curl --silent --show-error --output "$tmp_dir/api" --write-out '%{http_code}' "${base_url}/api/watchlists")"
if [[ "$api_status" != '401' ]]; then
  echo "/api/watchlists: expected HTTP 401, received ${api_status}" >&2
  exit 1
fi
grep --quiet 'UNAUTHENTICATED' "$tmp_dir/api"

headers="$(curl --silent --show-error --head "${base_url}/")"
grep --ignore-case --quiet '^strict-transport-security:' <<<"$headers"
grep --ignore-case --quiet '^content-security-policy:' <<<"$headers"
grep --ignore-case --quiet '^x-content-type-options: nosniff' <<<"$headers"

echo "Post-deploy smoke passed for ${base_url}"
