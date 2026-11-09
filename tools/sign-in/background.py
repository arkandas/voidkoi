"""voidkoi branding for an identity provider's sign-in pages: the login background, and
the logo and favicon files named the way its brand settings want them.

The mark's lensed crescent at page scale, as a horizon: the top of a very large disk
crossing the page low down, thick and bright at the left, thinning to a cyan hairline
at the right, under a sky of stars. The provider draws its login card near the top and
its footer at the bottom, so the horizon runs between them. No koi: the logo is on the
card, and the background only echoes it.

    python3 tools/sign-in/background.py   # writes brand/sign-in/

The logo and favicon are copies of brand/logo/, renamed: `voidkoi-logo-light.svg` and
`voidkoi-logo-dark.svg` so the brand's Logo can be `…-%(theme)s.svg`.
"""
import math
import pathlib
import shutil
import subprocess
import sys

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "logo"))
from emblem import PAL, circle_d, crescent_circles, f  # noqa: E402

W, H = 2560, 1440
OUT = HERE.parents[1] / "brand" / "sign-in"


def stars(n, seed, below):
    """Seeded stars over the sky; few below the horizon, where the disk is."""
    rng = np.random.default_rng(seed)
    out = []
    while len(out) < n:
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        inside = below(x, y)
        if inside and rng.uniform() < 0.85:
            continue
        r = float(rng.choice([0.8, 1.1, 1.5, 2.1, 2.8], p=[0.38, 0.3, 0.18, 0.1, 0.04]))
        o = float(rng.uniform(0.25, 0.9)) * (0.4 if inside else 1)
        out.append((x, y, r, o))
    return out


def background_svg():
    # A very large disk whose top edge crosses the page low down, like a planet's
    # horizon: clear of the login card above it, under the footer. Thick and
    # bright at the left, a cyan hairline at the right, as the mark's ring is.
    radius = 1.6 * W
    apex = 0.82 * H
    (ox, oy, ro), (ix, iy, ri) = crescent_circles(W / 2, apex + radius, radius, 44, 3, thick_deg=180)
    g1 = (0.0, apex)
    g2 = (float(W), apex)
    ring = circle_d(ox, oy, ro) + circle_d(ix, iy, ri, ccw=True)
    st = "".join(
        f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="#FFFFFF" opacity="{f(o)}"/>'
        for x, y, r, o in stars(460, 7, lambda x, y: math.hypot(x - ix, y - iy) < ri)
    )
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
<title>voidkoi</title>
<defs>
<radialGradient id="glow" cx="{f(W * 0.22)}" cy="{f(apex)}" r="{f(W * 0.75)}" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#6C4FE8" stop-opacity=".34"/><stop offset=".5" stop-color="#28195A" stop-opacity=".16"/><stop offset="1" stop-color="{PAL["void"]}" stop-opacity="0"/>
</radialGradient>
<linearGradient id="disk" x1="0" y1="{f(apex)}" x2="0" y2="{f(H)}" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#22164D"/><stop offset=".35" stop-color="#0E0A1F"/><stop offset="1" stop-color="#0A0714"/>
</linearGradient>
<linearGradient id="ring" x1="{f(g1[0])}" y1="{f(g1[1])}" x2="{f(g2[0])}" y2="{f(g2[1])}" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#F5F1FF"/><stop offset=".32" stop-color="#AC98FF"/><stop offset=".72" stop-color="#6C4FE8"/><stop offset="1" stop-color="#63E6F7"/>
</linearGradient>
<filter id="blur-wide" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="46"/></filter>
<filter id="blur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="12"/></filter>
</defs>
<rect width="{W}" height="{H}" fill="{PAL["void"]}"/>
<rect width="{W}" height="{H}" fill="url(#glow)"/>
<g>{st}</g>
<path d="{ring}" fill="url(#ring)" fill-rule="evenodd" filter="url(#blur-wide)" opacity=".6"/>
<path d="{circle_d(ix, iy, ri)}" fill="url(#disk)"/>
<path d="{ring}" fill="url(#ring)" fill-rule="evenodd" filter="url(#blur)" opacity=".7"/>
<path d="{ring}" fill="url(#ring)" fill-rule="evenodd"/>
</svg>'''


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    svg = OUT / "background.svg"
    svg.write_text(background_svg())
    png = OUT / "_background.png"
    subprocess.run(["rsvg-convert", "-w", str(W), "-h", str(H), "-o", str(png), str(svg)], check=True)
    subprocess.run(["magick", str(png), "-strip", "-quality", "86", "-sampling-factor", "4:2:0",
                    str(OUT / "background.jpg")], check=True)
    png.unlink()
    logo = HERE.parents[1] / "brand" / "logo"
    shutil.copyfile(logo / "void-koi-lockup-light.svg", OUT / "voidkoi-logo-light.svg")
    shutil.copyfile(logo / "void-koi-lockup-dark.svg", OUT / "voidkoi-logo-dark.svg")
    shutil.copyfile(logo / "favicon.svg", OUT / "voidkoi-favicon.svg")
    print("wrote", ", ".join(sorted(p.name for p in OUT.iterdir())))


if __name__ == "__main__":
    main()
