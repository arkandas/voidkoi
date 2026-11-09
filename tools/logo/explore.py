"""Silhouette sweeps: the loop that chose the pose and anatomy. Edit VARIANTS, run, look.

    python3 tools/logo/explore.py        # -> tools/logo/_preview/explore.png

Each variant holds koi_geometry() overrides (turn, mu, sig, base, follow, rot, detach,
anatomy={...}) plus a label. The shipped design is POSE + ANATOMY in koi.py.
"""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from bezier import geom_to_d  # noqa: E402
from koi import ANATOMY, TANCHO_R, koi_geometry  # noqa: E402

VARIANTS = [
    dict(label="shipped"),
    dict(label="turn 140", turn=140),
    dict(label="turn 180", turn=180),
    dict(label="follow 0.3 (fins stiffer)", follow=0.3),
    dict(label="rot 20", rot=20),
    dict(label="fins swept +25 / +18", anatomy=dict(pec={**ANATOMY["pec"], "b": dict(rot=25), "a": dict(rot=18)})),
]
CELL, COLS = 380, 3


def cell(v, i):
    kw = {k: val for k, val in v.items() if k != "label"}
    m = koi_geometry(size=CELL * 0.8, **kw)
    cx, cy = (i % COLS) * CELL + CELL / 2, (i // COLS) * CELL + CELL / 2
    tx, ty = m["tancho"]
    return (f'<g transform="translate({cx} {cy})">'
            f'<path d="{geom_to_d(m["body"], err=0.3)}" fill="#F7F5FF"/>'
            f'<path d="{geom_to_d(m["barbels"], err=0.2)}" fill="#F7F5FF"/>'
            f'<circle cx="{tx:.1f}" cy="{ty:.1f}" r="{TANCHO_R * m["s"]:.1f}" fill="#FF4D2E"/></g>'
            f'<text x="{cx - CELL / 2 + 12}" y="{cy - CELL / 2 + 24}" font-family="Helvetica" font-size="15" '
            f'fill="#8A84A3">{v["label"]}</text>')


def main():
    rows = (len(VARIANTS) + COLS - 1) // COLS
    w, h = COLS * CELL, rows * CELL
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}">'
           f'<rect width="{w}" height="{h}" fill="#0E0A1F"/>' + "".join(cell(v, i) for i, v in enumerate(VARIANTS)) +
           "</svg>")
    out = HERE / "_preview"
    out.mkdir(exist_ok=True)
    (out / "explore.svg").write_text(svg)
    subprocess.run(["rsvg-convert", str(out / "explore.svg"), "-o", str(out / "explore.png")], check=True)
    print(out / "explore.png")


if __name__ == "__main__":
    main()
