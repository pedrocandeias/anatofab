import os
import math
import sqlite3
from datetime import datetime
from typing import List, Tuple, Optional

from flask import Flask, render_template, request, send_file, redirect, url_for, g, flash, Response


# ------------ App setup ------------

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DB_PATH = os.path.join(BASE_DIR, "data", "cuffs.db")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
ASSETS_DIR = os.path.join(BASE_DIR, "assets", "phoenix_hand")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.update(SECRET_KEY=os.environ.get("SECRET_KEY", "dev-secret"))

    @app.before_request
    def before_request():
        g.db = get_db()
        ensure_schema(g.db)

    @app.teardown_request
    def teardown_request(exception):
        db = getattr(g, 'db', None)
        if db is not None:
            db.close()

    @app.route("/")
    def index():
        defaults = dict(
            cuff=default_params("cuff"),
            finger=default_params("finger"),
        )
        return render_template("index.html", defaults=defaults)

    @app.route("/generate", methods=["POST"])
    def generate():
        # Collect params from form
        part = request.form.get("part", "cuff")
        params = parse_params(request.form, part)

        # Build mesh and write STL
        triangles = generate_mesh_for_part(part, **params)
        stl_bytes = triangles_to_stl_bytes(triangles, name=f"hand_{part}")

        # Persist record and file
        timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        filename = f"{part}_{timestamp}.stl"
        filepath = os.path.join(OUTPUT_DIR, filename)
        with open(filepath, "wb") as f:
            f.write(stl_bytes)

        cfg_id = insert_config(g.db, part, params, filename)
        flash("Model generated and saved.")
        return send_file(filepath, as_attachment=True, download_name=filename)

    @app.route("/history")
    def history():
        rows = list_configs(g.db)
        return render_template("history.html", rows=rows)

    @app.route("/download/<int:cfg_id>")
    def download(cfg_id: int):
        row = get_config(g.db, cfg_id)
        if not row:
            flash("Configuration not found.")
            return redirect(url_for("history"))
        filepath = os.path.join(OUTPUT_DIR, row["filename"])
        if not os.path.exists(filepath):
            flash("Generated file missing on disk.")
            return redirect(url_for("history"))
        return send_file(filepath, as_attachment=True, download_name=row["filename"])

    @app.route("/stl")
    def stl_inline():
        # Return ASCII STL for in-browser preview (reduced resolution when preview=1)
        part = request.args.get("part", "cuff")
        preview = request.args.get("preview", "1") == "1"
        params = parse_params(request.args, part)
        if preview:
            # Cap resolution for fast rendering
            params["grid_u"] = max(6, min(params["grid_u"], 40))
            params["grid_v"] = max(6, min(params["grid_v"], 60))
        tris = generate_mesh_for_part(part, **params)
        stl = triangles_to_stl_bytes(tris, name=f"preview_{part}")
        return Response(stl, mimetype="text/plain")

    @app.route("/stl_all")
    def stl_all_inline():
        # Combined preview of all parts together (reduced resolution when preview=1)
        preview = request.args.get("preview", "1") == "1"
        hand = request.args.get("hand", "right")
        cuff_params = parse_params_prefixed(request.args, part="cuff", prefix="cuff.")
        finger_params = parse_params_prefixed(request.args, part="finger", prefix="finger.")
        palm_params = parse_params_prefixed(request.args, part="palm", prefix="palm.")
        gauntlet_params = parse_params_prefixed(request.args, part="gauntlet", prefix="gauntlet.")
        pins_params = parse_params_prefixed(request.args, part="pins", prefix="pins.")
        tensioner_params = parse_params_prefixed(request.args, part="three_pin_tensioner", prefix="three_pin_tensioner.")
        prox_finger_params = parse_params_prefixed(request.args, part="proximal_finger", prefix="proximal_finger.")
        prox_thumb_params = parse_params_prefixed(request.args, part="proximal_thumb", prefix="proximal_thumb.")
        fingertip_params = parse_params_prefixed(request.args, part="finger_tip", prefix="finger_tip.")
        if preview:
            for p in (cuff_params, finger_params):
                p["grid_u"] = max(6, min(p["grid_u"], 40))
                p["grid_v"] = max(6, min(p["grid_v"], 60))
        tris = generate_combined_mesh(
            cuff_params,
            finger_params,
            palm_params,
            gauntlet_params,
            pins_params,
            tensioner_params,
            prox_finger_params,
            prox_thumb_params,
            fingertip_params,
            hand=hand,
        )
        stl = triangles_to_stl_bytes(tris, name="preview_all")
        return Response(stl, mimetype="text/plain")

    @app.route("/export_step")
    def export_step():
        # Export STEP of selected part, or all together if all=1
        is_all = request.args.get("all") == "1"
        hand = request.args.get("hand", "right")
        timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        if is_all:
            cuff_params = parse_params_prefixed(request.args, part="cuff", prefix="cuff.")
            finger_params = parse_params_prefixed(request.args, part="finger", prefix="finger.")
            palm_params = parse_params_prefixed(request.args, part="palm", prefix="palm.")
            gauntlet_params = parse_params_prefixed(request.args, part="gauntlet", prefix="gauntlet.")
            pins_params = parse_params_prefixed(request.args, part="pins", prefix="pins.")
            tensioner_params = parse_params_prefixed(request.args, part="three_pin_tensioner", prefix="three_pin_tensioner.")
            prox_finger_params = parse_params_prefixed(request.args, part="proximal_finger", prefix="proximal_finger.")
            prox_thumb_params = parse_params_prefixed(request.args, part="proximal_thumb", prefix="proximal_thumb.")
            fingertip_params = parse_params_prefixed(request.args, part="finger_tip", prefix="finger_tip.")
            tris = generate_combined_mesh(
                cuff_params,
                finger_params,
                palm_params,
                gauntlet_params,
                pins_params,
                tensioner_params,
                prox_finger_params,
                prox_thumb_params,
                fingertip_params,
                hand=hand,
            )
            filename = f"prosthetic_all_{timestamp}.step"
        else:
            part = request.args.get("part", "cuff")
            params = parse_params(request.args, part)
            tris = generate_mesh_for_part(part, **params)
            filename = f"{part}_{timestamp}.step"

        filepath = os.path.join(OUTPUT_DIR, filename)
        try:
            write_step_from_tris(tris, filepath)
        except RuntimeError as e:
            return Response(str(e), status=501, mimetype="text/plain")
        return send_file(filepath, as_attachment=True, download_name=filename)

    return app


# ------------ DB helpers ------------

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_schema(conn: sqlite3.Connection):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            part TEXT DEFAULT 'cuff',
            name TEXT,
            inner_radius_mm REAL,
            length_mm REAL,
            arc_deg REAL,
            thickness_mm REAL,
            grid_u INTEGER,
            grid_v INTEGER,
            hole_every_n INTEGER,
            hole_size_cells INTEGER,
            filename TEXT NOT NULL
        )
        """
    )
    # Add missing columns if DB was created before
    cols = {row[1] for row in conn.execute("PRAGMA table_info(configs)")}
    if "part" not in cols:
        conn.execute("ALTER TABLE configs ADD COLUMN part TEXT DEFAULT 'cuff'")
    conn.commit()


def insert_config(conn: sqlite3.Connection, part: str, params: dict, filename: str) -> int:
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO configs (
            created_at, part, name, inner_radius_mm, length_mm, arc_deg, thickness_mm,
            grid_u, grid_v, hole_every_n, hole_size_cells, filename
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            datetime.utcnow().isoformat(timespec="seconds"),
            part,
            params.get("name"),
            params.get("inner_radius_mm"),
            params.get("length_mm"),
            params.get("arc_deg"),
            params.get("thickness_mm"),
            params.get("grid_u"),
            params.get("grid_v"),
            params.get("hole_every_n"),
            params.get("hole_size_cells"),
            filename,
        ),
    )
    conn.commit()
    return cur.lastrowid


def list_configs(conn: sqlite3.Connection):
    cur = conn.cursor()
    cur.execute("SELECT * FROM configs ORDER BY id DESC")
    return cur.fetchall()


def get_config(conn: sqlite3.Connection, cfg_id: int):
    cur = conn.cursor()
    cur.execute("SELECT * FROM configs WHERE id=?", (cfg_id,))
    return cur.fetchone()


# ------------ Param parsing ------------

def default_params(part: str = "cuff"):
    if part == "finger":
        return dict(
            name="Finger Splint",
            inner_radius_mm=10.0,
            length_mm=55.0,
            arc_deg=220.0,
            thickness_mm=2.2,
            grid_u=28,
            grid_v=48,
            hole_every_n=4,
            hole_size_cells=1,
            taper_ratio=0.2,
            scale=1.0,
        )
    if part == "palm":
        return dict(name="Palm", scale=1.0)
    if part == "gauntlet":
        return dict(
            name="Gauntlet",
            inner_radius_mm=40.0,
            length_mm=90.0,
            arc_deg=220.0,
            thickness_mm=3.0,
            grid_u=36,
            grid_v=56,
            hole_every_n=5,
            hole_size_cells=2,
            taper_ratio=0.0,
            scale=1.0,
        )
    if part == "pins":
        return dict(name="Pins", scale=1.0)
    if part == "three_pin_tensioner":
        return dict(name="Three-Pin Tensioner", scale=1.0)
    if part == "proximal_finger":
        return dict(
            name="Proximal Finger",
            inner_radius_mm=11.0,
            length_mm=30.0,
            arc_deg=230.0,
            thickness_mm=2.5,
            grid_u=20,
            grid_v=36,
            hole_every_n=3,
            hole_size_cells=1,
            taper_ratio=0.1,
            scale=1.0,
        )
    if part == "proximal_thumb":
        return dict(
            name="Proximal Thumb",
            inner_radius_mm=13.0,
            length_mm=25.0,
            arc_deg=240.0,
            thickness_mm=2.5,
            grid_u=18,
            grid_v=34,
            hole_every_n=3,
            hole_size_cells=1,
            taper_ratio=0.1,
            scale=1.0,
        )
    if part == "finger_tip":
        return dict(name="Finger Tip", scale=1.0)
    return dict(
        name="Wrist Cuff",
        inner_radius_mm=38.0,      # ~ 76 mm diameter (~ 24 cm circumference)
        length_mm=120.0,
        arc_deg=200.0,
        thickness_mm=3.0,
        grid_u=40,
        grid_v=60,
        hole_every_n=5,
        hole_size_cells=2,
        taper_ratio=0.0,
        scale=1.0,
    )


def parse_params(form, part: str = "cuff") -> dict:
    def f(key, cast, default):
        try:
            return cast(form.get(key, default))
        except Exception:
            return default

    defaults = default_params(part)
    params = dict(
        name=form.get("name", defaults["name"]).strip()[:80],
        inner_radius_mm=f("inner_radius_mm", float, 38.0),
        length_mm=f("length_mm", float, 120.0),
        arc_deg=max(30.0, min(330.0, f("arc_deg", float, 200.0))),
        thickness_mm=max(1.0, min(10.0, f("thickness_mm", float, 3.0))),
        grid_u=max(6, min(200, f("grid_u", int, 40))),
        grid_v=max(6, min(300, f("grid_v", int, 60))),
        hole_every_n=max(0, min(50, f("hole_every_n", int, 5))),
        hole_size_cells=max(0, min(10, f("hole_size_cells", int, 2))),
        taper_ratio=max(0.0, min(0.9, f("taper_ratio", float, defaults.get("taper_ratio", 0.0)))),
        scale=max(0.2, min(3.0, f("scale", float, defaults.get("scale", 1.0))))
    )
    return params


def parse_params_prefixed(form, part: str, prefix: str) -> dict:
    # Like parse_params but reads keys with a prefix (e.g., cuff.inner_radius_mm)
    class Pref:
        def get(self, key, default=None):
            return form.get(prefix + key, default)

    return parse_params(Pref(), part)


# ------------ Geometry + STL ------------

Vec3 = Tuple[float, float, float]
Tri = Tuple[Vec3, Vec3, Vec3]


def generate_cuff_mesh(
    name: str,
    inner_radius_mm: float,
    length_mm: float,
    arc_deg: float,
    thickness_mm: float,
    grid_u: int,
    grid_v: int,
    hole_every_n: int,
    hole_size_cells: int,
    taper_ratio: float = 0.0,
) -> List[Tri]:
    """
    Generate a cylindrical cuff with optional rectangular perforations.
    Returns a list of triangles (each triangle is 3 tuples of floats).
    """
    R = inner_radius_mm
    T = thickness_mm
    L = length_mm
    arc_rad = math.radians(arc_deg)

    # Create parametric grids for inner (R) and outer (R+T) surfaces
    U = grid_u
    V = grid_v

    def point(u_idx: int, v_idx: int, radius: float) -> Vec3:
        u = u_idx / (U - 1)
        v = v_idx / (V - 1)
        ang = (v - 0.5) * arc_rad
        r_here = radius * (1.0 - taper_ratio * u)
        x = r_here * math.cos(ang)
        y = r_here * math.sin(ang)
        z = u * L
        return (x, y, z)

    inner = [[point(i, j, R) for j in range(V)] for i in range(U)]
    outer = [[point(i, j, R + T) for j in range(V)] for i in range(U)]

    # Prepare hole mask: True means the cell (quad) is a hole (skip skins)
    hole = [[False for _ in range(V - 1)] for _ in range(U - 1)]
    if hole_every_n > 0 and hole_size_cells > 0:
        step = hole_every_n
        size = hole_size_cells
        for i in range(0, U - 1, step):
            for j in range(0, V - 1, step):
                # Carve a size x size block starting offset by half to stagger
                for di in range(size):
                    for dj in range(size):
                        ii = i + di
                        jj = j + dj
                        if 0 <= ii < U - 1 and 0 <= jj < V - 1:
                            hole[ii][jj] = True

    tris: List[Tri] = []

    def add_quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, flip: bool = False):
        # Triangulate quad a-b-c-d (a-b-c, a-c-d). Optionally flip winding.
        if flip:
            tris.append((a, c, b))
            tris.append((a, d, c))
        else:
            tris.append((a, b, c))
            tris.append((a, c, d))

    # Skin surfaces (inner and outer), skipping holes
    for i in range(U - 1):
        for j in range(V - 1):
            if hole[i][j]:
                continue
            a_in, b_in, c_in, d_in = inner[i][j], inner[i][j + 1], inner[i + 1][j + 1], inner[i + 1][j]
            a_out, b_out, c_out, d_out = outer[i][j], outer[i][j + 1], outer[i + 1][j + 1], outer[i + 1][j]
            # Inner surface faces inward -> flip to ensure outward normals
            add_quad(a_in, b_in, c_in, d_in, flip=True)
            # Outer surface faces outward
            add_quad(d_out, c_out, b_out, a_out, flip=False)

    # Rims around holes: connect inner and outer along hole edges
    def add_wall(p0_in: Vec3, p1_in: Vec3, p1_out: Vec3, p0_out: Vec3):
        # Quad from inner edge to outer edge with outward normal roughly outward
        add_quad(p0_in, p1_in, p1_out, p0_out, flip=False)

    for i in range(U - 1):
        for j in range(V - 1):
            if not hole[i][j]:
                continue
            # Four edges: u-, u+, v-, v+
            # Edge along v between (i,j)-(i,j+1)
            if j == 0 or not hole[i][j - 1]:
                add_wall(inner[i][j], inner[i][j + 1], outer[i][j + 1], outer[i][j])
            if j == V - 2 or not hole[i][j + 1]:
                add_wall(inner[i + 1][j + 1], inner[i + 1][j], outer[i + 1][j], outer[i + 1][j + 1])
            if i == 0 or not hole[i - 1][j]:
                add_wall(inner[i][j], inner[i + 1][j], outer[i + 1][j], outer[i][j])
            if i == U - 2 or not hole[i + 1][j]:
                add_wall(inner[i + 1][j + 1], inner[i][j + 1], outer[i][j + 1], outer[i + 1][j + 1])

    # Perimeter side walls along v = 0 and v = V-1 (open arc edges)
    for i in range(U - 1):
        # v = 0 edge
        add_wall(inner[i][0], inner[i + 1][0], outer[i + 1][0], outer[i][0])
        # v = V-1 edge
        add_wall(inner[i + 1][V - 1], inner[i][V - 1], outer[i][V - 1], outer[i + 1][V - 1])

    # End caps at u = 0 and u = U-1, but skip where holes exist to keep perforations through
    for j in range(V - 1):
        if not hole[0][j]:
            add_wall(inner[0][j], inner[0][j + 1], outer[0][j + 1], outer[0][j])
        if not hole[U - 2][j]:
            add_wall(inner[U - 1][j + 1], inner[U - 1][j], outer[U - 1][j], outer[U - 1][j + 1])

    return tris


def generate_mesh_for_part(part: str, **params) -> List[Tri]:
    s = params.get("scale", 1.0)
    # Try external assets first (Thingiverse Phoenix Hand STLs)
    ext = load_external_part_mesh(part)
    if ext is not None:
        tris = ext
        if s != 1.0:
            tris = scale_tris(tris, s, s, s)
        return tris
    if part in ("cuff", "finger", "gauntlet", "proximal_finger", "proximal_thumb"):
        p = dict(params)
        p.pop("scale", None)
        tris = generate_cuff_mesh(**p)
        if s != 1.0:
            tris = scale_tris(tris, s, s, s)
        return tris
    if part == "palm":
        # Simple proxy palm plate (mm): width x depth x height
        w, d, h = 60.0*s, 8.0*s, 80.0*s
        return generate_box_mesh(w, d, h)
    if part == "pins":
        # Three small solid cylinders
        tris: List[Tri] = []
        base_r, h = 2.5*s, 12.0*s
        seg = 20
        for i, x in enumerate([-6.0, 0.0, 6.0]):
            c = generate_cylinder_mesh(base_r, h, seg)
            tris.extend(transform_tris(c, translate=(x, 0.0, 0.0)))
        return tris
    if part == "three_pin_tensioner":
        # Simple proxy block
        return generate_box_mesh(18.0*s, 8.0*s, 30.0*s)
    if part == "finger_tip":
        return generate_box_mesh(16.0*s, 10.0*s, 12.0*s)
    # default fallback
    return generate_cuff_mesh(**params)


def transform_tris(
    tris: List[Tri],
    translate: Tuple[float, float, float] = (0.0, 0.0, 0.0),
    rotate_deg_z: float = 0.0,
) -> List[Tri]:
    ang = math.radians(rotate_deg_z)
    ca, sa = math.cos(ang), math.sin(ang)

    def tf(p: Vec3) -> Vec3:
        x, y, z = p
        xr = ca * x - sa * y
        yr = sa * x + ca * y
        return (xr + translate[0], yr + translate[1], z + translate[2])

    out: List[Tri] = []
    for a, b, c in tris:
        out.append((tf(a), tf(b), tf(c)))
    return out


def generate_combined_mesh(
    cuff_params: dict,
    finger_params: dict,
    palm_params: dict,
    gauntlet_params: dict,
    pins_params: dict,
    tensioner_params: dict,
    prox_finger_params: dict,
    prox_thumb_params: dict,
    fingertip_params: dict,
    hand: str = "right",
) -> List[Tri]:
    out: List[Tri] = []

    # Load optional placement overrides
    placements = load_layout_placements() or {}

    # Helper to apply a placement dict
    def place(name: str, tris: List[Tri]):
        pl = placements.get(name)
        if not pl:
            return tris
        if "copies" in pl and isinstance(pl["copies"], list):
            acc: List[Tri] = []
            for cp in pl["copies"]:
                t = tuple(cp.get("translate", (0.0, 0.0, 0.0)))
                rz = float(cp.get("rotate_deg_z", 0.0))
                acc += transform_tris(tris, translate=t, rotate_deg_z=rz)
            return acc
        t = tuple(pl.get("translate", (0.0, 0.0, 0.0)))
        rz = float(pl.get("rotate_deg_z", 0.0))
        return transform_tris(tris, translate=t, rotate_deg_z=rz)

    # Base cuff and finger splint
    cuff = generate_mesh_for_part("cuff", **cuff_params)
    out += cuff
    finger = generate_mesh_for_part("finger", **finger_params)
    # default finger offset if no placement provided
    finger_default = transform_tris(
        finger,
        translate=(
            cuff_params.get("inner_radius_mm", 38.0)
            + cuff_params.get("thickness_mm", 3.0)
            + 35.0,
            0.0,
            0.0,
        ),
    )
    out += place("finger", finger_default)

    # Palm
    palm = generate_mesh_for_part("palm", **palm_params)
    out += place("palm", palm) if placements.get("palm") else transform_tris(palm, translate=(0.0, 0.0, 0.0))

    # Gauntlet
    gaunt = generate_mesh_for_part("gauntlet", **gauntlet_params)
    out += place("gauntlet", gaunt) if placements.get("gauntlet") else transform_tris(gaunt, translate=(0.0, 0.0, -70.0))

    # Proximal fingers (4)
    pf = generate_mesh_for_part("proximal_finger", **prox_finger_params)
    if placements.get("proximal_finger"):
        out += place("proximal_finger", pf)
    else:
        for xo in (-22.0, -7.0, 7.0, 22.0):
            out += transform_tris(pf, translate=(xo, 35.0, 10.0))

    # Proximal thumb
    pthumb = generate_mesh_for_part("proximal_thumb", **prox_thumb_params)
    if placements.get("proximal_thumb"):
        out += place("proximal_thumb", pthumb)
    else:
        out += transform_tris(pthumb, translate=(-35.0, 15.0, 5.0), rotate_deg_z=-20.0)

    # Finger tip
    ftip = generate_mesh_for_part("finger_tip", **fingertip_params)
    out += place("finger_tip", ftip) if placements.get("finger_tip") else transform_tris(ftip, translate=(22.0, 55.0, 12.0))

    # Pins and tensioner
    pins = generate_mesh_for_part("pins", **pins_params)
    out += place("pins", pins) if placements.get("pins") else transform_tris(pins, translate=(0.0, -35.0, 8.0))
    tens = generate_mesh_for_part("three_pin_tensioner", **tensioner_params)
    out += place("three_pin_tensioner", tens) if placements.get("three_pin_tensioner") else transform_tris(tens, translate=(0.0, -50.0, 8.0))

    # Mirror for left hand if requested
    if (hand or "right").lower().startswith("l"):
        out = mirror_tris(out, axis='y')
    return out


def load_layout_placements():
    cfg_path = os.path.join(BASE_DIR, 'data', 'phoenix_layout.json')
    if not os.path.exists(cfg_path):
        return None
    try:
        import json
        with open(cfg_path, 'r') as f:
            cfg = json.load(f)
            return cfg.get('placements', {})
    except Exception:
        return None


def triangles_to_stl_bytes(tris: List[Tri], name: str = "mesh") -> bytes:
    def normal(a: Vec3, b: Vec3, c: Vec3) -> Vec3:
        ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
        vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
        nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
        length = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
        return (nx / length, ny / length, nz / length)

    lines = [f"solid {name}\n".encode("ascii")]
    for a, b, c in tris:
        n = normal(a, b, c)
        lines.append(
            (
                f"  facet normal {n[0]:.6e} {n[1]:.6e} {n[2]:.6e}\n"
                "    outer loop\n"
                f"      vertex {a[0]:.6e} {a[1]:.6e} {a[2]:.6e}\n"
                f"      vertex {b[0]:.6e} {b[1]:.6e} {b[2]:.6e}\n"
                f"      vertex {c[0]:.6e} {c[1]:.6e} {c[2]:.6e}\n"
                "    endloop\n"
                "  endfacet\n"
            ).encode("ascii")
        )
    lines.append(f"endsolid {name}\n".encode("ascii"))
    return b"".join(lines)


def scale_tris(tris: List[Tri], sx: float, sy: float, sz: float) -> List[Tri]:
    def sc(p: Vec3) -> Vec3:
        return (p[0]*sx, p[1]*sy, p[2]*sz)
    return [(sc(a), sc(b), sc(c)) for (a,b,c) in tris]


def generate_box_mesh(size_x: float, size_y: float, size_z: float) -> List[Tri]:
    # Axis-aligned box centered at origin
    hx, hy, hz = size_x/2.0, size_y/2.0, size_z/2.0
    v = [
        (-hx,-hy,-hz), (hx,-hy,-hz), (hx,hy,-hz), (-hx,hy,-hz),  # bottom z-
        (-hx,-hy, hz), (hx,-hy, hz), (hx,hy, hz), (-hx,hy, hz),  # top z+
    ]
    def quad(a,b,c,d):
        return [(v[a],v[b],v[c]), (v[a],v[c],v[d])]
    tris: List[Tri] = []
    tris += quad(0,1,2,3)  # bottom
    tris += quad(4,5,6,7)  # top
    tris += quad(0,4,5,1)  # -y side
    tris += quad(1,5,6,2)  # +x side
    tris += quad(2,6,7,3)  # +y side
    tris += quad(3,7,4,0)  # -x side
    return tris


def generate_cylinder_mesh(radius: float, height: float, segments: int = 24) -> List[Tri]:
    # Solid cylinder centered on origin, axis along Z, height positive z extent
    r = radius
    h2 = height/2.0
    tris: List[Tri] = []
    # Side
    for i in range(segments):
        a0 = 2*math.pi*i/segments
        a1 = 2*math.pi*(i+1)/segments
        x0,y0 = r*math.cos(a0), r*math.sin(a0)
        x1,y1 = r*math.cos(a1), r*math.sin(a1)
        p00 = (x0,y0,-h2); p01 = (x0,y0,h2); p10 = (x1,y1,-h2); p11=(x1,y1,h2)
        tris.append((p00,p10,p11))
        tris.append((p00,p11,p01))
    # Caps
    center_top = (0.0,0.0,h2)
    center_bot = (0.0,0.0,-h2)
    for i in range(segments):
        a0 = 2*math.pi*i/segments
        a1 = 2*math.pi*(i+1)/segments
        x0,y0 = r*math.cos(a0), r*math.sin(a0)
        x1,y1 = r*math.cos(a1), r*math.sin(a1)
        tris.append(((x0,y0,h2),(x1,y1,h2),center_top))
        tris.append((center_bot,(x1,y1,-h2),(x0,y0,-h2)))
    return tris


# ------------ External model import (STL) ------------

def mirror_tris(tris: List[Tri], axis: str = 'x') -> List[Tri]:
    ax = axis.lower()
    def mir(p: Vec3) -> Vec3:
        x,y,z = p
        if ax=='x':
            return (-x, y, z)
        if ax=='y':
            return (x, -y, z)
        return (x, y, -z)
    # Reverse winding to preserve outward normals after mirroring
    return [(mir(a), mir(c), mir(b)) for (a,b,c) in tris]


PART_FILE_MAP = {
    "palm": "palm.stl",
    "gauntlet": "gauntlet.stl",
    "pins": "pins.stl",
    "three_pin_tensioner": "three_pin_tensioner.stl",
    "proximal_finger": "proximal_finger.stl",
    "proximal_thumb": "proximal_thumb.stl",
    "finger_tip": "finger_tip.stl",
}


def load_external_part_mesh(part: str) -> Optional[List[Tri]]:
    filename = PART_FILE_MAP.get(part)
    if not filename:
        return None
    path = os.path.join(ASSETS_DIR, filename)
    if not os.path.exists(path):
        return None
    try:
        return load_stl_triangles(path)
    except Exception:
        return None


def load_stl_triangles(path: str) -> List[Tri]:
    # Supports binary and ASCII STL
    size = os.path.getsize(path)
    with open(path, 'rb') as f:
        head = f.read(84)
        if len(head) < 84:
            raise ValueError("Invalid STL file")
        tri_count = int.from_bytes(head[80:84], 'little', signed=False)
        expected = 84 + tri_count * 50
        if expected == size and not head[:5].lower().startswith(b'solid'):
            # Binary STL
            tris: List[Tri] = []
            for _ in range(tri_count):
                data = f.read(50)
                if len(data) < 50:
                    break
                # skip normal (12 bytes), read 9 floats for vertices
                import struct
                v = struct.unpack('<12x9fH', data)
                a = (v[0], v[1], v[2])
                b = (v[3], v[4], v[5])
                c = (v[6], v[7], v[8])
                tris.append((a,b,c))
            return tris
    # ASCII fallback
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
    tris: List[Tri] = []
    cur: List[Vec3] = []
    for line in lines:
        ls = line.strip()
        if ls.startswith('vertex'):
            parts = ls.split()
            if len(parts) >= 4:
                cur.append((float(parts[1]), float(parts[2]), float(parts[3])))
                if len(cur) == 3:
                    tris.append((cur[0], cur[1], cur[2]))
                    cur = []
    return tris


# ------------ Optional STEP export via pythonocc-core or OCP (CadQuery) ------------
_OCC_AVAILABLE = False
try:
    # Prefer OCP wheels (widely available)
    from OCP.gp import gp_Pnt
    from OCP.BRepBuilderAPI import (
        BRepBuilderAPI_MakePolygon,
        BRepBuilderAPI_MakeFace,
        BRepBuilderAPI_Sewing,
    )
    from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
    from OCP.IFSelect import IFSelect_RetDone
    _OCC_AVAILABLE = True
except Exception:
    try:
        # Fallback to pythonocc-core (may require conda/OS pkgs)
        from OCC.Core.gp import gp_Pnt
        from OCC.Core.BRepBuilderAPI import (
            BRepBuilderAPI_MakePolygon,
            BRepBuilderAPI_MakeFace,
            BRepBuilderAPI_Sewing,
        )
        from OCC.Core.STEPControl import STEPControl_Writer, STEPControl_AsIs
        from OCC.Core.IFSelect import IFSelect_RetDone
        _OCC_AVAILABLE = True
    except Exception:
        _OCC_AVAILABLE = False


def write_step_from_tris(tris: List[Tri], filepath: str) -> None:
    if not _OCC_AVAILABLE:
        raise RuntimeError("STEP export unavailable: install OCP (preferred) or pythonocc-core.")

    # Build a sewed shell from triangle faces
    sewing = BRepBuilderAPI_Sewing(1.0e-6)
    for a, b, c in tris:
        poly = BRepBuilderAPI_MakePolygon()
        poly.Add(gp_Pnt(a[0], a[1], a[2]))
        poly.Add(gp_Pnt(b[0], b[1], b[2]))
        poly.Add(gp_Pnt(c[0], c[1], c[2]))
        poly.Close()
        wire = poly.Wire()
        face = BRepBuilderAPI_MakeFace(wire, True).Face()
        sewing.Add(face)
    sewing.Perform()
    shell_shape = sewing.SewedShape()

    writer = STEPControl_Writer()
    writer.Transfer(shell_shape, STEPControl_AsIs)
    status = writer.Write(filepath)
    if status != IFSelect_RetDone:
        raise RuntimeError("Failed to write STEP file.")


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)
