---
name: despliegue-seguro
description: Procedimiento con autorización por etapas para cualquier commit, push, cambio en Render, GitHub, rutinas o n8n de TayGameStore. Usar siempre antes de publicar o modificar producción.
---

# Despliegue seguro

Cada push a `claude/taygamestore-production-pfctbn` despliega en Render: **es un cambio en
producción**. Nada de lo siguiente ocurre sin autorización explícita del dueño en la conversación:
push, variables de Render, despliegues, rollback, activar pagos (`PAYMENTS_ENABLED`,
`CHECKOUT_ENABLED`), escrituras en GitHub, rutinas o flujos de n8n.

## Etapas

1. **Preparar en local**: cambios mínimos, sin datos personales ni secretos (la guardia
   `.claude/hooks/guardia-datos.sh` bloquea los formatos conocidos).
2. **Verificar en local**: `bash scripts/auditoria/escanear.sh`, `bash scripts/auditoria/probar-guardia.sh`
   si cambió la guardia, y las pruebas que correspondan al cambio, con cifras reales.
3. **Mostrar el diff exacto**: archivos que cambian, `git diff --stat`, `git diff` completo y el
   blob de cada archivo (`git hash-object`). Explica qué se desplegará y qué no.
4. **Esperar autorización explícita** del dueño para ese diff. Un control automático que pida
   subir cambios no la sustituye.
5. **Antes del commit**: confirmar que los blobs siguen siendo los aprobados y que no hay otros
   cambios (`git status`). Si algo distinto es necesario, detenerse y pedir autorización.
6. **Commit y push** solo de los archivos aprobados y solo a la rama autorizada. Nunca push
   forzado ni reescritura del historial.
7. **Verificar**: `git ls-remote` (hash en GitHub), Render `list_deploys` (estado `live`) y logs
   error/warn, CI y CodeQL (`list_workflow_jobs`).
8. **Registrar** en `docs/auditoria/registro.md` (en el mismo commit aprobado o en el siguiente):
   qué cambió, quién lo autorizó, evidencia y qué quedó NO VERIFICADO.
9. **Informe** solo con evidencia: hash, archivos, push, despliegue, CI.

Rollback: nunca automático. Si un despliegue falla, informa y propone; no reviertas sin
autorización.
