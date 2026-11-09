#!/bin/bash
# Renders the images in Resources/ from the brand files: AppIcon.icns, the koi
# on a void tile drawn on the macOS icon grid (an 824 px tile in a 1024 px
# canvas, with a soft shadow); koi.png for the window that asks for the
# server; and the app icons for the Go menu.
set -euo pipefail
cd "$(dirname "$0")"

mark=../brand/logo/void-koi-mark.svg
apps=../brand/apps
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

for app in notes tasks files talk habits utilikit wiki; do
  rsvg-convert -w 64 -h 64 "$apps/$app.svg" -o "Resources/$app.png"
done
rsvg-convert -w 512 -h 512 "$mark" -o Resources/koi.png

python3 - "$mark" "$work/icon.svg" <<'PY'
import re, sys
mark = open(sys.argv[1]).read()
mark = re.sub(r'<\?xml[^>]*\?>', '', mark)
mark = re.sub(r'<svg[^>]*>', '<svg x="182" y="182" width="660" height="660" viewBox="0 0 512 512">', mark, count=1)
open(sys.argv[2], 'w').write(f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="14"/>
      <feOffset dy="12" result="blur"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <radialGradient id="tile" cx="50%" cy="42%" r="70%">
      <stop offset="0" stop-color="#110D24"/>
      <stop offset="1" stop-color="#08070D"/>
    </radialGradient>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#tile)" filter="url(#shadow)"/>
  {mark}
</svg>''')
PY

iconset="$work/AppIcon.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
  rsvg-convert -w $size -h $size "$work/icon.svg" -o "$iconset/icon_${size}x${size}.png"
  rsvg-convert -w $((size * 2)) -h $((size * 2)) "$work/icon.svg" -o "$iconset/icon_${size}x${size}@2x.png"
done
iconutil -c icns "$iconset" -o Resources/AppIcon.icns
[ -z "${PREVIEW:-}" ] || cp "$iconset/icon_512x512@2x.png" "$PREVIEW"
echo "Made Resources/AppIcon.icns, koi.png and the app icons"
