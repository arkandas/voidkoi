# Logo generator

Python that draws the voidkoi logo from scratch and writes `brand/logo/`.

```sh
python3 tools/logo/export.py [out_dir]   # default: brand/logo
python3 tools/logo/preview.py            # -> tools/logo/_preview/review.png (look at it)
python3 tools/logo/explore.py            # -> tools/logo/_preview/explore.png (edit VARIANTS first)
```

Requires numpy and shapely (`requirements.txt`), plus `rsvg-convert` and `magick`
(`brew install librsvg imagemagick`).

The output is deterministic: the unchanged generator reproduces `brand/logo/` byte for byte
(checked on 2026-09-26). Export to a temp dir and compare checksums to see exactly which
files a change touched.

## Pipeline

1. **`koi.py`** builds the koi as shapely polygons.
   - Straight parts, in body-length units with the snout at x=0: the body's half-width
     profile, fan-shaped pectoral fins, leaf-shaped pelvic fins, a forked tail, and tapered
     whiskers.
   - `Spine` turns a curvature function (`bell`: a bump mid-body over a constant floor)
     into a bent centreline. The body and tail are bent point by point. Each fin is
     attached at its root and blended between rigid and fully bent (`follow`). The
     whiskers ride the snout rigidly.
   - Fins are cut back from the body by `detach` (hairline gaps), then everything is unioned.
   - `koi_geometry()` scales by the minimum bounding circle (whiskers included), centres
     the koi and rotates it by `rot`. `koi_at()` places it on the 512 grid.
2. **`bezier.py`** fits cubic Béziers (Schneider's algorithm, with corners detected at 32°)
   and returns compact `C` path data. `err` is the maximum deviation in grid units.
3. **`emblem.py`** lays out the 512 grid: the crescent ring (outer circle minus an offset
   inner circle, which is also the disk), the koi's placement, and seeded stars. It
   builds the hero, flat, mono and favicon SVGs.
4. **`wordmark.py`** draws the letters as exact geometry, with tracking, kerning and the
   crescent O.
5. **`export.py`** writes the SVGs and the lockups (it nests the 512 mark inside them),
   `favicon.ico` (16/32/48), the touch and PWA PNGs, and a 1024 PNG.

## Where the knobs are

| To change | Edit |
|---|---|
| How much the koi bends, and where | `POSE` turn / mu / sig / base (`koi.py`) |
| Fin sweep or size | `ANATOMY["pec"]` `a` / `b` `rot`, `scale` (`a` = inner side of the curve) |
| Tail shape | `ANATOMY` `tail_outer`, `tail_trail` |
| Body width | `ANATOMY` `wscale` or the `body` profile |
| Tancho size or position | `TANCHO_R`, `TANCHO_X` |
| Koi size or position in the disk | `layout(koi_ratio, koi_dx, koi_dy)` (`emblem.py`) |
| Ring thickness or orientation | `layout(t_max, t_min, thick_deg)` |
| Colours | `PAL` and the gradient stops in `hero_svg` |
| Favicon build | `favicon_layout()`, `favicon_svg(tancho_scale)` |
| Letter weight or spacing | `wordmark(w, track, space)`, `KERN` |
| Lockup proportions | `lockup_h`, `lockup_v` (`export.py`) |

## Gotchas

- SVG space is y-down, so angles run clockwise on screen: `thick_deg=135` is the lower-left.
- Fin side `a` is +y, which is the inner side of the curve for positive curvature.
- `favicon_layout()` drops the whiskers but still sizes the koi as if they were there,
  because the bounding circle includes them. Change that and the favicon koi shifts.
- Stars are seeded (`seed=11`) but rejection-sampled around the koi, so moving the koi
  moves the stars too.
- The hero glow reaches about 26 units past the ring. Keep `r_out` ≤ 230 on the 512 grid,
  or the glow clips at the edge of the file.
- The mono mark knocks the koi out of the disk with `evenodd`, so the koi and whiskers are
  unioned first (`koi_all`). Otherwise their overlaps would fill back in.
- Whiskers are offset curves, not unions of circles. Circle unions leave tiny cusps that
  the fitter turns into dozens of micro-segments.
- `export.py` overwrites `brand/logo/`, so hand edits there get lost.
