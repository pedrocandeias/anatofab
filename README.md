Prosthetic Hand/Wrist Generator (with Phoenix Hand import)
=========================================================

This web app generates and assembles prosthetic hand parts. It supports:

- Parametric generation for wrist cuff and finger splint
- Importing exact Phoenix Hand models (Thingiverse 3063851) from local STL files
- In‑browser preview (ASCII STL) for single parts and full assembly
- STL download and optional STEP export (per‑part or full assembly)
- History of generated STL files

Features
- Tabs for parts: `Wrist Cuff`, `Finger Splint`, `Palm`, `Gauntlet`, `Pins`, `3‑Pin Tensioner`, `Proximal Finger`, `Proximal Thumb`, `Finger Tip`, and `All Parts`.
- Preview buttons render a simplified mesh for smooth interaction.
- “All Parts” shows the full plate/assembly and includes a `Hand: Right/Left` selector (Left mirrors the assembly).
- If Phoenix Hand STLs are present in `assets/phoenix_hand/`, they’re used automatically in previews and exports.

Requirements
- Python 3.10+ recommended
- Pip packages:
  - `Flask` (required)
  - `OCP` (optional; enables STEP export). Install with `pip install OCP`
    - Alternative (Conda): `conda install -c conda-forge pythonocc-core`

Quick Start
- Create and activate a virtualenv (optional but recommended):
  - `python3 -m venv .venv && source .venv/bin/activate`
- Install dependencies:
  - `pip install Flask`
  - Optional for STEP export: `pip install OCP`
- Run the app:
  - `python app.py`
  - Open `http://localhost:5000`

Using the App
- Choose a tab, set parameters (e.g., inner radius, length, taper), and click `Preview` to visualize.
- Click `Generate STL` to download an STL and save an entry in History.
- `Export STEP` (per‑part) or `Export STEP (All)` requires `OCP` (or conda pythonocc‑core). Without it, the server responds 501 with a help message.
- `All Parts` tab:
  - Select `Right` or `Left` hand.
  - Click `Preview All` to render the full assembly.
  - Click `Export STEP (All)` for a single STEP assembly of all parts.

Parametric Parts & Controls
- Cuff and Finger tabs:
  - `Inner Radius (mm)`: target fit radius.
  - `Length (mm)`: along the limb.
  - `Wrap Angle (deg)`: circumferential coverage.
  - `Thickness (mm)`: shell thickness.
  - `Segments Along Length` / `Segments Around Arc`: mesh resolution.
  - `Hole Period` / `Hole Size`: perforation spacing/size in grid cells (0 = solid).
  - `Taper`: radius reduction from base to tip.
- Other parts (Palm, Gauntlet, Pins, etc.): `Scale` for quick size adjustments.

Import Phoenix Hand models (Thingiverse 3063851)
1) Create the folder `assets/phoenix_hand/`
2) Download STLs from Thingiverse and place them with these exact names:
   - `palm.stl`
   - `gauntlet.stl`
   - `pins.stl`
   - `three_pin_tensioner.stl`
   - `proximal_finger.stl`
   - `proximal_thumb.stl`
   - `finger_tip.stl`
3) Refresh the app. Imported STLs will replace proxy geometry automatically for preview and export.

Custom Layout (optional)
- Default placement aims for a sensible plate layout. You can override transforms via JSON.
- Copy `data/phoenix_layout.example.json` to `data/phoenix_layout.json` and edit.
- Fields:
  - `translate`: `[x, y, z]` in millimeters
  - `rotate_deg_z`: rotation around Z in degrees
  - `copies`: array of placement objects (use for multiple proximal fingers)

Example JSON
```
{
  "placements": {
    "palm": { "translate": [0, 0, 0], "rotate_deg_z": 0 },
    "gauntlet": { "translate": [0, 0, -70] },
    "proximal_finger": { "copies": [
      { "translate": [-22, 35, 10] },
      { "translate": [-7, 35, 10] },
      { "translate": [7, 35, 10] },
      { "translate": [22, 35, 10] }
    ]},
    "proximal_thumb": { "translate": [-35, 15, 5], "rotate_deg_z": -20 },
    "finger_tip": { "translate": [22, 55, 12] },
    "pins": { "translate": [0, -35, 8] },
    "three_pin_tensioner": { "translate": [0, -50, 8] }
  }
}
```

STEP Export
- Install `OCP` with `pip install OCP` (works on most platforms/Python versions).
- If using Conda: `conda install -c conda-forge pythonocc-core`.
- If neither is installed, STEP export endpoints will return 501 with instructions.

Data and Outputs
- `output/`: generated `.stl` and `.step` files
- `data/cuffs.db`: SQLite history of per‑part STL generations
- `assets/phoenix_hand/`: place imported STLs here (optional)
- `data/phoenix_layout.json`: optional layout overrides

Troubleshooting
- STEP export 501: install `OCP` and restart the app.
- No assembly preview: ensure you clicked `Preview All`, and check browser devtools for fetch errors.
- Missing models: verify file names under `assets/phoenix_hand/` match the list above.

Notes
- This is a generic tool, not a medical device. Validate fit and safety.
- Exported STL is manifold with perforations and perimeter walls.
