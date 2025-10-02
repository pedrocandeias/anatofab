#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <path-to-openscad-wasm-tree>" >&2
  exit 2
fi

root="$1"
if [[ ! -d "$root" ]]; then
  echo "Directory not found: $root" >&2
  exit 2
fi

cd "$(dirname "$0")/.."
dest_dir="libs"
mkdir -p "$dest_dir"

find_best() {
  local name="$1"
  # find by filename, exclude .git and node_modules
  local file
  file=$(find "$root" -type f -name "$name" \
           -not -path "*/.git/*" -not -path "*/node_modules/*" \
           -printf "%s %p\n" 2>/dev/null | sort -nr | awk 'NR==1{print substr($0,index($0,$2))}')
  if [[ -z "$file" ]]; then
    return 1
  fi
  echo "$file"
}

js_src=$(find_best "openscad.js" || true)
wasm_src=$(find_best "openscad.wasm" || true)

if [[ -z "$js_src" || -z "$wasm_src" ]]; then
  echo "Could not locate openscad.js and/or openscad.wasm under: $root" >&2
  exit 3
fi

cp -f "$js_src" "$dest_dir/openscad.js"
cp -f "$wasm_src" "$dest_dir/openscad.wasm"
echo "Copied:" 
echo "  $js_src -> $dest_dir/openscad.js"
echo "  $wasm_src -> $dest_dir/openscad.wasm"

