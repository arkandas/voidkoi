"""Custom geometric wordmark: VOIDKOI, one word.

Not a font. Every letter is exact geometry (straight edges and circular arcs) at cap height
H with stroke w: circular O's with a slight overshoot, a pointed V dipping below the
baseline, a D built as a stem plus a semicircle, and a K whose leg springs from its arm.
The O of VOID is the emblem's lensed crescent (thick lower-left, hairline upper-right).
Spacing is tracked wide, then optically kerned.
"""
import math

from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union


def f(v, p=2):
    return f"{v:.{p}f}".rstrip("0").rstrip(".")


def poly_d(g, dx=0.0, dy=0.0):
    polys = [g] if g.geom_type == "Polygon" else list(g.geoms)
    out = []
    for pg in polys:
        for ring in [pg.exterior] + list(pg.interiors):
            c = list(ring.coords)[:-1]
            out.append("M" + "L".join(f"{f(x + dx)} {f(y + dy)}" for x, y in c) + "Z")
    return "".join(out)


class Letters:
    """Each glyph method returns (fn(dx) -> path data placed at x=dx, advance width)."""

    def __init__(self, H=100.0, w=11.0, os=1.4):
        self.H, self.w, self.os = H, w, os    # cap height, stroke, round overshoot

    def I(self):
        H, w = self.H, self.w
        return (lambda dx: f"M{f(dx)} 0H{f(dx + w)}V{f(H)}H{f(dx)}Z"), w

    def O(self):
        H, w, os = self.H, self.w, self.os
        R = H / 2 + os
        r = R - w

        def d(dx):
            cx, cy = dx + R, H / 2
            return (f"M{f(cx - R)} {f(cy)}A{f(R)} {f(R)} 0 1 1 {f(cx + R)} {f(cy)}A{f(R)} {f(R)} 0 1 1 {f(cx - R)} {f(cy)}Z"
                    f"M{f(cx - r)} {f(cy)}A{f(r)} {f(r)} 0 1 0 {f(cx + r)} {f(cy)}A{f(r)} {f(r)} 0 1 0 {f(cx - r)} {f(cy)}Z")
        return d, 2 * R

    def V(self, W=96.0):
        H, w, os = self.H, self.w, self.os
        apex = (W / 2, H + os * 1.6)

        def offset_line(p, q, dist):
            dx, dy = q[0] - p[0], q[1] - p[1]
            L = math.hypot(dx, dy)
            nx, ny = dy / L, -dx / L
            return (p[0] + nx * dist, p[1] + ny * dist), (q[0] + nx * dist, q[1] + ny * dist)

        def inter(a1, a2, b1, b2):
            x1, y1 = a1; x2, y2 = a2; x3, y3 = b1; x4, y4 = b2
            den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
            px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / den
            py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den
            return px, py
        l1, l2 = offset_line((0, 0), apex, w)        # inner edge of the left stroke
        r1, r2 = offset_line((W, 0), apex, -w)       # inner edge of the right stroke
        top_l = inter(l1, l2, (0, 0), (1, 0))
        top_r = inter(r1, r2, (0, 0), (1, 0))
        inner_apex = inter(l1, l2, r1, r2)
        g = Polygon([(0, 0), top_l, inner_apex, top_r, (W, 0), apex]).buffer(0)
        return (lambda dx: poly_d(g, dx)), W

    def D(self, cx=38.0):
        H, w = self.H, self.w
        R = H / 2
        r = R - w

        def d(dx):
            x0, xc = dx, dx + cx
            return (f"M{f(x0)} 0H{f(xc)}A{f(R)} {f(R)} 0 0 1 {f(xc)} {f(H)}H{f(x0)}Z"
                    f"M{f(x0 + w)} {f(w)}V{f(H - w)}H{f(xc)}A{f(r)} {f(r)} 0 0 0 {f(xc)} {f(w)}Z")
        return d, cx + R

    def K(self, W=80.0, join=0.52):
        H, w = self.H, self.w
        stem = box(0, 0, w, H)
        jy = H * join
        ext = 40

        def stroke(p, q):
            # flat-capped thick line, run past q so the band clip cuts it horizontally
            dx, dy = q[0] - p[0], q[1] - p[1]
            L = math.hypot(dx, dy)
            q2 = (q[0] + dx / L * ext, q[1] + dy / L * ext)
            return LineString([p, q2]).buffer(w / 2, cap_style=2)
        arm = stroke((w * 0.9, jy + w * 0.35), (W - w * 0.62, 0))
        leg = stroke((w + (W - w) * 0.28, jy - (H - jy) * 0.12), (W - w * 0.55, H))
        g = unary_union([stem, arm, leg]).intersection(box(0, 0, W + 50, H))
        g = g.intersection(box(0, 0, W, H))    # arm and leg end flush at W
        return (lambda dx: poly_d(g, dx)), W


KERN = {("V", "O"): -13, ("O", "I"): 0, ("I", "D"): 5, ("K", "O"): -9, ("D", "K"): 0}


def crescent_O(Lt, t_max=None, t_min=None, thick_deg=135):
    """O drawn as the emblem's lensed ring: thick lower-left, hairline upper-right."""
    H, w, os = Lt.H, Lt.w, Lt.os
    R = H / 2 + os
    t_max = t_max or w * 1.45
    t_min = t_min or w * 0.42
    r = R - (t_max + t_min) / 2
    d_off = (t_max - t_min) / 2
    a = math.radians(thick_deg)

    def d(dx):
        cx, cy = dx + R, H / 2
        ix, iy = cx - d_off * math.cos(a), cy - d_off * math.sin(a)
        return (f"M{f(cx - R)} {f(cy)}A{f(R)} {f(R)} 0 1 1 {f(cx + R)} {f(cy)}A{f(R)} {f(R)} 0 1 1 {f(cx - R)} {f(cy)}Z"
                f"M{f(ix - r)} {f(iy)}A{f(r)} {f(r)} 0 1 0 {f(ix + r)} {f(iy)}A{f(r)} {f(r)} 0 1 0 {f(ix - r)} {f(iy)}Z")
    return d, 2 * R


def wordmark(H=100.0, w=12.0, track=34.0, void_o="crescent"):
    """Returns (path data with the top-left of V at 0,0, advance width, info).
    void_o: 'crescent' (the shipped design) or 'plain'."""
    Lt = Letters(H, w)
    glyphs = [("V", Lt.V()), ("O", crescent_O(Lt) if void_o == "crescent" else Lt.O()), ("I", Lt.I()),
              ("D", Lt.D()), ("K", Lt.K()), ("O", Lt.O()), ("I", Lt.I())]
    x = 0.0
    parts = []
    info = dict(o_centers=[], H=H, w=w)
    prev = None
    for ch, item in glyphs:
        if prev is not None:
            x += track + KERN.get((prev, ch), 0)
        dfn, adv = item
        parts.append(dfn(x))
        if ch == "O":
            info["o_centers"].append((x + adv / 2, H / 2, adv / 2 - w))
        x += adv
        prev = ch
    return "".join(parts), x, info
