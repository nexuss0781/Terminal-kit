#!/bin/sh
set -eu

case "${PARADOX_GATEWAY_URL:-}" in
  http://*|https://*) ;;
  *) echo "PARADOX_GATEWAY_URL must be an absolute HTTP(S) URL" >&2; exit 64 ;;
esac

case "${PARADOX_RESOLVER_TTL_SECONDS:-}" in
  ''|*[!0-9]*) echo "PARADOX_RESOLVER_TTL_SECONDS must be a positive integer" >&2; exit 64 ;;
esac

if [ "$PARADOX_RESOLVER_TTL_SECONDS" -lt 1 ]; then
  echo "PARADOX_RESOLVER_TTL_SECONDS must be greater than zero" >&2
  exit 64
fi

export PARADOX_GATEWAY_URL PARADOX_RESOLVER_TTL_SECONDS PARADOX_RESOLVER_VERSION
envsubst '${PARADOX_GATEWAY_URL} ${PARADOX_RESOLVER_TTL_SECONDS} ${PARADOX_RESOLVER_VERSION}' \
  < /usr/share/nginx/html/active-domain.json.template \
  > /usr/share/nginx/html/active-domain.json

exec "$@"
