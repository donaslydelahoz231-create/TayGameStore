# Backlog de seguridad y operación

Actualizado el 2026-10-13. Prioridad: 1 = la más alta. Estados: PENDIENTE, EN_PROGRESO, BLOQUEADA,
REQUIERE_APROBACIÓN, COMPLETADA, VERIFICADA, POSPUESTA. Hallazgos: [`HALLAZGOS.md`](HALLAZGOS.md).

| ID | Tarea | Prio. | Riesgo | Estado | Necesita | Criterio de aceptación / verificación |
|---|---|---|---|---|---|---|
| B-01 | Rol de base de datos sin propiedad para la app (H-01) | 2 | Integridad | REQUIERE_APROBACIÓN | Dueño: crear rol y cambiar `DATABASE_URL` en Render | Probado en rama de Neon: la app funciona y `DISABLE TRIGGER` falla con el rol nuevo; suites verdes |
| B-02 | Instantánea nueva de Neon y prueba de restauración (H-02) | 2 | Pérdida de datos | REQUIERE_APROBACIÓN | Dueño: autorizar crear la instantánea | Instantánea con fecha de hoy; restauración en rama con conteos iguales |
| B-03 | `CRON_SECRET` en Render y GitHub (H-03) | 3 | Integridad | BLOQUEADA | Dueño: crear el secreto (nunca por chat) | «Diagnóstico diario» muestra «cadena íntegra» |
| B-04 | Subir la corrección de la prueba del panel (H-06) | 4 | Calidad | REQUIERE_APROBACIÓN | Dueño: autorizar push (despliega en Render) | CI verde en chromium, firefox y webkit |
| B-05 | Fusionar PR #13 (acciones) | 5 | Cadena de suministro | REQUIERE_APROBACIÓN | Dueño: autorizar merge (despliega) | CI verde en el commit fusionado |
| B-06 | Fusionar PR #14 (dependencias de producción) tras B-04 | 5 | Cadena de suministro | REQUIERE_APROBACIÓN | B-04 y autorización | CI verde; prueba de producción verde |
| B-07 | PR #15: adaptar la prueba de foco a Playwright 1.64 / WebKit | 6 | Calidad | PENDIENTE | Iterar en la CI (WebKit no está en este entorno) | WebKit verde en el PR |
| B-08 | Cerrar PR #16 (TypeScript 7) e ignorar la versión mayor en `dependabot.yml` | 6 | Cadena de suministro | REQUIERE_APROBACIÓN | Dueño: autorizar cerrar el PR | No se reabre al lunes siguiente |
| B-09 | Cerrar PR #12 (ya incluido en la rama) | 7 | — | REQUIERE_APROBACIÓN | Dueño | PR cerrado como superado |
| B-10 | Webhook: registrar la diferencia de `ts` y luego activar la tolerancia (H-04) | 7 | Repetición de avisos | PENDIENTE | Despliegue autorizado | Datos reales de la diferencia; luego prueba de un aviso viejo rechazado |
| B-11 | Fijar acciones de GitHub por SHA (H-05) | 8 | Cadena de suministro | PENDIENTE | Despliegue autorizado | Todos los `uses:` con SHA y comentario de versión |
| B-12 | Verificación en dos pasos en Google, GitHub, Render, Neon y Mercado Pago | 2 | Robo de cuentas | BLOQUEADA | Dueño | El dueño lo confirma (no verificable desde aquí) |
| B-13 | Rotar el secreto de Google y borrar la clave de API expuesta | 2 | Credencial expuesta | BLOQUEADA | Dueño | Login con Google sigue funcionando tras rotar |
| B-14 | Proveedor de diamantes con reventa permitida | 3 | Negocio | BLOQUEADA | Dueño (`docs/specs/contacto-proveedores.md`) | Contrato o condiciones por escrito |
| B-15 | «Próximamente» en lugar de «Agotado» | 9 | Imagen | REQUIERE_APROBACIÓN | Dueño | e2e verde; ningún cobro posible sin entrega |
| B-16 | Listar alertas abiertas de CodeQL | 8 | Desconocido | BLOQUEADA | Herramienta de code scanning o el dueño en GitHub → Security | Lista revisada |

## Completadas en este ciclo

| ID | Tarea | Evidencia |
|---|---|---|
| C-01 | Línea base local | lint, tipos, formato, 238 unitarias, 208 de integración, build: todo verde |
| C-02 | Dependencias | `npm audit` 0 vulnerabilidades (producción y desarrollo) |
| C-03 | Datos del dueño y secretos | escáner del repositorio: 0 coincidencias |
| C-04 | Pagos y webhooks | Revisión de código y pruebas existentes (`HALLAZGOS.md`, controles verificados) |
| C-05 | Base de datos en producción | 26 triggers activos, 0 desactivados; 24 de 24 eventos sellados |
| C-06 | Tareas programadas | Inventario con última ejecución comprobada (`TAREAS-PROGRAMADAS.md`) |
| C-07 | Prueba del panel (H-06) | Corregida y verificada en local; pendiente de B-04 |
