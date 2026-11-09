#!/bin/bash
# Builds build/voidkoi.app, and build/voidkoi.dmg with --dmg.
# --debug builds the debug version, with the web inspector and the snapshot
# mode, as com.arkandas.voidkoi.debug so it keeps its own settings and data.
# The server built in comes from VOIDKOI_SERVER, or else from build.conf.
set -euo pipefail
cd "$(dirname "$0")"

configuration=release
dmg=false
for arg in "$@"; do
  case "$arg" in
    --debug) configuration=debug ;;
    --dmg) dmg=true ;;
    *) echo "usage: $0 [--dmg] [--debug]" >&2; exit 2 ;;
  esac
done

server="${VOIDKOI_SERVER:-}"
if [ -z "$server" ] && [ -f build.conf ]; then
  server=$(sed -n 's/^[[:space:]]*VOIDKOI_SERVER[[:space:]]*=//p' build.conf | tail -n 1 | tr -d "\"' \r\t")
fi
server="${server%/}"
pattern='^https?://[^/[:space:]@]+$'
if [ -n "$server" ] && ! [[ "$server" =~ $pattern ]]; then
  echo "VOIDKOI_SERVER must be an address like https://example.com, with no path, user or password: $server" >&2
  exit 2
fi

# http only for this Mac, a private network address or a .local name, as the app takes it.
is_local() {
  local host a b c d
  host=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
  if [[ "$host" == \[*\]* ]]; then
    # IPv6: ::1, fc00::/7 or fe80::/10, with or without a zone.
    host=${host#\[}
    host=${host%%\]*}
    host=${host%%%*}
    [[ "$host" == ::1 || "$host" =~ ^f[cd][0-9a-f]{2}: || "$host" =~ ^fe[89ab][0-9a-f]: ]]
    return
  fi
  host=${host%%:*}
  [[ "$host" == localhost || "$host" == *.local ]] && return 0
  [[ "$host" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || return 1
  a=$((10#${BASH_REMATCH[1]})) b=$((10#${BASH_REMATCH[2]})) c=$((10#${BASH_REMATCH[3]})) d=$((10#${BASH_REMATCH[4]}))
  (( a <= 255 && b <= 255 && c <= 255 && d <= 255 )) || return 1
  (( a == 127 || a == 10 || (a == 172 && b >= 16 && b <= 31) || (a == 192 && b == 168) || (a == 169 && b == 254) ))
}
if [[ "$server" == http://* ]] && ! is_local "${server#http://}"; then
  echo "VOIDKOI_SERVER may use http only for localhost, a private network address or a .local name: $server" >&2
  exit 2
fi

version=$(tr -d '[:space:]' < VERSION)
[ -f Resources/AppIcon.icns ] || ./make-icons.sh

if [ "$configuration" = release ]; then
  arch=(--arch arm64 --arch x86_64)
else
  arch=()
fi
swift build -c "$configuration" ${arch[@]+"${arch[@]}"}
binary="$(swift build -c "$configuration" ${arch[@]+"${arch[@]}"} --show-bin-path)/voidkoi"

app=build/voidkoi.app
plist="$app/Contents/Info.plist"
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$binary" "$app/Contents/MacOS/voidkoi"
cp Info.plist "$plist"
plutil -replace CFBundleShortVersionString -string "$version" "$plist"
plutil -replace CFBundleVersion -string "$version" "$plist"
plutil -replace VoidkoiServer -string "$server" "$plist"
[ "$configuration" = release ] || plutil -replace CFBundleIdentifier -string com.arkandas.voidkoi.debug "$plist"
cp Resources/* "$app/Contents/Resources/"
codesign --force --sign - "$app"
echo "Built $app ($version, $configuration, server: ${server:-none})"

if $dmg; then
  stage=$(mktemp -d)
  cp -R "$app" "$stage/"
  ln -s /Applications "$stage/Applications"
  rm -f build/voidkoi.dmg
  hdiutil create -volname voidkoi -srcfolder "$stage" -format UDZO build/voidkoi.dmg >/dev/null
  rm -rf "$stage"
  echo "Built build/voidkoi.dmg"
fi
