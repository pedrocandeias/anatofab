# Flexible Flyer Prosthetic Hand Configurator

This repository hosts a browser-based configurator for the Flexible Flyer prosthetic hand. The app loads OpenSCAD sources in the browser (via openscad-wasm) and renders STL previews with Three.js. You can tweak parameters, preview the results, and export printable meshes without leaving the browser.

## Prerequisites

- **Node/npm not required:** the app is a static bundle.
- **OpenSCAD WASM runtime:** `libs/openscad.js` and `libs/openscad.wasm` must be present. The repo already contains working builds; replace them if you need a newer OpenSCAD release.
- **Static web server:** run any HTTP server (examples below). Directly opening `index.html` from disk will fail because the browser blocks WASM fetches made with `file://` URLs.
- **Modern browser:** Chrome, Firefox, or Edge with WebGL support.

## File Layout

```
.
├── index.html          # UI shell and import-map for Three.js
├── app.js              # Main application logic
├── styles.css          # Styling for the configurator
├── models/             # OpenSCAD sources fetched into the WASM FS
├── libs/               # openscad-wasm runtime + helpers
└── scripts/            # Optional helper scripts (not required at runtime)
```

### OpenSCAD sources

`models/` contains all OpenSCAD modules used by the configurator. When the page loads the first time, `app.js` copies these files into the in-memory filesystem exposed by openscad-wasm so they can be imported during compilation. Keep new or replacement `.scad` files in this directory and update the `files` array inside `ensureScadModels` (in `app.js`) if you add more modules.

## Running the App Locally

1. **Launch a static server** from the project root. Examples:
   - Python 3: `python3 -m http.server 8000`
   - Node (http-server): `npx http-server -p 8000`
   - Ruby: `ruby -run -e httpd . -p 8000`
2. **Open** `http://localhost:8000/index.html` in a browser.
3. Wait for the status bar to report “OpenSCAD loaded.” The first load can take several seconds while the WASM runtime initializes.

## Using the Configurator

- **Tabs control what gets compiled**:
  - `Palm` – compiles only the palm module (`models/paraglider_palm_left.scad`).
  - `Fingers` – compiles the finger generator with thumb outputs disabled.
  - `Thumb` – compiles the finger generator with only thumb geometry.
  - `All` – compiles the full assembly.
  Switching tabs triggers an automatic rebuild. You can also press **Update Model** to recompile after adjusting sliders.

- **Parameter sliders and checkboxes** drive the SCAD variables. The sidebar sections mirror the parameter groups in the underlying SCAD files.

- **Status messages** at the bottom of the sidebar show the current action (loading OpenSCAD, compiling, errors, etc.). If OpenSCAD fails, the app falls back to a simple preview box so you still see changes to dimensions.

- **Exports**:
  - `Export STL` – writes an ASCII STL for the currently loaded geometry.
  - `Export STEP` – placeholder hook; OpenCascade integration is not yet implemented.

- **Saving configurations**: Use the **Save Config** button to download a JSON snapshot of the current parameters. Use **Load Config** to restore it later.

## Adding or Modifying OpenSCAD Files

1. Place new `.scad` files in `models/` (or subdirectories).
2. Update the `files` array inside `ensureScadModels` (in `app.js`) so the new file is copied into the WASM filesystem on load.
3. Adjust the SCAD generation helpers (`buildPalmScad`, `buildFingerScad`, `buildFullHandScad`) if the new module needs extra include directives or variable assignments.
4. Reload the page and check the browser console for fetch/compile errors.

### Preventing Auto-Rendering in SCAD Modules

`models/paraglider_palm_left.scad` and `models/fingerator.scad` expose `palm_auto_run` and `fingerator_auto_run` toggles. The JavaScript sets these flags to avoid duplicate geometry when the files are included from custom scripts. If you author new SCAD modules, provide a similar guard if they `include` and render immediately.

## Troubleshooting

| Symptom | Likely Cause | Fix |
| --- | --- | --- |
| `OpenSCAD not available` | WASM runtime missing or blocked | Confirm `libs/openscad.js` and `libs/openscad.wasm` exist and you’re running through HTTP, not `file://`. |
| `Failed to load model file` warnings | Missing `.scad` in `models/` | Verify the filenames listed in `ensureScadModels` match the files on disk. |
| “undefined variable” during compile | SCAD module expects parameters not set by JS | Extend the assignment list in `buildAssignmentString` or adjust defaults in the SCAD file. |
| Blank viewport | WebGL disabled or compile failed silently | Check the browser console; confirm WebGL support at `chrome://gpu` (Chrome) or `about:support` (Firefox). |

## Deployment

The app is static. Copy the repository contents to any static web host (Netlify, GitHub Pages, S3 + CloudFront, etc.). Ensure MIME types for `.wasm` files are served as `application/wasm`; most modern hosts handle this automatically.

## Contributing

- Follow the existing coding style (plain ES modules, no build step).
- Keep files ASCII unless a file already uses non-ASCII characters.
- Document new parameters or UI flows in this README.
- When modifying SCAD sources, prefer adding explanatory comments directly in the `.scad` file.

---

For historical artifacts, older scripts, and reference STLs see the `flexible_flyer/` and `old/` directories.
