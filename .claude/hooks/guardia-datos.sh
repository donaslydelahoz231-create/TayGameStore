#!/usr/bin/env bash
# Guardia de datos (PreToolUse). Antes de ejecutar una herramienta:
#   - bloquea (salida 2) si su entrada contiene un secreto, el documento completo del propietario
#     o una reescritura del historial / push forzado;
#   - pide confirmación al dueño (permissionDecision "ask") para acciones que tocan producción,
#     GitHub, rutinas o n8n.
# Requisitos 1, 5, 8, 13–16 y 19 de docs/datos-del-propietario.md. El motivo nunca repite el valor.
# Cualquier otro fallo del script no bloquea: Claude Code lo trata como error no bloqueante.
#
# Sufijo del documento del propietario (sus 4 últimos dígitos, ya públicos en los términos):
# variable de entorno TGS_SUFIJO_DOC o archivo .claude/guardia.local (no versionado) con
# SUFIJO_DOC=XXXX. Sin sufijo, esa regla no se aplica; las demás sí.
set -u

entrada="$(cat)"

bloquear() {
  echo "Bloqueado por la guardia de datos: $1. Usa valores ficticios o pide autorización explícita al dueño (docs/datos-del-propietario.md)." >&2
  exit 2
}

coincide() { printf '%s' "$entrada" | grep -qP -- "$1"; }

# 1. Secretos y credenciales (formatos reales, no los nombres de las variables).
coincide 'APP_USR-[0-9]{6,}' && bloquear "token de Mercado Pago"
coincide 'TEST-[0-9]{10,}-' && bloquear "token de prueba de Mercado Pago"
coincide 'AIza[0-9A-Za-z_-]{35}' && bloquear "clave de API de Google"
coincide 'GOCSPX-[0-9A-Za-z_-]{10,}' && bloquear "secreto de cliente OAuth de Google"
coincide '-----BEGIN [A-Z ]*PRIVATE KEY' && bloquear "llave privada"
coincide 'gh[pousr]_[0-9A-Za-z]{30,}' && bloquear "token de GitHub"
coincide 'sk-ant-[0-9A-Za-z_-]{20,}' && bloquear "clave de API de Anthropic"
coincide 'postgres(ql)?://[^ :@/"]+:[^ @/"]{6,}@[a-z0-9.-]*(neon|render|amazonaws|supabase)' &&
  bloquear "URL de base de datos con contraseña"

# 2. Documento del propietario: LEGAL_ID solo admite 4 dígitos; nunca el número completo.
coincide 'LEGAL_ID[^0-9\n]{0,20}[0-9][0-9. ]{4,}' && bloquear "LEGAL_ID con más de 4 dígitos"
sufijo="${TGS_SUFIJO_DOC:-}"
archivo="${CLAUDE_PROJECT_DIR:-.}/.claude/guardia.local"
if [ -z "$sufijo" ] && [ -f "$archivo" ]; then
  sufijo="$(sed -n 's/^SUFIJO_DOC=\([0-9]\{4\}\)$/\1/p' "$archivo" | head -n1)"
fi
if printf '%s' "$sufijo" | grep -qE '^[0-9]{4}$'; then
  # Secuencia de 7 o más dígitos que termina en el sufijo, con o sin separadores (. espacio -)
  # también dentro del sufijo («1.234.567.890» separa sus 4 últimos dígitos). Se excluyen
  # fracciones de segundo de marcas de tiempo (precedidas de "." o ":" y seguidas de "Z").
  s="$(printf '%s' "$sufijo" | sed 's/./&[. -]?/g; s/\[\. -\]?$//')"
  coincide "(?<![0-9.:])[0-9](?:[. -]?[0-9]){2,}[. -]?${s}(?![0-9Z])" &&
    bloquear "posible número de documento del propietario"
fi

# 3. Push forzado o reescritura del historial (nunca sin autorización explícita). Solo se mira el
#    comando real de Bash, línea por línea y dentro de un mismo segmento (sin ; & |), para no
#    confundir documentación que menciona estas palabras.
herramienta="$(printf '%s' "$entrada" | grep -oP '"tool_name"\s*:\s*"\K[^"]+' | head -n1)"
comando=""
if [ "$herramienta" = "Bash" ]; then
  if command -v jq >/dev/null 2>&1; then
    comando="$(printf '%s' "$entrada" | jq -r '.tool_input.command // empty' 2>/dev/null)"
  else
    comando="$entrada"
  fi
fi
en_comando() { printf '%s\n' "$comando" | grep -qP -- "$1"; }
en_comando 'git\b[^;&|]*\bpush\b[^;&|]*(--(force|mirror)|\s-[a-zA-Z]*f\b|\s\+[A-Za-z0-9_./-])' &&
  bloquear "push forzado"
en_comando 'git\b[^;&|]*\bfilter-(repo|branch)\b' && bloquear "reescritura del historial de Git"

# 4. Gates: acciones que tocan producción, GitHub, rutinas o n8n piden confirmación al dueño
#    (requisitos 13–15 y 19). Respaldo de permissions.ask por si la sesión no lo aplica.
preguntar() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"%s"}}\n' \
    "Requiere autorización explícita del dueño: $1"
  exit 0
}
case "$herramienta" in
  mcp__Render__update_environment_variables | mcp__Render__trigger_deploy | mcp__Render__create_*)
    preguntar "cambio en Render (producción)" ;;
  mcp__claude-code-remote__create_trigger | mcp__claude-code-remote__update_trigger | \
    mcp__claude-code-remote__delete_trigger | mcp__claude-code-remote__fire_trigger)
    preguntar "cambio en rutinas programadas" ;;
  mcp__github__push_files | mcp__github__create_or_update_file | mcp__github__delete_file | \
    mcp__github__create_branch | mcp__github__merge_pull_request | \
    mcp__github__update_pull_request_branch | mcp__github__enable_pr_auto_merge | \
    mcp__github__actions_run_trigger)
    preguntar "escritura en GitHub" ;;
  mcp__n8n__update_workflow | mcp__n8n__publish_workflow | mcp__n8n__unpublish_workflow | \
    mcp__n8n__archive_workflow)
    preguntar "cambio en flujos de n8n" ;;
  Bash)
    en_comando 'git\b[^;&|]*\bpush\b' && preguntar "git push (Render despliega cada commit de la rama)" ;;
esac

exit 0
