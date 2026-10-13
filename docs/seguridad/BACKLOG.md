# Backlog de seguridad y operación

Actualizado el 2026-10-13 a las 15:30 UTC (mandato OMNIA). Prioridad: 1 = la más alta. Estados: PENDIENTE, EN_PROGRESO, BLOQUEADA,
REQUIERE_APROBACIÓN, COMPLETADA, VERIFICADA, POSPUESTA. Hallazgos: [`HALLAZGOS.md`](HALLAZGOS.md).

| ID | Tarea | Prio. | Riesgo | Estado | Necesita | Criterio de aceptación / verificación |
|---|---|---|---|---|---|---|
| B-01 | Rol de base de datos sin propiedad para la app (H-01) | 2 | Integridad | REQUIERE_APROBACIÓN | Desplegar el código (C-09) y que el dueño siga `docs/base-datos-rol-minimo.md` | Hecho en prueba: rama de Neon con `DISABLE TRIGGER` rechazado y 210 de 210 de integración con el rol mínimo. Falta en producción: `pg_stat_activity` muestra `tgs_app` y la prueba de producción en verde |
| B-02 | Renovar la instantánea de Neon (H-02): el plan guarda 1; borrar la del 7-oct y crear una nueva | 3 | Pérdida de datos | REQUIERE_APROBACIÓN | Dueño: autorizar el borrado de `respaldo-2026-10-07` | Instantánea con fecha nueva en `list_snapshots`. El respaldo de hoy ya existe como rama (C-08) |
| B-03 | `CRON_SECRET` en Render y GitHub (H-03) | 3 | Integridad | BLOQUEADA | Dueño: crear el secreto (nunca por chat) | «Diagnóstico diario» muestra «cadena íntegra» |
| B-05 | Fusionar PR #13 (acciones) | 5 | Cadena de suministro | REQUIERE_APROBACIÓN | Dueño: autorizar merge (despliega) | CI verde en el commit fusionado |
| B-06 | Fusionar PR #14 (dependencias de producción) | 5 | Cadena de suministro | REQUIERE_APROBACIÓN | Autorización (H-06 ya corregida en `8754120`) | CI verde; prueba de producción verde |
| B-07 | PR #15: adaptar la prueba de foco a Playwright 1.64 / WebKit | 6 | Calidad | PENDIENTE | Iterar en la CI (WebKit no está en este entorno) | WebKit verde en el PR |
| B-08 | Cerrar PR #16 (TypeScript 7) e ignorar la versión mayor en `dependabot.yml` | 6 | Cadena de suministro | REQUIERE_APROBACIÓN | Dueño: autorizar cerrar el PR | No se reabre al lunes siguiente |
| B-09 | Cerrar PR #12 (ya incluido en la rama) | 7 | — | REQUIERE_APROBACIÓN | Dueño | PR cerrado como superado |
| B-10 | Webhook: activar la tolerancia de `ts` con datos reales (H-04) | 7 | Repetición de avisos | EN_PROGRESO | Desplegar el registro (C-10) y esperar pagos reales | `webhook signature age` en los logs de Render con valores reales; luego prueba de un aviso viejo rechazado |
| B-11 | Fijar acciones de GitHub por SHA (H-05) | 8 | Cadena de suministro | PENDIENTE | Despliegue autorizado | Todos los `uses:` con SHA y comentario de versión |
| B-12 | Verificación en dos pasos en Google, GitHub, Render, Neon y Mercado Pago | 2 | Robo de cuentas | BLOQUEADA | Dueño | El dueño lo confirma (no verificable desde aquí) |
| B-13 | Rotar el secreto de Google y borrar la clave de API expuesta | 2 | Credencial expuesta | BLOQUEADA | Dueño | Login con Google sigue funcionando tras rotar |
| B-14 | Proveedor de diamantes con reventa permitida | 3 | Negocio | BLOQUEADA | Dueño (`docs/specs/contacto-proveedores.md`) | Contrato o condiciones por escrito |
| B-15 | «Próximamente» en lugar de «Agotado» | 9 | Imagen | REQUIERE_APROBACIÓN | Dueño | e2e verde; ningún cobro posible sin entrega |
| B-16 | Listar alertas abiertas de CodeQL | 8 | Desconocido | BLOQUEADA | Herramienta de code scanning o el dueño en GitHub → Security | Lista revisada |
| B-17 | Borrar recursos temporales y ramas superadas (H-10) | 9 | Orden | REQUIERE_APROBACIÓN | Dueño: autorizar borrados | Sin la rama de Neon `prueba-rol-minimo-2026-10-13`; sin las 7 ramas de Git de H-10; PR #12 cerrado |
| B-18 | Fase 2 del rol mínimo: migrar desde GitHub Actions y dejar en Render solo la URL de `tgs_app` | 6 | Integridad | POSPUESTA | B-01 en producción | Render sin la URL del dueño; migraciones verdes desde Actions |
| B-19 | Visibilidad del repositorio (H-09) | 9 | Exposición | REQUIERE_APROBACIÓN | Decisión del dueño (costo de Actions si es privado) | Decisión registrada |

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
