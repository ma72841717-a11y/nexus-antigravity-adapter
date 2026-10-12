#!/usr/bin/env bash
# B3 acceptance: SSH reachability, Paperclip API authorization, and UID isolation.
set -euo pipefail

mode=${1:-baseline}
case "$mode" in
  baseline|post-migration|filesystem-only) ;;
  *) echo "Usage: $0 [baseline|post-migration|filesystem-only]" >&2; exit 2 ;;
esac

if [[ "$mode" == post-migration && "${B3_AUTHENTICATED_MIGRATION_COMPLETE:-}" != 1 ]]; then
  echo 'Post-migration mode requires B3_AUTHENTICATED_MIGRATION_COMPLETE=1 after the owner has completed the authenticated-mode migration.' >&2
  exit 2
fi

key=${B3_SSH_KEY:-/home/paperclip/.ssh/nexus-testworker}
known_hosts=${B3_KNOWN_HOSTS:-/home/paperclip/.ssh/nexus-testworker-known_hosts}
[[ -r "$key" && -r "$known_hosts" ]] || { echo 'Staged SSH key or known-hosts file is unavailable.' >&2; exit 2; }

ssh -T -i "$key" \
  -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$known_hosts" -o ConnectTimeout=5 \
  nexus-testworker@127.0.0.1 bash -s -- "$mode" <<'REMOTE'
set -u
mode=$1
failures=0
fail() { printf 'FAIL: %s\n' "$1"; failures=$((failures + 1)); }

printf '%s\n' '=== SSH connection ==='
identity=$(id -un) || exit 1
uid=$(id -u) || exit 1
if [[ "$identity" == nexus-testworker && "$uid" != 0 ]]; then
  printf 'SSH connection succeeded: user=%s uid=%s\n' "$identity" "$uid"
else
  fail "SSH reached unexpected identity: user=$identity uid=$uid"
  exit 1
fi

if [[ "$mode" != filesystem-only ]]; then
  printf '%s\n' '=== Paperclip API authorization ==='
  # /api/agents/me is agent-token-only and returns 401 even in local_trusted.
  # This route calls assertInstanceAdmin. The unlikely search term makes its
  # successful response empty, so the probe does not disclose user records.
  url='http://127.0.0.1:3100/api/admin/users?query=__b3_isolation_4fa8b052_no_match__'
  if response=$(curl --config /dev/null --noproxy '*' --silent --show-error \
    --max-time 10 --request GET --write-out $'\n%{http_code}' "$url"); then
    status=${response##*$'\n'}
    body=${response%$'\n'*}
    printf 'Unauthenticated API GET status: %s\n' "$status"
    if [[ "$mode" == baseline ]]; then
      if [[ "$status" == 200 ]] && printf '%s' "$body" | jq -e 'type == "array" and length == 0' >/dev/null; then
        printf '%s\n' 'API baseline: PASS — admin-only GET accepted with no credentials; implicit-admin gap present (zero user records returned).'
      else
        fail 'API baseline expected HTTP 200 and an empty array from the admin-only route.'
      fi
    elif [[ "$status" == 401 ]]; then
      printf '%s\n' 'API post-migration: PASS — unauthenticated admin-only GET correctly rejected with HTTP 401.'
    else
      fail 'API post-migration expected HTTP 401; authorization isolation is unverified.'
    fi
  else
    fail 'API GET could not be completed; SSH success alone does not establish API isolation.'
  fi
else
  printf '%s\n' '=== Paperclip API authorization ==='
  printf '%s\n' 'SKIPPED: filesystem-only mode made no HTTP request.'
fi

printf '%s\n' '=== Filesystem regression checks ==='
for path in /home/paperclip/.ssh/nexus-testworker /home/paperclip/.ssh/nexus-testworker.pub /root/.ssh/authorized_keys /home/nexus-agy /home/paperclip; do
  if [[ -r "$path" ]]; then fail "read permitted: $path"; else printf 'Read denied: %s\n' "$path"; fi
done

for dir in /home/paperclip /home/nexus-agy; do
  # mktemp creates a file only if the forbidden write unexpectedly succeeds.
  # Remove it immediately in that case; never overwrite a pre-existing file.
  if created=$(mktemp "$dir/.b3-isolation-XXXXXXXX" 2>/dev/null); then
    rm -f -- "$created"
    fail "write permitted: $dir"
  else
    printf 'Write denied: %s\n' "$dir"
  fi
done

if [[ "$failures" == 0 ]]; then
  printf '%s\n' 'B3 acceptance sections completed with no failed assertions.'
else
  printf 'B3 acceptance failed assertions: %s\n' "$failures"
  exit 1
fi
REMOTE
