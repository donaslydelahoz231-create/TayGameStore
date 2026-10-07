---
name: auditoria-segura
description: Auditoría de solo lectura de TayGameStore (Git, secretos y datos del propietario, pruebas, Render, CI/CodeQL, n8n) con informe de evidencia en 6 secciones. Usar al auditar, diagnosticar, verificar el estado de producción o antes de proponer cualquier cambio sensible.
---

# Auditoría segura (solo lectura)

Cumple `CLAUDE.md` y `docs/datos-del-propietario.md` (requisitos 1–19). Esta auditoría **no
modifica nada**: ni commits, ni push, ni Render, ni GitHub, ni n8n, ni rutinas.

## Reglas

- Nunca imprimas valores de secretos ni datos personales: solo conteos, nombres de archivo,
  existencia o estado. Si necesitas ver contexto, enmascara los dígitos (`sed -E 's/[0-9]/#/g'`).
- Lo que no puedas comprobar (conector desconectado, proxy que bloquea, API sin el dato) va a
  **NO VERIFICADO**, con el motivo.
- Cada afirmación lleva su evidencia: herramienta o comando y resultado.

## Pasos

1. **Git**: rama, `HEAD`, igual a GitHub (`git fetch` + `git rev-parse HEAD @{u}`), cambios locales,
   ramas remotas (`git ls-remote origin`).
2. **Secretos y documento del propietario**: `bash scripts/auditoria/escanear.sh` (árbol, `dist/`,
   ignorados e historial; sale con 1 si encuentra algo). El documento se busca por sus 4 últimos
   dígitos (`TGS_SUFIJO_DOC` o `.claude/guardia.local`); sin ellos esa fila es NO VERIFICADO.
   Recompila antes (`npm run build`) para escanear el `dist/` actual.
3. **Pruebas**: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`;
   integración con Postgres local (`service postgresql start` y `TEST_DATABASE_URL=...
   npm run test:integration`); e2e (`E2E_DATABASE_URL=... npx playwright test`). Reporta cifras
   reales.
4. **Render** (`srv-db2ifivlot8c7399m8eg`): `list_deploys` (despliegue activo y estado),
   `list_logs` nivel error/warn/fatal desde la última auditoría, `list_logs text=*XXXX*` con los
   4 dígitos del documento en sus formas `XXXX`, `X.XXX` y `X XXX` (debe salir vacío). El valor de
   las variables no es legible por API: NO VERIFICADO.
5. **CI y CodeQL**: `mcp__github__actions_list` del último commit; trabajos con
   `list_workflow_jobs`.
6. **n8n**: ejecuciones con error desde la última auditoría (solo lectura).
7. **Neon y Mercado Pago**: sin conector autorizado en la sesión → NO VERIFICADO.

## Informe

Seis secciones, en español:

1. VERIFICADO (tabla: afirmación | evidencia reproducible)
2. NO VERIFICADO (qué y por qué)
3. PROBLEMAS ENCONTRADOS
4. CAMBIOS REALIZADOS (en una auditoría: ninguno, salvo archivos temporales propios)
5. CAMBIOS QUE REQUIEREN AUTORIZACIÓN (propuesta, diff y riesgo; no se aplican)
6. PRUEBAS EJECUTADAS Y RESULTADOS

Añade una entrada a `docs/auditoria/registro.md` solo como parte de un cambio autorizado
(ese archivo se publica con el siguiente commit aprobado).
