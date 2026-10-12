#!/bin/sh
# Fails with a clear message when the running Node doesn't match .nvmrc (major)
# and the minimum in package.json engines (24.15.0, needed by the NestJS 12 CLI).
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
want_major=$(tr -d ' \nv' < "$root/.nvmrc")
min="24.15.0"

if ! command -v node >/dev/null 2>&1; then
  echo "error: Node.js not found. Lamp needs Node $want_major (>= $min). Run: nvm install && nvm use" >&2
  exit 1
fi

have=$(node -p 'process.versions.node')
if ! node -e '
  const [have, wantMajor, min] = process.argv.slice(1);
  const parse = (v) => v.split(".").map(Number);
  const [ma, mi, pa] = parse(have);
  const [minMa, minMi, minPa] = parse(min);
  const atLeastMin = ma > minMa || (ma === minMa && (mi > minMi || (mi === minMi && pa >= minPa)));
  process.exit(String(ma) === wantMajor && atLeastMin ? 0 : 1);
' "$have" "$want_major" "$min"; then
  echo "error: Lamp needs Node $want_major (>= $min), but this shell runs Node $have." >&2
  echo "       Run: nvm install && nvm use   (reads .nvmrc)" >&2
  exit 1
fi
