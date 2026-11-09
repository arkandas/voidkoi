"""Procedural top-down koi for the voidkoi mark.

The fish is modelled straight first: snout at x=0, tail tip at x~1.06, y is the lateral
offset, and every unit is a fraction of body length. It is then bent along a spine whose
curvature is a bell curve, so the head and tail stay fairly straight and the bend happens
mid-body. The fins do not bend with the body. They are attached at their root and only
partly follow the curve (`follow`), otherwise the outer fin stretches into a wing.

Everything is shapely geometry. `bezier.py` turns the outlines into SVG cubic curves.

Coordinates are SVG space (y down). With positive curvature the fish curls toward +y, so
fin side "a" (+y) is the inside of the curve and side "b" (-y) the outside.
"""
import math

import numpy as np
import shapely
from shapely import affinity
from shapely.geometry import Point, Polygon
from shapely.ops import unary_union

_trapz = getattr(np, "trapezoid", None) or np.trapz   # numpy 2 renamed trapz

# ---------------------------------------------------------------- locked design
ANATOMY = dict(
    # half-width of the body, (x, h) from snout to peduncle
    body=[(0.000, 0.000), (0.004, 0.017), (0.013, 0.031), (0.027, 0.043),
          (0.047, 0.054), (0.072, 0.063), (0.105, 0.071), (0.150, 0.077),
          (0.205, 0.080), (0.260, 0.080), (0.320, 0.076), (0.385, 0.068),
          (0.450, 0.057), (0.515, 0.045), (0.575, 0.034), (0.630, 0.026),
          (0.680, 0.021), (0.720, 0.019), (0.760, 0.018)],
    wscale=1.0,
    # pectoral fins: broad fans drawn in body coords for the +y side, mirrored for -y.
    # abs[1] is the pivot for the per-side overrides; +rot sweeps a fin back toward the tail.
    pec=dict(abs=[(0.185, 0.045), (0.148, 0.074), (0.166, 0.104), (0.190, 0.137),
                  (0.220, 0.170), (0.252, 0.198), (0.285, 0.216), (0.315, 0.222),
                  (0.337, 0.211), (0.344, 0.190), (0.334, 0.162), (0.310, 0.132),
                  (0.276, 0.106), (0.240, 0.089), (0.208, 0.079)],
             b=dict(rot=15), a=dict(rot=10)),
    # pelvic fins: leaf in a local frame (u along the fin, v toward its leading edge)
    pel=dict(x=0.40, ang=28, L=0.085, W=1.0, sink=0.008,
             shape=[(-0.15, 0.00), (0.00, 0.10), (0.30, 0.22), (0.62, 0.26),
                    (0.90, 0.16), (1.02, 0.02), (0.92, -0.08), (0.62, -0.10),
                    (0.30, -0.06), (0.02, -0.08)]),
    # caudal fin: outer edge of the +y lobe (peduncle -> tip), then its trailing edge
    # into the notch. The -y lobe is the mirror image.
    tail_outer=[(0.690, 0.019), (0.730, 0.022), (0.775, 0.034), (0.825, 0.054), (0.880, 0.081),
                (0.935, 0.108), (0.985, 0.128), (1.025, 0.137), (1.052, 0.130), (1.062, 0.112)],
    tail_trail=[(1.062, 0.112), (1.052, 0.090), (1.025, 0.064), (0.985, 0.038),
                (0.945, 0.015), (0.925, 0.000)],
    tail_scale_b=1.0,
    barbels=True,
)

# 158 deg of total bend concentrated mid-body; fins follow the bend halfway; whole
# fish rotated 8 deg; fins separated from the body by a hairline gap.
POSE = dict(turn=158, mu=0.45, sig=0.4, base=0.35, follow=0.5, rot=8.0, detach=0.006)

TANCHO_X = 0.090   # red crown spot: position along the spine...
TANCHO_R = 0.023   # ...and radius, in body lengths


# ---------------------------------------------------------------- splines
def cr(pts, n=16, closed=False, alpha=0.5):
    """Centripetal Catmull-Rom through pts, returned as dense points."""
    P = np.asarray(pts, float)
    if closed:
        P = np.vstack([P[-1], P, P[0], P[1]])
    else:
        P = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        t0 = 0.0
        t1 = t0 + np.linalg.norm(p1 - p0) ** alpha + 1e-12
        t2 = t1 + np.linalg.norm(p2 - p1) ** alpha + 1e-12
        t3 = t2 + np.linalg.norm(p3 - p2) ** alpha + 1e-12
        for t in np.linspace(t1, t2, n, endpoint=False):
            a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
            a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
            a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
            b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
            b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
            out.append((t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2)
    if not closed:
        out.append(P[-2])
    return np.array(out)


# ---------------------------------------------------------------- straight parts
def _prof(p):
    s = p.get("wscale", 1.0)
    return [(x, h * s) for x, h in p["body"]]


def body_poly(p):
    prof = cr(_prof(p), n=24)
    return Polygon(np.vstack([prof, prof[::-1] * [1, -1]]))


_HW_CACHE = {}


def half_width(p, x):
    key = (tuple(p["body"]), p.get("wscale", 1.0))
    prof = _HW_CACHE.get(key)
    if prof is None:
        prof = _HW_CACHE[key] = cr(_prof(p), n=48)
    return float(np.interp(x, prof[:, 0], prof[:, 1]))


def fin_poly(p, spec, side):
    """One fin on side +1 ("a") or -1 ("b"); spec["a"] / spec["b"] override per side."""
    tag = "a" if side > 0 else "b"
    if spec.get(tag):
        spec = {**spec, **spec[tag]}
    if spec.get("abs"):
        pts = cr(spec["abs"], n=16, closed=True)
        piv = np.array(spec["abs"][1])
        pts = piv + (pts - piv) * spec.get("scale", 1.0)
        r = math.radians(spec.get("rot", 0.0))
        if r:
            c, sn = math.cos(r), math.sin(r)
            d = pts - piv
            pts = piv + np.column_stack([d[:, 0] * c + d[:, 1] * sn, -d[:, 0] * sn + d[:, 1] * c])
        return Polygon(pts * [1, side]).buffer(0)
    x0 = spec["x"]
    y0 = side * (half_width(p, x0) - spec.get("sink", 0.012))   # root sunk into the body
    a = math.radians(spec["ang"])
    eu = np.array([math.cos(a), side * math.sin(a)])        # tailward + outward
    ev = np.array([-math.sin(a), side * math.cos(a)])       # headward + outward
    pts = cr([(u, v) for u, v in spec["shape"]], n=16, closed=True)
    L, W = spec["L"], spec["L"] * spec.get("W", 1.0)
    return Polygon([np.array([x0, y0]) + u * L * eu + v * W * ev for u, v in pts]).buffer(0)


def tail_poly(p):
    outer = cr(p["tail_outer"], n=20)
    trail = cr(p["tail_trail"], n=20)
    lobe_a = np.vstack([outer, trail[1:]])
    lobe_b = lobe_a[::-1].copy()
    lobe_b[:, 1] *= -1
    s = p.get("tail_scale_b", 1.0)
    if s != 1.0:
        piv = np.array([0.78, 0.0])
        lobe_b = piv + (lobe_b - piv) * s
    return Polygon(np.vstack([lobe_a, lobe_b[1:]])).buffer(0)


def barbel_polys():
    """Two tapered whiskers: offset curves around a centreline, round tip, root sunk in the snout."""
    polys = []
    for side in (1, -1):
        c = cr([(0.016, side * 0.018), (0.010, side * 0.022), (0.000, side * 0.032),
                (-0.010, side * 0.044), (-0.016, side * 0.058)], n=14)
        t = np.linspace(0, 1, len(c))
        g = np.gradient(c, axis=0)
        g /= np.linalg.norm(g, axis=1)[:, None]
        nrm = np.column_stack([-g[:, 1], g[:, 0]])
        hw = 0.0050 * (1 - t) ** 0.85 + 0.0008
        left = c + nrm * hw[:, None]
        right = c - nrm * hw[:, None]
        a0 = math.atan2(nrm[-1, 1], nrm[-1, 0])
        cap = [c[-1] + hw[-1] * np.array([math.cos(a0 - k * math.pi / 6), math.sin(a0 - k * math.pi / 6)])
               for k in range(1, 6)]
        polys.append(Polygon(np.vstack([left, np.array(cap), right[::-1]])).buffer(0))
    return polys


def straight_parts(p):
    parts = {"body": body_poly(p), "tail": tail_poly(p)}
    for side, tag in ((1, "a"), (-1, "b")):
        parts[f"pec_{tag}"] = fin_poly(p, p["pec"], side)
        if p.get("pel"):
            parts[f"pel_{tag}"] = fin_poly(p, p["pel"], side)
    if p.get("barbels"):
        parts["barbels"] = unary_union(barbel_polys())
    return parts


# ---------------------------------------------------------------- bending
def bell(total, mu=0.42, sig=0.32, base=0.25):
    """Curvature k(x): a bump centred at mu over a constant floor; integrates to `total` radians."""
    xs = np.linspace(0, 1, 2001)
    norm = _trapz(base + np.exp(-0.5 * ((xs - mu) / sig) ** 2), xs)
    return lambda x: total * (base + math.exp(-0.5 * ((x - mu) / sig) ** 2)) / norm


class Spine:
    """Arc-length parametrised curve from a curvature function k(x), x in [0, 1]."""

    def __init__(self, kfun, phi0=0.0, n=4001):
        xs = np.linspace(-0.2, 1.2, n)
        dx = xs[1] - xs[0]
        k = np.array([kfun(min(max(x, 0.0), 1.0)) for x in xs])
        k[xs < 0] = 0.0
        k[xs > 1] = 0.0
        phi = np.cumsum(k) * dx
        phi -= np.interp(0.0, xs, phi)
        phi += phi0
        px = np.cumsum(np.cos(phi)) * dx
        py = np.cumsum(np.sin(phi)) * dx
        px -= np.interp(0.0, xs, px)
        py -= np.interp(0.0, xs, py)
        self.xs, self.px, self.py, self.phi = xs, px, py, phi

    def map(self, pts):
        """(x along the fish, y lateral) -> bent position."""
        pts = np.asarray(pts, float)
        x, y = pts[:, 0], pts[:, 1]
        sx = np.interp(x, self.xs, self.px)
        sy = np.interp(x, self.xs, self.py)
        ph = np.interp(x, self.xs, self.phi)
        return np.column_stack([sx - y * np.sin(ph), sy + y * np.cos(ph)])


def densify(geom, step=0.0025):
    return geom.segmentize(step)


def bend_geom(geom, spine):
    geom = densify(geom)
    if geom.geom_type == "Polygon":
        ext = spine.map(np.array(geom.exterior.coords))
        holes = [spine.map(np.array(h.coords)) for h in geom.interiors]
        return Polygon(ext, holes).buffer(0)
    if geom.geom_type == "MultiPolygon":
        return unary_union([bend_geom(g, spine) for g in geom.geoms])
    if geom.geom_type == "Point":
        return Point(spine.map(np.array([geom.coords[0]]))[0])
    raise ValueError(geom.geom_type)


def rigid_geom(geom, spine, xr):
    """Attach geom rigidly at spine position xr: rotate by the local tangent, no bending."""
    sx = float(np.interp(xr, spine.xs, spine.px))
    sy = float(np.interp(xr, spine.xs, spine.py))
    ph = float(np.interp(xr, spine.xs, spine.phi))
    g = affinity.translate(geom, -xr, 0.0)
    g = affinity.rotate(g, ph, origin=(0, 0), use_radians=True)
    return affinity.translate(g, sx, sy)


def follow_geom(geom, spine, xr, w):
    """Blend rigid attachment (w=0) and full bending (w=1), point by point."""
    geom = densify(geom, 0.002)
    ext = np.array(geom.exterior.coords)
    bent = spine.map(ext)
    sx = float(np.interp(xr, spine.xs, spine.px))
    sy = float(np.interp(xr, spine.xs, spine.py))
    ph = float(np.interp(xr, spine.xs, spine.phi))
    c, s = math.cos(ph), math.sin(ph)
    loc = ext - [xr, 0.0]
    rig = np.column_stack([sx + loc[:, 0] * c - loc[:, 1] * s, sy + loc[:, 0] * s + loc[:, 1] * c])
    return Polygon(w * bent + (1 - w) * rig).buffer(0)


def fin_root_x(spec):
    if spec.get("abs"):
        return float(spec["abs"][1][0] + spec["abs"][-1][0]) / 2
    return spec["x"]


def build_bent(p, spine, detach=0.0, follow=0.0, keep_barbels=True):
    """Bend every part. Body and tail bend; fins follow partially; whiskers ride the snout."""
    parts = straight_parts(p)
    if not keep_barbels:
        parts.pop("barbels", None)
    bent = {}
    for k, g in parts.items():
        if k.startswith("pec") or k.startswith("pel"):
            spec = p["pec"] if k.startswith("pec") else p["pel"]
            if follow:
                bent[k] = follow_geom(g, spine, fin_root_x(spec), follow)
            else:
                bent[k] = rigid_geom(g, spine, fin_root_x(spec))
        elif k == "barbels":
            bent[k] = rigid_geom(g, spine, 0.0)
        else:
            bent[k] = bend_geom(g, spine)
    if detach:   # hairline gap between each fin and the body
        body = bent["body"]
        for k in list(bent):
            if k.startswith("pec") or k.startswith("pel"):
                bent[k] = bent[k].difference(body.buffer(detach))
    return bent


# ---------------------------------------------------------------- posed koi
def koi_geometry(size=1000.0, anatomy=None, turn=POSE["turn"], mu=POSE["mu"], sig=POSE["sig"],
                 base=POSE["base"], follow=POSE["follow"], rot=POSE["rot"], detach=POSE["detach"]):
    """Posed koi centred on (0, 0). Its minimum bounding circle (whiskers included) has
    diameter `size`. Returns shapely body (fins + tail included), barbels, and landmarks."""
    p = dict(ANATOMY)
    if anatomy:
        p.update(anatomy)
    sp = Spine(bell(math.radians(turn), mu=mu, sig=sig, base=base))
    bent = build_bent(p, sp, detach=detach, follow=follow, keep_barbels=True)
    barbels = bent.pop("barbels")
    body = unary_union(list(bent.values()))
    tancho = sp.map(np.array([[TANCHO_X, 0.0]]))[0]
    head = sp.map(np.array([[0.0, 0.0], [0.06, 0.0]]))

    mbc = shapely.minimum_bounding_circle(unary_union([body, barbels]))
    c = np.array(mbc.centroid.coords[0])
    s = (size / 2) / math.sqrt(mbc.area / math.pi)

    def T(g):
        g = affinity.translate(g, -c[0], -c[1])
        g = affinity.rotate(g, rot, origin=(0, 0))
        return affinity.scale(g, s, s, origin=(0, 0))

    def Tp(q):
        return np.array(T(Point(q)).coords[0])

    return dict(body=T(body), barbels=T(barbels), parts={k: T(v) for k, v in bent.items()},
                tancho=Tp(tancho), head=[Tp(q) for q in head], s=s, spine=sp, p=p)


def koi_at(cx, cy, radius, detach=POSE["detach"], barbels=True, **pose):
    """Koi whose bounding circle has `radius`, centred at (cx, cy). barbels=False drops the
    whiskers from the output but still sizes the fish as if they were there."""
    m = koi_geometry(size=2 * radius, detach=detach, **pose)
    mv = lambda g: affinity.translate(g, cx, cy)
    return dict(body=mv(m["body"]), barbels=mv(m["barbels"]) if barbels else None,
                tancho=(m["tancho"][0] + cx, m["tancho"][1] + cy), tancho_r=TANCHO_R * m["s"],
                head=(m["head"][0][0] + cx, m["head"][0][1] + cy), s=m["s"])
