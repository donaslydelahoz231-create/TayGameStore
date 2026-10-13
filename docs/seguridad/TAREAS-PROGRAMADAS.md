# Tareas programadas: inventario y última ejecución comprobada

Comprobado el 2026-10-13 con la API de GitHub Actions, las rutinas de Claude y la base de Neon.
Una tarea cuenta como «funcionando» solo con una ejecución reciente comprobada, no por existir
su archivo.

## GitHub Actions (UTC; Colombia = UTC−5)

| Flujo | Frecuencia | Permisos | Qué hace | Última ejecución comprobada |
|---|---|---|---|---|
| CI | Cada push y PR | `contents: read` | lint, tipos, unitarias, integración, e2e (3 navegadores), build, gitleaks | 13-oct, verde (`8aeca5b` y `ad9ab59`) |
| CodeQL Advanced | Push, PR y lunes 05:20 | `security-events: write`, resto lectura | Análisis estático JS/TS y acciones | 12-oct 05:35, verde |
| Diagnóstico diario | Diario 11:17 | `contents: read` | `golive:check` contra producción (CSP, HSTS, catálogo, pagos) y navegador real | 13-oct 11:33, verde |
| Vigilancia y autorreparación | Cada 30 min | `contents: read`, `issues: write` | `/api/ready` o `/api/health`; si cae, abre incidente y reinicia con el deploy hook | 13-oct 14:15, verde |
| Mantener la tienda activa | Cada 10 min | `{}` (ninguno) | `/api/health` sin base de datos, para que Render no se duerma | 13-oct 14:34, verde |
| Mantenimiento automático | Lunes 12:17 | `contents: write`, `pull-requests: write` | Mantenimiento con PR | 12-oct 12:54, verde |
| Production smoke check | Cada push | `contents: read` | Web, liveness y readiness con base de datos | 13-oct, verde |
| Tareas programadas | Cada 10 min | `contents: read` | Respaldo de `/api/internal/jobs` | **Omitida por diseño**: requiere `ENABLE_SCHEDULED_TASKS` y `CRON_SECRET` (H-03) |
| Comprobar UniPin | Solo manual | `contents: read` | Comprobación de credenciales | Sin uso (UniPin descartado) |

## Tareas internas del servidor (Render)

Programador con lock de PostgreSQL, sin solapamiento. En reposo corre en una tanda cada 30 min
(`JOBS_IDLE_MINUTES`) para no gastar la cuota de Neon.

| Tarea | Ritmo normal | Evidencia de funcionamiento |
|---|---|---|
| `expireOrders`, `reconcilePayments`, `retryEvents`, `releaseClaims`, `sendNotifications`, `topups` | 1–2 min | Sin errores `job failed` en los logs de Render desde el 12-oct |
| `cleanup` | 1 h | Ídem |
| `sealAudit` | 10 min | `audit_seals` cubre 24 de 24 eventos (13-oct) |

## Rutinas de Claude

| Rutina | Frecuencia (Bogotá) | Alcance | Última ejecución |
|---|---|---|---|
| Mantenimiento automático diario | 07:52, 11:52, 15:52 y 19:52 | Revisa CI, flujos, Render, Neon; corrige dentro de los límites | 13-oct 12:53 UTC, exitosa |
| Mantenimiento semanal | Lunes 08:55 | npm audit, outdated, PR de Dependabot (solo recomienda) | 12-oct 13:57 UTC, exitosa |

## Calendario recomendado (sin tareas nuevas)

El calendario del prompt maestro ya está cubierto sin crear ejecuciones redundantes:

- **En cada cambio:** CI completa + CodeQL + prueba de producción.
- **Diario:** diagnóstico, vigilancia y rutina de Claude (CI, despliegues, logs, Neon, incidentes).
- **Semanal:** CodeQL programado, Dependabot (npm y acciones) y rutina semanal.
- **Mensual (manual, con el dueño):** revisar accesos y verificación en dos pasos, permisos de
  GitHub y Render, retención de datos, y probar una restauración de Neon (B-02).

## Cómo desactivar cada tarea

- **GitHub Actions:** Actions → el flujo → «Disable workflow».
- **Rutinas de Claude:** claude.ai → Routines, o pedírselo a Claude (`update_trigger enabled=false`).
- **Tareas internas:** `JOBS_ENABLED=false` en Render. Es un cambio en producción: requiere
  autorización.
