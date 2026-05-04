#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT:-/repo}"
TEACHERS="${TEACHERS:-$ROOT/teachers}"
DEBOUNCE="${DEBOUNCE:-0.5}"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

compile() {
    local dir="$1"
    local name
    name="$(basename "$dir")"
    local typ="$dir/horaire.typ"
    local pdf="$dir/horaire.pdf"

    if [[ ! -f "$typ" ]]; then
        log "[$name] skip — no horaire.typ"
        return
    fi

    log "[$name] compiling..."
    local output
    if output=$(typst compile --root "$ROOT" "$typ" "$pdf" 2>&1); then
        log "[$name] OK"
    else
        log "[$name] ERROR"
        echo "$output" | sed 's/^/  /'
    fi
}

compile_all() {
    local count=0
    for dir in "$TEACHERS"/*/; do
        [[ -d "$dir" ]] || continue
        compile "$dir"
        (( count++ )) || true
    done
    log "initial compile: $count teacher(s)"
}

DIRTY=$(mktemp)
trap 'rm -f "$DIRTY"' EXIT

queue() {
    local path="$1"
    local rel="${path#$TEACHERS/}"
    local teacher="${rel%%/*}"
    if [[ -n "$teacher" && -d "$TEACHERS/$teacher" ]]; then
        echo "$teacher" >> "$DIRTY"
    fi
}

log "=== horaires-watch ==="
log "root=$ROOT  teachers=$TEACHERS  debounce=${DEBOUNCE}s"

[[ -d "$TEACHERS" ]] || { log "ERROR: $TEACHERS not found — mount teachers dir"; exit 1; }

compile_all
log "=== watching for changes ==="

while IFS= read -r path; do
    queue "$path"

    # drain more events within debounce window
    while IFS= read -r -t "$DEBOUNCE" path; do
        queue "$path"
    done

    # compile unique dirty teachers
    if [[ -s "$DIRTY" ]]; then
        while IFS= read -r teacher; do
            compile "$TEACHERS/$teacher"
        done < <(sort -u "$DIRTY")
        : > "$DIRTY"
    fi
done < <(
    inotifywait -r -m \
        -e close_write \
        -e moved_to \
        -e create \
        --format '%w%f' \
        --exclude '\.pdf$' \
        --quiet \
        "$TEACHERS" 2>/dev/null
)
