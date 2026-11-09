"""Render a review sheet of the logo package -> tools/logo/_preview/review.png

    python3 tools/logo/preview.py [package_dir]      # default: brand/logo

Row 1: marks on their intended backgrounds (hero, flat, mono ink, mono reversed).
Row 2: horizontal lockups on dark and light.
Row 3: favicon at 16/32/48/64 px, magnified 3x nearest-neighbour, on paper and on a
       dark browser-tab colour.
Look at the PNG after every change: judging the SVG numbers blind doesn't work.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
PKG = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parents[1] / "brand" / "logo"
OUT = HERE / "_preview"
DARK, PAPER, TAB = "#08070D", "#F4F1EA", "#202124"


def run(*cmd):
    subprocess.run([str(c) for c in cmd], check=True)


def main():
    OUT.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        t = Path(td)
        mono = (PKG / "void-koi-mark-mono.svg").read_text()      # currentColor: colour a copy
        (t / "mono-ink.svg").write_text(mono.replace('fill="currentColor"', 'fill="#110E1C"'))
        (t / "mono-mist.svg").write_text(mono.replace('fill="currentColor"', 'fill="#F2EEFF"'))

        row1 = []
        for i, (src, bg) in enumerate([(PKG / "void-koi-mark.svg", DARK), (PKG / "void-koi-mark-flat.svg", PAPER),
                                       (t / "mono-ink.svg", PAPER), (t / "mono-mist.svg", DARK)]):
            o = t / f"m{i}.png"
            run("rsvg-convert", src, "-w", 360, "-h", 360, "-b", bg, "-o", o)
            row1.append(o)
        run("magick", *row1, "+append", t / "row1.png")

        row2 = []
        for i, (name, bg) in enumerate([("void-koi-lockup-dark.svg", DARK), ("void-koi-lockup-light.svg", PAPER)]):
            o = t / f"l{i}.png"
            run("rsvg-convert", PKG / name, "-w", 640, "-b", bg, "-o", o)
            run("magick", o, "-background", bg, "-gravity", "center", "-extent", "720x240", o)
            row2.append(o)
        run("magick", *row2, "+append", t / "row2.png")

        row3 = []
        for j, bg in enumerate([PAPER, TAB]):
            cells = []
            for px in (16, 32, 48, 64):
                o = t / f"f{j}_{px}.png"
                run("rsvg-convert", PKG / "favicon.svg", "-w", px, "-h", px, "-b", bg, "-o", o)
                cells.append(o)
            s = t / f"strip{j}.png"
            run("magick", *cells, "-bordercolor", bg, "-border", 8, "-background", bg, "-gravity", "south",
                "+append", s)
            run("magick", s, "-filter", "point", "-resize", "300%", "-background", bg, "-gravity", "center",
                "-extent", "720x240", s)
            row3.append(s)
        run("magick", *row3, "+append", t / "row3.png")

        run("magick", t / "row1.png", t / "row2.png", t / "row3.png", "-append", "+repage", OUT / "review.png")
    print(OUT / "review.png")


if __name__ == "__main__":
    main()
