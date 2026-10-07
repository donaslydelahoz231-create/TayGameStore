#!/usr/bin/env bash
# Auditoría de solo lectura: busca secretos y el documento del propietario en el árbol, el
# compilado (dist/), los archivos ignorados y todo el historial de Git. Imprime solo conteos y
# nombres de archivo; nunca los valores. Sale con 1 si encuentra algo.
#
#   bash scripts/auditoria/escanear.sh
#
# El documento del propietario se busca por sus 4 últimos dígitos (TGS_SUFIJO_DOC o
# .claude/guardia.local con SUFIJO_DOC=XXXX). Sin sufijo, esa búsqueda se marca NO VERIFICADO.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

hallazgos=0
declare -A patrones=(
  [token_mercado_pago]='APP_USR-[0-9]{6,}'
  [token_prueba_mercado_pago]='TEST-[0-9]{10,}-'
  [clave_api_google]='AIza[0-9A-Za-z_-]{35}'
  [secreto_oauth_google]='GOCSPX-[0-9A-Za-z_-]{10,}'
  [llave_privada]='-----BEGIN [A-Z ]*PRIVATE KEY'
  [token_github]='gh[pousr]_[0-9A-Za-z]{30,}'
  [clave_anthropic]='sk-ant-[0-9A-Za-z_-]{20,}'
  [url_bd_con_clave]='postgres(ql)?://[^ :@/"]+:[^ @/"]{6,}@[a-z0-9.-]*(neon|render|amazonaws|supabase)'
  [legal_id_largo]='LEGAL_ID[^0-9]{0,20}[0-9][0-9. ]{4,}'
)

sufijo="${TGS_SUFIJO_DOC:-}"
if [ -z "$sufijo" ] && [ -f .claude/guardia.local ]; then
  sufijo="$(sed -n 's/^SUFIJO_DOC=\([0-9]\{4\}\)$/\1/p' .claude/guardia.local | head -n1)"
fi
if printf '%s' "$sufijo" | grep -qE '^[0-9]{4}$'; then
  s="$(printf '%s' "$sufijo" | sed 's/./&[. -]?/g; s/\[\. -\]?$//')"
  patrones[documento_propietario]="(?<![0-9.:])[0-9](?:[. -]?[0-9]){2,}[. -]?${s}(?![0-9Z])"
else
  echo "documento_propietario: NO VERIFICADO (falta TGS_SUFIJO_DOC o .claude/guardia.local)"
fi

# Valores ficticios conocidos de las pruebas (tests/unit/legal-pages.test.ts y su historial).
FICTICIOS='NIT 900\.000\.000-0|CC 1\.023\.456\.789'
sin_ficticios() { grep -vE "$FICTICIOS" || true; }

ignorados() {
  git ls-files --others --ignored --exclude-standard | grep -v -e '^node_modules/' -e '^dist/' || true
}

printf '%-26s %6s %6s %9s %10s\n' 'PATRÓN (líneas)' árbol dist ignorados historial
for nombre in $(printf '%s\n' "${!patrones[@]}" | sort); do
  p="${patrones[$nombre]}"
  # Conteo de líneas coincidentes (sin los valores ficticios de las pruebas).
  arbol=$(grep -rhP --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist -e "$p" . 2>/dev/null | sin_ficticios | wc -l)
  compilado=0
  [ -d dist ] && compilado=$(grep -rhP -e "$p" dist 2>/dev/null | sin_ficticios | wc -l)
  ign=$(ignorados | xargs -r -d '\n' grep -hP -e "$p" 2>/dev/null | sin_ficticios | wc -l)
  hist=$(git log --all -p --format='%H%n%B' | grep -P -e "$p" | sin_ficticios | wc -l)
  printf '%-26s %6s %6s %9s %10s\n' "$nombre" "$arbol" "$compilado" "$ign" "$hist"
  total=$((arbol + compilado + ign + hist))
  if [ "$total" -gt 0 ]; then
    hallazgos=$((hallazgos + total))
    # Solo los nombres de archivo, nunca el contenido.
    grep -rlP --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist -e "$p" . 2>/dev/null | sed 's/^/    archivo: /'
  fi
done

echo
echo "Rama: $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
git fetch -q origin 2>/dev/null &&
  echo "Igual a GitHub: $([ "$(git rev-parse HEAD)" = "$(git rev-parse '@{u}' 2>/dev/null)" ] && echo sí || echo NO)"
echo "Cambios locales sin commit: $(git status --porcelain | wc -l)"

if [ "$hallazgos" -gt 0 ]; then
  echo "RESULTADO: $hallazgos coincidencia(s). Revisar sin imprimir valores."
  exit 1
fi
echo "RESULTADO: 0 coincidencias."
