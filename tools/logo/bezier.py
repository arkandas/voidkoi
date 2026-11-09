"""Cubic Bezier fitting of dense polygon outlines (Schneider, Graphics Gems 1990),
with corner detection so fin junctions and the tail notch stay crisp."""
import math
import numpy as np


def _norm(v):
    n = np.linalg.norm(v)
    return v / n if n > 1e-12 else v


def _bez(ctrl, t):
    t = np.asarray(t)[:, None]
    mt = 1 - t
    return (mt ** 3) * ctrl[0] + 3 * (mt ** 2) * t * ctrl[1] + 3 * mt * (t ** 2) * ctrl[2] + (t ** 3) * ctrl[3]


def _bez1(ctrl, t):
    t = np.asarray(t)[:, None]
    mt = 1 - t
    return 3 * (mt ** 2) * (ctrl[1] - ctrl[0]) + 6 * mt * t * (ctrl[2] - ctrl[1]) + 3 * (t ** 2) * (ctrl[3] - ctrl[2])


def _bez2(ctrl, t):
    t = np.asarray(t)[:, None]
    return 6 * (1 - t) * (ctrl[2] - 2 * ctrl[1] + ctrl[0]) + 6 * t * (ctrl[3] - 2 * ctrl[2] + ctrl[1])


def _chord_u(pts):
    d = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
    return d / d[-1] if d[-1] > 0 else d


def _generate(pts, u, lt, rt):
    p0, p3 = pts[0], pts[-1]
    b1 = 3 * u * (1 - u) ** 2
    b2 = 3 * u ** 2 * (1 - u)
    A0 = lt[None, :] * b1[:, None]
    A1 = rt[None, :] * b2[:, None]
    C = np.array([[np.sum(A0 * A0), np.sum(A0 * A1)], [np.sum(A0 * A1), np.sum(A1 * A1)]])
    base = _bez(np.array([p0, p0, p3, p3]), u)
    tmp = pts - base
    X = np.array([np.sum(A0 * tmp), np.sum(A1 * tmp)])
    det = C[0, 0] * C[1, 1] - C[1, 0] * C[0, 1]
    seg = np.linalg.norm(p3 - p0)
    if abs(det) > 1e-12:
        al = (X[0] * C[1, 1] - X[1] * C[0, 1]) / det
        ar = (C[0, 0] * X[1] - C[1, 0] * X[0]) / det
    else:
        al = ar = seg / 3
    eps = 1e-6 * seg
    if al < eps or ar < eps or al > 2 * seg or ar > 2 * seg:
        al = ar = seg / 3
    return np.array([p0, p0 + lt * al, p3 + rt * ar, p3])


def _reparam(ctrl, pts, u):
    d = _bez(ctrl, u) - pts
    d1 = _bez1(ctrl, u)
    d2 = _bez2(ctrl, u)
    num = np.sum(d * d1, axis=1)
    den = np.sum(d1 * d1, axis=1) + np.sum(d * d2, axis=1)
    with np.errstate(divide="ignore", invalid="ignore"):
        nu = np.where(np.abs(den) > 1e-12, u - num / den, u)
    return np.clip(nu, 0, 1)


def _max_err(ctrl, pts, u):
    d = np.linalg.norm(_bez(ctrl, u) - pts, axis=1)
    i = int(np.argmax(d))
    i = min(max(i, 1), len(pts) - 2)
    return d.max(), i


def fit_cubic(pts, lt, rt, err, depth=0):
    if len(pts) == 2:
        dist = np.linalg.norm(pts[1] - pts[0]) / 3
        return [np.array([pts[0], pts[0] + lt * dist, pts[1] + rt * dist, pts[1]])]
    u = _chord_u(pts)
    ctrl = _generate(pts, u, lt, rt)
    e, split = _max_err(ctrl, pts, u)
    if e < err:
        return [ctrl]
    if e < err * 4:
        for _ in range(20):
            u2 = _reparam(ctrl, pts, u)
            ctrl = _generate(pts, u2, lt, rt)
            e, split = _max_err(ctrl, pts, u2)
            if e < err:
                return [ctrl]
            u = u2
    if depth > 40 or len(pts) < 4:
        return [ctrl]
    ct = _norm(pts[split - 1] - pts[split + 1])
    return (fit_cubic(pts[:split + 1], lt, ct, err, depth + 1) +
            fit_cubic(pts[split:], -ct, rt, err, depth + 1))


def _dedupe(pts, tol=1e-6):
    out = [pts[0]]
    for p in pts[1:]:
        if np.linalg.norm(p - out[-1]) > tol:
            out.append(p)
    return np.array(out)


def find_corners(ring, k=3, thresh_deg=32):
    """Indices of corners on a closed ring (no repeated last point)."""
    n = len(ring)
    idx = []
    for i in range(n):
        a = ring[(i - k) % n]
        b = ring[i]
        c = ring[(i + k) % n]
        v1, v2 = _norm(b - a), _norm(c - b)
        ang = math.degrees(math.acos(max(-1, min(1, float(np.dot(v1, v2))))))
        if ang > thresh_deg:
            idx.append((ang, i))
    # non-maximum suppression within a window
    idx.sort(reverse=True)
    chosen = []
    for ang, i in idx:
        if all(min(abs(i - j), n - abs(i - j)) > k * 2 for j in chosen):
            chosen.append(i)
    return sorted(chosen)


def fit_ring(ring, err=0.25, corner_deg=32):
    """ring: (n,2) closed polyline (first != last). Returns list of cubic segments."""
    ring = _dedupe(np.asarray(ring, float))
    if np.linalg.norm(ring[0] - ring[-1]) < 1e-9:
        ring = ring[:-1]
    n = len(ring)
    corners = find_corners(ring, k=3, thresh_deg=corner_deg)
    segs = []
    if not corners:
        # smooth loop: start anywhere, matching tangents
        pts = np.vstack([ring, ring[:1]])
        t = _norm(ring[1] - ring[-1])
        return fit_cubic(pts, t, -t, err)
    for ci, c in enumerate(corners):
        nxt = corners[(ci + 1) % len(corners)]
        if nxt > c:
            piece = ring[c:nxt + 1]
        else:
            piece = np.vstack([ring[c:], ring[:nxt + 1]])
        if len(piece) < 2:
            continue
        lt = _norm(piece[min(2, len(piece) - 1)] - piece[0]) if len(piece) > 2 else _norm(piece[1] - piece[0])
        rt = _norm(piece[max(-3, -len(piece))] - piece[-1]) if len(piece) > 2 else _norm(piece[-2] - piece[-1])
        segs += fit_cubic(piece, lt, rt, err)
    return segs


def segs_to_d(segs, prec=2):
    f = lambda v: f"{v:.{prec}f}".rstrip("0").rstrip(".") if prec else f"{v:.0f}"
    s = segs[0]
    d = [f"M{f(s[0][0])} {f(s[0][1])}"]
    for s in segs:
        d.append(f"C{f(s[1][0])} {f(s[1][1])} {f(s[2][0])} {f(s[2][1])} {f(s[3][0])} {f(s[3][1])}")
    d.append("Z")
    return "".join(d)


def geom_to_d(geom, err=0.25, prec=2, corner_deg=32):
    polys = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
    out = []
    for pg in polys:
        out.append(segs_to_d(fit_ring(np.asarray(pg.exterior.coords)[:-1], err, corner_deg), prec))
        for h in pg.interiors:
            out.append(segs_to_d(fit_ring(np.asarray(h.coords)[:-1], err, corner_deg), prec))
    return "".join(out)
