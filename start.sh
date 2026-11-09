#!/bin/sh
set -e

if [ -z "$VOIDKOI_NEXTAUTH_SECRET" ] && [ -z "$NEXTAUTH_SECRET" ]; then
  echo "VOIDKOI_NEXTAUTH_SECRET is not set. Generate one with: openssl rand -base64 32" >&2
  exit 1
fi

case "${VOIDKOI_NEXTAUTH_SECRET:-$NEXTAUTH_SECRET}" in
  change-me|YOUR_SECRET)
    echo "VOIDKOI_NEXTAUTH_SECRET still has its example value, which would let anyone forge a session. Generate one with: openssl rand -base64 32" >&2
    exit 1
    ;;
esac

if [ -z "$VOIDKOI_NEXTAUTH_URL" ] && [ -z "$NEXTAUTH_URL" ]; then
  echo "WARNING: VOIDKOI_NEXTAUTH_URL is not set. Sign-in redirects will point at http://localhost:3000." >&2
fi

auth_mode=$(printf '%s' "${VOIDKOI_AUTH:-local}" | tr '[:upper:]' '[:lower:]')
case "$auth_mode" in
  local) ;;
  oidc)
    for name in VOIDKOI_OIDC_ISSUER VOIDKOI_OIDC_CLIENT_ID VOIDKOI_OIDC_CLIENT_SECRET; do
      eval "value=\${$name}"
      if [ -z "$value" ]; then
        echo "VOIDKOI_AUTH=oidc also needs $name." >&2
        exit 1
      fi
    done
    ;;
  *)
    echo "VOIDKOI_AUTH must be \"local\" or \"oidc\", not \"$VOIDKOI_AUTH\"." >&2
    exit 1
    ;;
esac

echo "Applying database migrations..."
node scripts/migrate.mjs

echo "Starting voidkoi..."
exec node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON server.ts
