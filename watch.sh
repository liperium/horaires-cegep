#!/usr/bin/env bash
# watch.sh — compile all teacher schedules then watch for changes
# Run from the repo root: ./watch.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
TEACHERS="$ROOT/teachers"

if [[ ! -d "$TEACHERS" ]]; then
  echo "No teachers/ directory found. Run from repo root." >&2
  exit 1
fi

pids=()

cleanup() {
  echo ""
  echo "Stopping all watchers..."
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

for dir in "$TEACHERS"/*/; do
  name="$(basename "$dir")"
  typ="$dir/horaire.typ"
  pdf="$dir/horaire.pdf"

  if [[ ! -f "$typ" ]]; then
    echo "[$name] Missing horaire.typ — skipping"
    continue
  fi

  echo "[$name] Initial compile..."
  typst compile --root "$ROOT" "$typ" "$pdf" \
    && echo "[$name] OK" \
    || echo "[$name] COMPILE ERROR (see above)"

  typst watch --root "$ROOT" "$typ" "$pdf" &
  pids+=($!)
  echo "[$name] Watching (PID $!)"
done

echo ""
echo "Watching ${#pids[@]} teacher(s). Ctrl+C to stop."
wait
