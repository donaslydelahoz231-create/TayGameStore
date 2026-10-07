#!/usr/bin/env bash
# Pruebas de la guardia de datos (.claude/hooks/guardia-datos.sh) con entradas simuladas.
# Todos los valores son ficticios y se arman por partes en tiempo de ejecución: ningún secreto ni
# documento real aparece en este archivo (y la propia guardia no lo bloquea al escribirlo).
#
#   bash scripts/auditoria/probar-guardia.sh
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
H=.claude/hooks/guardia-datos.sh
fallos=0

# $1 descripción, $2 resultado esperado (permitir|bloquear|preguntar), $3 JSON de entrada.
probar() {
  local salida codigo obtenido
  salida="$(printf '%s' "$3" | TGS_SUFIJO_DOC="${SUFIJO:-}" CLAUDE_PROJECT_DIR="$PWD" "$H" 2>/dev/null)"
  codigo=$?
  if [ "$codigo" = 2 ]; then
    obtenido=bloquear
  elif printf '%s' "$salida" | grep -q '"permissionDecision":"ask"'; then
    obtenido=preguntar
  else
    obtenido=permitir
  fi
  if [ "$obtenido" = "$2" ]; then
    printf '  OK     %-48s %s\n' "$1" "$obtenido"
  else
    printf '  FALLO  %-48s esperado=%s obtenido=%s\n' "$1" "$2" "$obtenido"
    fallos=$((fallos + 1))
  fi
}
bash_json() { jq -cn --arg c "$1" '{tool_name:"Bash",tool_input:{command:$c}}'; }
write_json() { jq -cn --arg c "$1" '{tool_name:"Write",tool_input:{file_path:"x.md",content:$c}}'; }
herramienta_json() { jq -cn --arg t "$1" '{tool_name:$t,tool_input:{}}'; }
variable_json() {
  jq -cn --arg k "$1" --arg v "$2" \
    '{tool_name:"mcp__Render__list_logs",tool_input:{envVars:[{key:$k,value:$v}]}}'
}

# Valores ficticios armados por partes.
mp="APP_""USR-$(printf '%012d' 42)"
gk="AI""za$(printf 'x%.0s' {1..35})"
gh="gh""p_$(printf 'a%.0s' {1..36})"
pk="-----BEGIN ""PRIVATE KEY"
doc="LEGAL""_ID"
ficticio="9.876.541.111"
g="gi""t"

echo "Secretos"
probar "comando normal" permitir "$(bash_json 'ls -la')"
probar "token de Mercado Pago (ficticio)" bloquear "$(bash_json "echo $mp")"
probar "clave de Google en un archivo (ficticia)" bloquear "$(write_json "k='$gk'")"
probar "token de GitHub (ficticio)" bloquear "$(write_json "$gh")"
probar "llave privada (ficticia)" bloquear "$(write_json "$pk")"
probar "patrones de búsqueda (regex, no secretos)" permitir \
  "$(bash_json 'grep -E "APP_USR-[0-9]{6,}|AIza[0-9A-Za-z_-]{35}"')"

echo "Documento del propietario (sufijo ficticio 1111)"
probar "variable legal con número largo" bloquear "$(variable_json "$doc" "CC $ficticio")"
probar "variable legal con 4 dígitos" permitir "$(variable_json "$doc" "1111")"
SUFIJO=1111 probar "número con puntos" bloquear "$(bash_json "echo $ficticio")"
SUFIJO=1111 probar "número sin puntos" bloquear "$(bash_json "echo ${ficticio//./}")"
SUFIJO=1111 probar "número con espacios" bloquear "$(bash_json "echo ${ficticio//./ }")"
SUFIJO=1111 probar "marca de tiempo (no es documento)" permitir \
  "$(bash_json 'x 2026-10-07T11:16:13.684421111Z')"
SUFIJO=1111 probar "solo los 4 dígitos" permitir "$(bash_json 'echo terminado en 1111')"
probar "sin sufijo configurado: regla inactiva" permitir "$(bash_json "echo $ficticio")"

echo "Historial y push"
probar "push forzado" bloquear "$(bash_json "$g push --force origin x")"
probar "push -f en otro orden" bloquear "$(bash_json "$g push origin x -f")"
probar "push con +refspec" bloquear "$(bash_json "$g push origin +x")"
probar "reescritura del historial" bloquear "$(bash_json "$g filter-repo --mailmap m")"
probar "documentación que menciona estas palabras" permitir \
  "$(write_json "$g push"$'\n'"no uses --force")"
probar "push normal: pide autorización" preguntar "$(bash_json "$g push -u origin rama")"
probar "git status" permitir "$(bash_json "$g status")"

echo "Gates de producción"
probar "variables de Render" preguntar "$(herramienta_json mcp__Render__update_environment_variables)"
probar "despliegue en Render" preguntar "$(herramienta_json mcp__Render__trigger_deploy)"
probar "cambio de rutina" preguntar "$(herramienta_json mcp__claude-code-remote__update_trigger)"
probar "escritura en GitHub" preguntar "$(herramienta_json mcp__github__push_files)"
probar "publicar flujo de n8n" preguntar "$(herramienta_json mcp__n8n__publish_workflow)"
probar "lectura de logs de Render" permitir "$(herramienta_json mcp__Render__list_logs)"

echo
if [ "$fallos" -gt 0 ]; then
  echo "RESULTADO: $fallos fallo(s)."
  exit 1
fi
echo "RESULTADO: todas las pruebas pasan."
