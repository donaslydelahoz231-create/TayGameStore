#!/usr/bin/env bash
# Descarga las fuentes de Google Fonts que usa el HTML original para servirlas
# localmente en las pruebas visuales (sin depender de la red durante los tests).
#
# Uso: bash e2e/fixtures/fetch-google-fonts.sh "<user-agent de Chromium>"
# Oxanium y Plus Jakarta Sans se distribuyen bajo SIL Open Font License 1.1 (según Google Fonts).
set -euo pipefail

USER_AGENT="${1:?Indica el user-agent del Chromium de Playwright}"
CSS_URL='https://fonts.googleapis.com/css2?family=Oxanium:wght@500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap'
OUT_DIR="$(dirname "$0")/google-fonts"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

curl -sSf --retry 5 -A "$USER_AGENT" "$CSS_URL" -o "$OUT_DIR/fonts.css"

{
  printf '{\n  "%s": { "file": "fonts.css", "contentType": "text/css; charset=utf-8" }' "$CSS_URL"
  for url in $(grep -o 'https://fonts.gstatic.com/[^)]*' "$OUT_DIR/fonts.css" | sort -u); do
    file="$(echo "${url#https://fonts.gstatic.com/}" | tr '/' '_')"
    curl -sSf --retry 5 "$url" -o "$OUT_DIR/$file"
    printf ',\n  "%s": { "file": "%s", "contentType": "font/woff2" }' "$url" "$file"
  done
  printf '\n}\n'
} > "$OUT_DIR/manifest.json"

echo "Fuentes descargadas en $OUT_DIR:"
ls -la "$OUT_DIR"
