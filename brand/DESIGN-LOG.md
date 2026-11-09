# Void Koi logo: design log

This summarises the Claude Code session (2026-09-25 to 26) that designed the logo: what was
tried, what was rejected and why, and the final numbers. It started in `~/Projects/domains`
and moved here. Pictures are in `brand/explorations/`.

## Brief

The user asked for "a logo of a void koi (void like sci-fi the void) as a logo for a
website". Nothing else was specified, and the user let Claude make the design calls. Their
other work shows the taste: `~/Projects/domains` holds sci-fi, cyberpunk and "hex + space"
.com name brainstorms. The name Void Koi came from the user; it isn't in those lists.

## Method

- The koi is procedural (Python, numpy and shapely). The anatomy is defined straight, bent
  along a curvature spine, and unioned into one silhouette. Every step was rendered with
  `rsvg-convert` and judged from side-by-side contact sheets, not from numbers.
- Final outlines are fitted to cubic Béziers: the koi went from 40 KB of polyline to
  2.4 KB, and every SVG is under 10 KB.

## How it evolved

1. **Tight curls (220–290°), `01-first-curls.png`.** These read as a koi but looked like
   a blob. The inner pectoral fin hung like a leg, and bending stretched the outer fin.
2. **Three styles on the curled koi, `02-concepts-rim-luminous-eclipse.png`.**
   - A: a void-black koi lit only by its rim read as a cheap neon sign.
   - B: a luminous koi around a black hole read as a ghost.
   - C: a black koi over a glowing violet sphere (the "eclipse") was strong but generic,
     like a dated 3D ball.

   All three were rejected. Lesson: a red dot on a curled head reads as an eye.
3. **Gravitational lensing, `03-orbit-lensing.png`.** A black hole bends light into arcs
   around itself, so the koi was wrapped around a central void. This also echoes the koi
   or dragon chasing a pearl. It looked like a purple seal curled around a ball, so the
   pose was dropped, but lensing became the story of the ring (step 10).
4. **Anatomy pass, `04-anatomy.png`.** A slimmer butterfly-koi body, broad fan pectorals
   drawn directly in body coordinates, a forked tail with rounded lobes, and hairline gaps
   separating the fins from the body (a classic logo refinement). Eye dots were tried and
   dropped as cartoonish.
5. **The breakthrough, `05-gentle-arcs.png`.** Fins attached rigidly, then blended halfway
   toward the bend (`follow=0.5`), in gentle 150–180° arcs. The head stays readable and both
   fans show, which is what makes a koi read from above.
6. **Styles on the new silhouette, `06-concepts-v2.png`.**
   - V1, a white Tancho koi inside a void disk, was **chosen**. It reads like a Japanese
     *kamon* (family crest) in deep space.
   - V1b, breaking out of the ring, looked like a sticker.
   - V2, the eclipse, is the **runner-up**.
   - V3, a rim-lit dark koi, was too subtle.
7. **Stress tests, `07-small-size-test.png` and `08-light-background-test.png`.** V1 holds
   at 32 px and is strong as a dark badge on light backgrounds. At 16 px it needs its own
   build (step 14).
8. **Pose and fit, `09-poses.png`.** C-arcs of 150–165° sit balanced in the circle.
   S-curves went flat and horizontal, and breaking out of the ring looked like a sticker.
   Final: 158° of bend, rotated 8°, fully inside the disk.
9. **Void markings, `10-void-markings.png`.** Koi patterns (utsuri, saddle) were cut out of
   the body so the void would show through, making the koi literally part void. They
   looked like bandages. The plain Tancho won.
10. **Lensed crescent ring, `11-ring-orientation.png`.** An even ring read as a button
    bevel. A crescent, thick on one side and a hairline on the other, reads as lensed
    light. The thick side sits at 135° (lower-left) to balance the koi's mass on the right
    and echo its curve.
11. **Fin sweep, `12-fin-sweep.png`.** Outer fin +15°, inner +10°: the fins still read,
    and no longer look like wings.
12. **Tail, `13-tail-length.png`.** The "long" lobes.
13. **Production.** Bézier fitting; whiskers rebuilt as tapered offset strokes (34 curves
    down to 16); ring radius reduced to 230 so the glow stays inside the 512 box; safe
    margins added to the lockups.
14. **Favicon build, `15-favicon-sizes.png`.** A full-bleed disk, a heavy crescent (44 to
    12 units thick), the koi at 86% of the disk, no whiskers, no fin gaps, and the Tancho
    1.55× larger. It reads at 32 px on light and dark tab bars. At 16 px it's a dark coin
    with a white flick, which is as much as any detailed mark gets.
15. **Wordmark, `14-wordmark.png`.** Custom geometric caps with stroke 12, tracking 34, a
    word space of 92 and optical kerning (V→O −13, K→O −9, I→D +5). The O of VOID is the
    lensed crescent. A Tancho dot inside the O of KOI read as a record button, so red
    stays exclusive to the emblem and the wordmark works in one colour.
16. **Final, `16-final-review.png`.**

## Final spec

The code is the source of truth. The headline numbers:

- **Pose:** 158° of bend, as a bell-curve bump (mu 0.45, sigma 0.4, floor 0.35); fins
  follow the bend 0.5; rotated 8°; fin gaps 0.006 body lengths.
- **Emblem:** 512 grid; ring outer radius 230, thickness 17 to 1.6, thick side at 135°.
  The koi's bounding circle is 0.80 of the disk radius, shifted −20, +2. The Tancho has a
  radius of 0.023 body lengths at 0.09 along the spine.
- **Favicon:** ring outer radius 256, thickness 44 to 12, koi at 0.86 shifted −18, +4,
  Tancho 1.55×.
- **Wordmark:** cap height 100, stroke 12, tracking 34, word space 92. The crescent O is
  17.4 thick at its heaviest and 5 at its thinnest.
- **Palette:** see `brand/README.md`.

## Deliverables

- `brand/logo/`: 13 files (marks, lockups, wordmark, favicon set, PWA icons, 1024 PNG).
- A Design canvas on claude.ai: https://claude.ai/artifact/S1AwMCuCzB7Wk9bYiRS6F5 with
  the primary lockup, horizontal lockups, mark variants, favicon and app icon in mock
  browser tabs, and the palette.

## About the user

- Writes casually and wants results; happy for Claude to drive the design decisions.
- Asked for this self-contained folder (assets, tools, and this summary) so that any
  later session can continue here.
- Has Adobe Illustrator 2025, so the SVGs may get hand-edited.

## Ideas not pursued yet

- The eclipse direction as a full alternative (black koi over a glowing disk).
- The tail dissolving into particles or pixels ("digital disintegration"); a constellation
  koi; glitch slices.
- A two-koi yin-yang (void and light). Dropped as cliché, and the name is singular.
- 空 (*kū*, the "void" of Japanese five-element cosmology) as a small seal or hanko
  element.
- Motion for a site hero: a shimmer running along the lensed ring, the koi gliding.
