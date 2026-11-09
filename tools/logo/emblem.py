"""voidkoi mark variants on a 512 grid: hero (full colour), flat, mono, favicon build.

Layout: a disk (the void) whose rim is a lensed crescent, thick and bright toward
`thick_deg` (135 = lower-left in SVG's y-down space) and a hairline on the opposite side.
The crescent is the ring between an outer circle and an inner circle offset away from the
thick side; the inner circle is also the disk. The koi sits inside the disk.
"""
import math

import numpy as np
from shapely.geometry import Point
from shapely.ops import unary_union

from bezier import geom_to_d
from koi import koi_at

PAL = dict(
    void="#08070D",      # page black
    abyss="#0E0A1F",     # disk
    horizon="#9D86FF",   # violet ring (flat builds)
    lens="#63E6F7",      # cyan end of the lensed ring
    pearl="#F7F5FF",     # koi (flat builds)
    tancho="#FF4D2E",    # vermilion crown spot, the only warm colour
)


def f(v, p=2):
    return f"{v:.{p}f}".rstrip("0").rstrip(".")


def crescent_circles(cx, cy, r_out, t_max, t_min, thick_deg=135):
    """Outer circle and the inner (disk) circle offset away from the thick side."""
    r_in = r_out - (t_max + t_min) / 2
    d = (t_max - t_min) / 2
    a = math.radians(thick_deg)
    return (cx, cy, r_out), (cx - d * math.cos(a), cy - d * math.sin(a), r_in)


def circle_d(cx, cy, r, prec=2, ccw=False):
    fm = lambda v: f"{v:.{prec}f}".rstrip("0").rstrip(".")
    sweep = 0 if ccw else 1
    return (f"M{fm(cx - r)} {fm(cy)}A{fm(r)} {fm(r)} 0 1 {sweep} {fm(cx + r)} {fm(cy)}"
            f"A{fm(r)} {fm(r)} 0 1 {sweep} {fm(cx - r)} {fm(cy)}Z")


def layout(size=512, r_out=230, t_max=17, t_min=1.6, koi_ratio=0.80, koi_dx=-20, koi_dy=2,
           thick_deg=135, detach=0.006, barbels=True):
    """koi_ratio: koi bounding circle / disk radius. koi_dx shifts the fish left so its
    mass (the curve bulges right) sits centred in the disk."""
    c = size / 2
    (ox, oy, ro), (ix, iy, ri) = crescent_circles(c, c, r_out, t_max, t_min, thick_deg)
    k = koi_at(ix + koi_dx, iy + koi_dy, ri * koi_ratio, detach=detach, barbels=barbels)
    return dict(size=size, outer=(ox, oy, ro), inner=(ix, iy, ri), koi=k, thick_deg=thick_deg)


def favicon_layout():
    """Small-size build: full-bleed disk, heavy crescent, bigger koi, fins merged, no whiskers."""
    return layout(r_out=256, t_max=44, t_min=12, koi_ratio=0.86, koi_dx=-18, koi_dy=4,
                  detach=0.0, barbels=False)


def stars(L, n=14, seed=11, margin=0.9, avoid=14, min_gap=46, sizes=(0.9, 1.25, 1.7, 2.3)):
    """Seeded random star dots inside the disk, kept clear of the koi."""
    ix, iy, ri = L["inner"]
    rng = np.random.default_rng(seed)
    body = L["koi"]["body"].buffer(avoid)
    out = []
    tries = 0
    while len(out) < n and tries < 20000:
        tries += 1
        a = rng.uniform(0, 2 * math.pi)
        rr = ri * margin * math.sqrt(rng.uniform(0.0, 1.0))
        x, y = ix + rr * math.cos(a), iy + rr * math.sin(a)
        if body.contains(Point(x, y)) or any(math.hypot(x - q[0], y - q[1]) < min_gap for q in out):
            continue
        out.append((x, y, float(rng.choice(sizes, p=[0.4, 0.3, 0.2, 0.1])), float(rng.uniform(0.35, 0.95))))
    return out


def paths(L, err=0.2):
    """SVG path data for every shape (err = max Bezier fitting error in grid units)."""
    k = L["koi"]
    ox, oy, ro = L["outer"]
    ix, iy, ri = L["inner"]
    allk = unary_union([k["body"], k["barbels"]]) if k["barbels"] is not None else k["body"]
    return dict(
        koi_all=geom_to_d(allk, err=err * 0.6),
        koi=geom_to_d(k["body"], err=err),
        barbels=geom_to_d(k["barbels"], err=err * 0.6) if k["barbels"] is not None else "",
        outer=circle_d(ox, oy, ro),
        inner=circle_d(ix, iy, ri),
        ring=circle_d(ox, oy, ro) + circle_d(ix, iy, ri, ccw=True),   # evenodd crescent
    )


def svg_open(size, title, extra=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}"{extra}>'
            f'<title>{title}</title>')


def hero_svg(L, bg=None):
    """Full colour: gradients, soft glows, stars. Transparent outside the disk unless bg."""
    P = paths(L)
    k = L["koi"]
    ox, oy, ro = L["outer"]
    ix, iy, ri = L["inner"]
    tx, ty = k["tancho"]
    tr = k["tancho_r"]
    hx, hy = k["head"]
    a = math.radians(L["thick_deg"])
    g1 = (ox + ro * math.cos(a), oy + ro * math.sin(a))
    g2 = (ox - ro * math.cos(a), oy - ro * math.sin(a))
    st = "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="#FFFFFF" opacity="{f(o)}"/>' for x, y, r, o in stars(L))
    s = L["size"]
    return (svg_open(s, "voidkoi") +
            f'''<defs>
<radialGradient id="vk-disk" cx="{f(ix)}" cy="{f(iy)}" r="{f(ri)}" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#0A0714"/><stop offset=".74" stop-color="#0E0A1F"/><stop offset="1" stop-color="#28195A"/>
</radialGradient>
<linearGradient id="vk-ring" x1="{f(g1[0])}" y1="{f(g1[1])}" x2="{f(g2[0])}" y2="{f(g2[1])}" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#F5F1FF"/><stop offset=".32" stop-color="#AC98FF"/><stop offset=".72" stop-color="#6C4FE8"/><stop offset="1" stop-color="#63E6F7"/>
</linearGradient>
<radialGradient id="vk-koi" cx="{f(hx)}" cy="{f(hy)}" r="{f(s * 0.9)}" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#FFFFFF"/><stop offset=".5" stop-color="#EFEBFF"/><stop offset="1" stop-color="#C2B4FF"/>
</radialGradient>
<filter id="vk-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="{f(s * 0.019)}"/></filter>
<filter id="vk-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="{f(s * 0.009)}"/></filter>
</defs>''' +
            (f'<rect width="{s}" height="{s}" fill="{bg}"/>' if bg else "") +
            f'<path d="{P["ring"]}" fill="url(#vk-ring)" fill-rule="evenodd" filter="url(#vk-glow)" opacity=".85"/>'
            f'<path d="{P["inner"]}" fill="url(#vk-disk)"/>'
            f'<g>{st}</g>'
            f'<path d="{P["ring"]}" fill="url(#vk-ring)" fill-rule="evenodd"/>'
            f'<path d="{P["koi"]}" fill="#8E72FF" opacity=".5" filter="url(#vk-glow)"/>'
            f'<path d="{P["koi"]}" fill="url(#vk-koi)"/>'
            f'<path d="{P["barbels"]}" fill="url(#vk-koi)"/>'
            f'<circle cx="{f(tx)}" cy="{f(ty)}" r="{f(tr * 1.9)}" fill="{PAL["tancho"]}" opacity=".4" filter="url(#vk-soft)"/>'
            f'<circle cx="{f(tx)}" cy="{f(ty)}" r="{f(tr)}" fill="{PAL["tancho"]}"/>'
            '</svg>')


def flat_svg(L, star_n=9, bg=None, ring=None, disk=None, koi=None):
    """Flat colours, no filters: light backgrounds, UI, small sizes."""
    P = paths(L)
    k = L["koi"]
    tx, ty = k["tancho"]
    s = L["size"]
    st = "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="#FFFFFF" opacity="{f(o)}"/>'
                 for x, y, r, o in stars(L, n=star_n)) if star_n else ""
    return (svg_open(s, "voidkoi") +
            (f'<rect width="{s}" height="{s}" fill="{bg}"/>' if bg else "") +
            f'<path d="{P["outer"]}" fill="{disk or PAL["abyss"]}"/>'
            f'<path d="{P["ring"]}" fill="{ring or PAL["horizon"]}" fill-rule="evenodd"/>'
            + st +
            f'<path d="{P["koi"]}" fill="{koi or PAL["pearl"]}"/>'
            + (f'<path d="{P["barbels"]}" fill="{koi or PAL["pearl"]}"/>' if P["barbels"] else "") +
            f'<circle cx="{f(tx)}" cy="{f(ty)}" r="{f(k["tancho_r"])}" fill="{PAL["tancho"]}"/>'
            '</svg>')


def mono_svg(L, gap=5.0):
    """One colour (currentColor): koi knocked out of the disk, ring split off by a hairline."""
    P = paths(L)
    k = L["koi"]
    ix, iy, ri = L["inner"]
    tx, ty = k["tancho"]
    s = L["size"]
    disk = circle_d(ix, iy, ri - gap)
    return (svg_open(s, "voidkoi", ' fill="currentColor"') +
            f'<path d="{P["ring"]}" fill-rule="evenodd"/>'
            f'<path d="{disk}{P["koi_all"]}" fill-rule="evenodd"/>'
            f'<circle cx="{f(tx)}" cy="{f(ty)}" r="{f(k["tancho_r"])}"/>'
            '</svg>')


def favicon_svg(L, tancho_scale=1.55):
    """Flat small-size build (use with favicon_layout)."""
    P = paths(L, err=0.35)
    k = L["koi"]
    tx, ty = k["tancho"]
    s = L["size"]
    return (svg_open(s, "voidkoi") +
            f'<path d="{P["outer"]}" fill="{PAL["abyss"]}"/>'
            f'<path d="{P["ring"]}" fill="{PAL["horizon"]}" fill-rule="evenodd"/>'
            f'<path d="{P["koi"]}" fill="{PAL["pearl"]}"/>'
            f'<circle cx="{f(tx)}" cy="{f(ty)}" r="{f(k["tancho_r"] * tancho_scale)}" fill="{PAL["tancho"]}"/>'
            '</svg>')
