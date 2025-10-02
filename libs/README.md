OpenSCAD WASM loader
====================

This app loads OpenSCAD WebAssembly from `libs/openscad.js` and `libs/openscad.wasm`.

How to vendor locally
- Run: `bash scripts/fetch-openscad-wasm.sh`
  - The script tries a couple of known mirrors for the OpenSCAD WASM build.
  - If they change, update the URLs in the script or download manually.

Manual placement
- Place the following files in `libs/`:
  - `openscad.js` (Emscripten loader exposing `window.OpenSCAD`)
  - `openscad.wasm` (the actual module)

Notes
- The app will fall back to a simple preview mesh if OpenSCAD is unavailable.
- The loader path is relative to site root and page: the code tries `/libs/openscad.js` then `libs/openscad.js`.

