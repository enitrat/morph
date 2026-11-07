#!/usr/bin/env bash
# Drives the Tune bridge of a running dev server end to end. Fails unless the working tree ends
# byte for byte where it started.
# Run it from the host checkout. <page> is a route the dev server renders, <file> a repo path that
# page bundles, and <line>:<col> a JSX tag in it for the ask to target.
# Usage: scripts/bridge-check.sh <origin> <page> <file> <line> <col> "<words>"
set -euo pipefail

[ "$#" -eq 6 ] || { echo 'usage: bridge-check.sh <origin> <page> <file> <line> <col> "<words>"' >&2; exit 2; }
ORIGIN="$1"
PAGE="$2"
FILE="$3"
LINE="$4"
COL="$5"
WORDS="$6"
API="$ORIGIN/api/tune"
ROOT="$(git rev-parse --show-toplevel)"
ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"

fail() { echo "FAIL: $*" >&2; exit 1; }
now() { node -e 'console.log(Date.now())'; }

# The whole working tree, untracked files included, as one tree id; the real index is untouched.
tree() {
  local index
  index="$(mktemp -u)"
  cp "$(git -C "$ROOT" rev-parse --path-format=absolute --git-path index)" "$index"
  GIT_INDEX_FILE="$index" git -C "$ROOT" add -A
  GIT_INDEX_FILE="$index" git -C "$ROOT" write-tree
  rm -f "$index"
}

call() {
  local out status
  out="$(curl -s -w '\n%{http_code}' "$@")"
  status="${out##*$'\n'}"
  BODY="${out%$'\n'*}"
  STATUS="$status"
}

BEFORE="$(tree)"
echo "tree before: $BEFORE"

call -X POST "$API/ask" -H 'content-type: application/json' -d '{}'
[ "$STATUS" = 403 ] || fail "POST without x-tune answered $STATUS"
call -X POST "$API/ask" -H 'x-tune: 1' -H 'origin: http://evil.example' -d '{}'
[ "$STATUS" = 403 ] || fail "foreign origin answered $STATUS"
call -X POST "$API/ask" -H 'x-tune: 1' -H 'content-type: application/json' -d '{"id":"nope"}'
[ "$STATUS" = 400 ] || fail "bad ask answered $STATUS"
echo "guard: 403 without x-tune, 403 foreign origin, 400 malformed ask"

FRAME="$(node "$(dirname "$0")/frame-of.mjs" "$ORIGIN" "$PAGE" "$FILE")"
call -G "$API/locate" --data-urlencode "frame=${FRAME% *}"
[ "$STATUS" = 200 ] || fail "locate answered $STATUS: $BODY"
GOT="$(jq -r '.sources[0] | "\(.path):\(.line)"' <<<"$BODY")"
[ "$GOT" = "${FRAME#* }" ] || fail "locate resolved ${FRAME% *} to $GOT, expected ${FRAME#* }"
echo "locate: ${FRAME% *} -> $GOT"

ASK=$(jq -nc --arg id "$ID" --arg path "$FILE" --arg words "$WORDS" \
  --argjson line "$LINE" --argjson col "$COL" '{id: $id, words: $words,
  targets: [{source: {path: $path, line: $line, col: $col}, owner: [], text: ""}],
  marks: [], count: 3}')
T0="$(now)"
call -X POST "$API/ask" -H 'x-tune: 1' -H 'content-type: application/json' -d "$ASK"
[ "$STATUS" = 200 ] || fail "ask answered $STATUS: $BODY"
echo "ask: 200 in $(( $(now) - T0 )) ms; $(jq -r '[.variants[].direction.title] | join(" | ")' <<<"$BODY")"
call -X POST "$API/ask" -H 'x-tune: 1' -H 'content-type: application/json' -d "$ASK"
[ "$STATUS" = 200 ] || fail "re-posted ask answered $STATUS"
OTHER=$(jq -c --arg id "$(uuidgen | tr '[:upper:]' '[:lower:]')" '.id = $id' <<<"$ASK")
call -X POST "$API/ask" -H 'x-tune: 1' -H 'content-type: application/json' -d "$OTHER"
[ "$STATUS" = 409 ] || fail "a second session answered $STATUS"
echo "ask is idempotent by id; a second session gets 409 $(jq -c .error <<<"$BODY")"

FIRST=""
while :; do
  call "$API/session?id=$ID"
  [ "$STATUS" = 200 ] || fail "session answered $STATUS: $BODY"
  if [ -z "$FIRST" ] && jq -e '.live != null' <<<"$BODY" >/dev/null; then
    FIRST="$(( $(now) - T0 ))"
    echo "first variant shown $FIRST ms after ask: $(jq -c .live <<<"$BODY")"
  fi
  jq -e 'all(.variants[]; .state != "pending")' <<<"$BODY" >/dev/null && break
  sleep 1
done
jq -r '.variants[] | "  \(.id) \(.state): \(.title // .reason // "")"' <<<"$BODY"
READY=($(jq -r '.variants[] | select(.state == "ready") | .id' <<<"$BODY"))
[ "${#READY[@]}" -ge 2 ] || fail "fewer than two variants are ready"
SHOWN="$(jq -r .live.variant <<<"$BODY")"

for V in "${READY[0]}" "${READY[1]}" "${READY[1]}"; do
  call -X POST "$API/show" -H 'x-tune: 1' -H 'content-type: application/json' \
    -d "{\"id\":\"$ID\",\"variant\":\"$V\"}"
  [ "$STATUS" = 200 ] || fail "show $V answered $STATUS: $BODY"
  [ "$(jq -r .live.variant <<<"$BODY")" = "$V" ] || fail "show $V left $(jq -c .live <<<"$BODY") live"
  echo "show $V: live tree $(tree), $(git -C "$ROOT" diff --shortstat -- "$FILE")"
done

call -X POST "$API/discard" -H 'x-tune: 1' -H 'content-type: application/json' -d "{\"id\":\"$ID\"}"
[ "$STATUS" = 200 ] || fail "discard answered $STATUS: $BODY"
call -X POST "$API/discard" -H 'x-tune: 1' -H 'content-type: application/json' -d "{\"id\":\"$ID\"}"
[ "$STATUS" = 200 ] || fail "a second discard answered $STATUS"
call "$API/session?id=$ID"
[ "$STATUS" = 404 ] || fail "a discarded session answered $STATUS"
[ -z "$(git -C "$ROOT" for-each-ref "refs/worktree/tune/$ID/")" ] || fail "refs of $ID survive discard"

AFTER="$(tree)"
[ "$AFTER" = "$BEFORE" ] || fail "tree after discard is $AFTER, not $BEFORE"
echo "discard (twice): session 404, refs gone, tree after = tree before ($AFTER)"
echo "auto-shown first: $SHOWN; end-to-end ask -> first shown: $FIRST ms"
