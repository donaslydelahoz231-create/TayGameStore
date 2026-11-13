#!/usr/bin/env bash
# Instala un navegador de Playwright con sus dependencias del sistema (apt), con reintentos.
#
# El 2026-11-11 los espejos de apt de los runners de GitHub (azure.archive.ubuntu.com y
# archive.ubuntu.com) dejaron de resolver por DNS durante minutos y este paso cayó sin que el
# código tuviera nada que ver. Tres intentos con espera creciente; si los tres fallan, el paso
# falla (el error no se oculta) y cada reintento queda anotado como aviso en el resumen.
#
# Uso: bash scripts/ci/instalar-navegador.sh chromium|firefox|webkit
set -uo pipefail

browser="${1:-}"
case "$browser" in
  chromium | firefox | webkit) ;;
  *)
    echo "Uso: $0 chromium|firefox|webkit" >&2
    exit 2
    ;;
esac

# Segundos de la primera espera (la segunda es el doble). Configurable solo para las pruebas.
base="${INSTALAR_ESPERA_BASE:-45}"
intentos=3
for ((intento = 1; intento <= intentos; intento++)); do
  if npx playwright install --with-deps "$browser"; then
    exit 0
  fi
  if ((intento < intentos)); then
    espera=$((intento * base))
    echo "::warning::No se pudo instalar $browser (intento $intento de $intentos); reintento en ${espera} s."
    sleep "$espera"
  fi
done
echo "::error::No se pudo instalar $browser tras $intentos intentos (¿espejos de apt caídos?)."
exit 1
