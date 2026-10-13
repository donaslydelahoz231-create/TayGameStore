# Backlog de seguridad y operación

Actualizado el 2026-10-13 a las 18:45 UTC (autorización total del dueño). Prioridad: 1 = la más alta. Estados: PENDIENTE, EN_PROGRESO, BLOQUEADA,
REQUIERE_APROBACIÓN, COMPLETADA, VERIFICADA, POSPUESTA. Hallazgos: [`HALLAZGOS.md`](HALLAZGOS.md).

| ID | Tarea | Prio. | Riesgo | Estado | Necesita | Criterio de aceptación / verificación |
|---|---|---|---|---|---|---|
| B-01 | Rol de base de datos sin propiedad para la app (H-01) | 2 | Integridad | BLOQUEADA | Dueño: crear `tgs_app` con su clave y cambiar `DATABASE_URL` (pasos 2 y 3 de `docs/base-datos-rol-minimo.md`). El rol de grupo y sus permisos ya están en producción (C-12) | Hecho en prueba: rama de Neon con `DISABLE TRIGGER` rechazado y 210 de 210 de integración con el rol mínimo. Falta en producción: `pg_stat_activity` muestra `tgs_app` y la prueba de producción en verde |
| B-03 | `CRON_SECRET` en Render y GitHub (H-03) | 3 | Integridad | BLOQUEADA | Dueño: crear el secreto con el mismo valor en Render y en GitHub (nunca por chat; esta sesión no escribe secretos de GitHub) | «Diagnóstico diario» muestra «cadena íntegra» |
| B-07 | PR #15: adaptar la prueba de foco a Playwright 1.64 / WebKit | 6 | Calidad | PENDIENTE | Iterar en la CI (WebKit no está en este entorno) | WebKit verde en el PR |
| B-08 | Cerrar PR #16 (TypeScript 7) e ignorar la versión mayor en `dependabot.yml` | 6 | Cadena de suministro | REQUIERE_APROBACIÓN | Dueño: autorizar cerrar el PR | No se reabre al lunes siguiente |
| B-10 | Webhook: activar la tolerancia de `ts` con datos reales (H-04) | 7 | Repetición de avisos | EN_PROGRESO | Desplegar el registro (C-10) y esperar pagos reales | `webhook signature age` en los logs de Render con valores reales; luego prueba de un aviso viejo rechazado |
| B-11 | Fijar acciones de GitHub por SHA (H-05) | 8 | Cadena de suministro | PENDIENTE | Despliegue autorizado | Todos los `uses:` con SHA y comentario de versión |
| B-12 | Verificación en dos pasos en Google, GitHub, Render, Neon y Mercado Pago | 2 | Robo de cuentas | BLOQUEADA | Dueño | El dueño lo confirma (no verificable desde aquí) |
| B-13 | Rotar el secreto de Google y borrar la clave de API expuesta | 2 | Credencial expuesta | BLOQUEADA | Dueño | Login con Google sigue funcionando tras rotar |
| B-14 | Proveedor de diamantes con reventa permitida | 3 | Negocio | BLOQUEADA | Dueño: autorizar pedir cotizaciones (`docs/proveedor-recargas/PROVEEDORES.md`) | Cotización por escrito con margen ≥ 5 % en `npm run finanzas:margenes` |
| B-15 | «Próximamente» en lugar de «Agotado» | 9 | Imagen | REQUIERE_APROBACIÓN | Dueño | e2e verde; ningún cobro posible sin entrega |
| B-16 | Listar alertas abiertas de CodeQL | 8 | Desconocido | BLOQUEADA | Herramienta de code scanning o el dueño en GitHub → Security | Lista revisada |
| B-17 | Borrar las 7 ramas de Git superadas (H-10) | 9 | Orden | BLOQUEADA | Dueño en GitHub → Branches: el proxy de la sesión rechaza el borrado (403) | Sin las 7 ramas de H-10 en `git ls-remote` |
| B-18 | Fase 2 del rol mínimo: migrar desde GitHub Actions y dejar en Render solo la URL de `tgs_app` | 6 | Integridad | POSPUESTA | B-01 en producción | Render sin la URL del dueño; migraciones verdes desde Actions |
| B-19 | Visibilidad del repositorio (H-09) | 9 | Exposición | POSPUESTA | Se mantiene público, como recomienda H-09. Si el dueño prefiere privado: hacerlo en GitHub → Settings, sabiendo que limita Actions y apaga CodeQL y Pages | Decisión registrada |

## Completadas en este ciclo

| ID | Tarea | Evidencia |
|---|---|---|
| C-01 | Línea base local | lint, tipos, formato, 238 unitarias, 208 de integración, build: todo verde |
| C-02 | Dependencias | `npm audit` 0 vulnerabilidades (producción y desarrollo) |
| C-03 | Datos del dueño y secretos | escáner del repositorio: 0 coincidencias |
| C-04 | Pagos y webhooks | Revisión de código y pruebas existentes (`HALLAZGOS.md`, controles verificados) |
| C-05 | Base de datos en producción | 26 triggers activos, 0 desactivados; 24 de 24 eventos sellados |
| C-06 | Tareas programadas | Inventario con última ejecución comprobada (`TAREAS-PROGRAMADAS.md`) |
| C-07 | Prueba del panel (H-06) | Subida en `8754120`: CI verde en los 3 navegadores y en vivo en Render |
| C-08 | Respaldo de Neon de hoy (H-02) | Rama `respaldo-2026-10-13`: conteos, triggers, migraciones y huellas iguales a producción |
| C-09 | Rol mínimo de la app (H-01), listo para adoptar | `privileges.ts`, `MIGRATION_DATABASE_URL`; CI con rol mínimo; 210/210 de integración; rama de Neon con `DISABLE TRIGGER` rechazado |
| C-10 | Registro de la antigüedad del `ts` del webhook (H-04) | 4 pruebas unitarias; no rechaza avisos |
| C-11 | Auditoría de todas las ramas y repositorios accesibles | 1 repositorio; 11 ramas revisadas, sin secretos (H-10) |
| C-12 | Rol de grupo `tgs_app_rw` en producción (parte de B-01) | Creado el 13-oct, justo antes del despliegue de las 18:29 UTC; ese despliegue `dep-db77h0u7bikc73aclv90` aplicó los permisos; `has_table_privilege` igual al diseño (H-01) |
| C-13 | Instantánea de Neon renovada (B-02) | `respaldo-2026-10-13` (`snap-empty-dew-b5cu82in`); la del 7-oct se borró |
| C-14 | Comisión real de Mercado Pago en Render (B-20) | `PAYMENT_FEE_PCT=3.29`, `PAYMENT_FEE_FIXED_COP=800`, `PAYMENT_FEE_TAX_PCT=19`; despliegue `dep-db77h0u7bikc73aclv90` activo. Tarifa tomada de la página pública de Mercado Pago: **NO VERIFICADA** en el panel del dueño |
| C-15 | PR #13 y #14 fusionados (B-05, B-06) | Validación local completa antes de subir (H-07); CI del commit fusionado |
| C-16 | PR #12 cerrado; rama de Neon `prueba-rol-minimo-2026-10-13` borrada (parte de B-09 y B-17) | PR cerrado con comentario; la rama ya no aparece en `list_branches` |
