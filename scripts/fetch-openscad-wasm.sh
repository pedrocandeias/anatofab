#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
dest_dir="libs"
mkdir -p "$dest_dir"

urls=(
  "https://files.openscad.org/wasm/openscad.js|https://files.openscad.org/wasm/openscad.wasm"
  "https://cdn.jsdelivr.net/gh/openscad/openscad.github.com/wasm/openscad.js|https://cdn.jsdelivr.net/gh/openscad/openscad.github.com/wasm/openscad.wasm"
)

download() {
  local js_url="$1" wasm_url="$2"
  echo "Trying: $js_url"
  if curl -fL "$js_url" -o "$dest_dir/openscad.js"; then
    echo "Trying: $wasm_url"
    curl -fL "$wasm_url" -o "$dest_dir/openscad.wasm"
    echo "Downloaded OpenSCAD WASM into $dest_dir/."
    return 0
  fi
  return 1
}

for entry in "${urls[@]}"; do
  IFS='|' read -r js_url wasm_url <<< "$entry"
  if download "$js_url" "$wasm_url"; then
    exit 0
  fi
done

echo "Failed to download OpenSCAD WASM. Please update the URLs in scripts/fetch-openscad-wasm.sh or place openscad.js and openscad.wasm into libs/." >&2
exit 1

