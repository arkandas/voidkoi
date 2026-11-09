"""Write the voidkoi logo package.

    python3 tools/logo/export.py            # -> brand/logo/
    python3 tools/logo/export.py /tmp/out   # anywhere else (e.g. to diff against brand/logo)

Needs numpy + shapely, plus rsvg-convert (librsvg) and magick (ImageMagick) for rasters.
"""
import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from emblem import PAL, f, favicon_layout, favicon_svg, flat_svg, hero_svg, layout, mono_svg  # noqa: E402
from wordmark import wordmark  # noqa: E402

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parents[1] / "brand" / "logo"
OUT.mkdir(parents=True, exist_ok=True)

INK = "#110E1C"      # wordmark on light backgrounds
MIST = "#F2EEFF"     # wordmark on dark backgrounds
H = 100.0            # wordmark cap height in lockup units


def inner(svg):
    """Strip the outer <svg> and <title> so a mark can be nested inside a lockup."""
    body = re.sub(r"^<svg[^>]*>", "", svg)
    body = re.sub(r"</svg>$", "", body)
    return re.sub(r"<title>.*?</title>", "", body)


def write(name, s):
    (OUT / name).write_text(s)


def lockup_h(mark_svg, text_fill, mark_d=260.0, gap=64.0):
    """Mark on the left, wordmark centred on the disk's middle."""
    sc = mark_d / 512
    pad = mark_d * 26 / 512            # the same breathing room the mark keeps inside its box
    total_w = mark_d + gap + ww + pad
    total_h = mark_d
    ty = (mark_d - H) / 2
    g_mark = f'<g transform="scale({f(sc, 5)})">{inner(mark_svg)}</g>'
    g_text = f'<g transform="translate({f(mark_d + gap)} {f(ty)})"><path d="{wd}" fill="{text_fill}" fill-rule="evenodd"/></g>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f(total_w)} {f(total_h)}" '
            f'width="{f(total_w)}" height="{f(total_h)}"><title>voidkoi</title>{g_mark}{g_text}</svg>')


def lockup_v(mark_svg, text_fill, mark_d=360.0, gap=40.0, text_w=560.0, pad=32.0):
    """Mark above, wordmark below."""
    ts = text_w / ww
    total_w = max(mark_d, text_w) + 2 * pad
    total_h = mark_d + gap + (H + 3) * ts + pad
    sc = mark_d / 512
    mx = (total_w - mark_d) / 2
    tx = (total_w - text_w) / 2
    g_mark = f'<g transform="translate({f(mx)} 0) scale({f(sc, 5)})">{inner(mark_svg)}</g>'
    g_text = (f'<g transform="translate({f(tx)} {f(mark_d + gap)}) scale({f(ts, 5)})">'
              f'<path d="{wd}" fill="{text_fill}" fill-rule="evenodd"/></g>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f(total_w)} {f(total_h)}" '
            f'width="{f(total_w)}" height="{f(total_h)}"><title>voidkoi</title>{g_mark}{g_text}</svg>')


def rsvg(src, out, w, h=None):
    subprocess.run(["rsvg-convert", str(OUT / src), "-w", str(w), "-h", str(h or w), "-o", str(OUT / out)],
                   check=True)


def square_icon(name, px, ratio):
    """Hero mark centred on a full-bleed void square (home-screen / PWA icons).
    ratio 0.80 keeps the disk inside the maskable-icon safe zone."""
    d = 512 * ratio
    off = (512 - d) / 2
    s = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">'
         f'<rect width="512" height="512" fill="{PAL["void"]}"/>'
         f'<g transform="translate({f(off)} {f(off)}) scale({f(ratio, 5)})">{inner(mark_hero)}</g></svg>')
    tmp = OUT / f".{name}.svg"
    tmp.write_text(s)
    subprocess.run(["rsvg-convert", str(tmp), "-w", str(px), "-h", str(px), "-o", str(OUT / name)], check=True)
    tmp.unlink()


# ---- vectors
L = layout()
mark_hero = hero_svg(L)
mark_flat = flat_svg(L)
write("void-koi-mark.svg", mark_hero)
write("void-koi-mark-flat.svg", mark_flat)
write("void-koi-mark-mono.svg", mono_svg(L))
write("favicon.svg", favicon_svg(favicon_layout()))

wd, ww, _ = wordmark(H=H, void_o="crescent")
pad = 4
write("void-koi-wordmark.svg",
      f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-pad} {-pad} {f(ww + 2 * pad)} {f(H + 2 * pad + 3)}" '
      f'width="{f(ww + 2 * pad)}" height="{f(H + 2 * pad + 3)}" fill="currentColor"><title>voidkoi</title>'
      f'<path d="{wd}" fill-rule="evenodd"/></svg>')

write("void-koi-lockup-dark.svg", lockup_h(mark_hero, MIST))
write("void-koi-lockup-light.svg", lockup_h(mark_flat, INK))
write("void-koi-stacked-dark.svg", lockup_v(mark_hero, MIST))

# ---- rasters
for px in (16, 32, 48):
    rsvg("favicon.svg", f".fav{px}.png", px)
subprocess.run(["magick"] + [str(OUT / f".fav{px}.png") for px in (16, 32, 48)] + [str(OUT / "favicon.ico")],
               check=True)
for px in (16, 32, 48):
    (OUT / f".fav{px}.png").unlink()
square_icon("apple-touch-icon.png", 180, 0.86)
square_icon("icon-192.png", 192, 0.80)
square_icon("icon-512.png", 512, 0.80)
rsvg("void-koi-mark.svg", "void-koi-mark-1024.png", 1024)

print(f"wrote {len(list(OUT.iterdir()))} files to {OUT}")
