# Hallazgos de seguridad y operación

Ciclo del 2026-10-13. Cada hallazgo tiene evidencia redactada, sin secretos ni datos personales.
Estados: CONFIRMADO, POR VALIDAR, CORREGIDO (local), RIESGO ACEPTADO, INFORMATIVO.
Plan de acción: [`BACKLOG.md`](BACKLOG.md).

| ID | Severidad | Confianza | Componente | Estado |
|---|---|---|---|---|
| H-01 | Media | Alta | Base de datos (rol de la app) | CONFIRMADO |
| H-02 | Media | Alta | Respaldos de Neon | CONFIRMADO |
| H-03 | Media | Alta | Testigo de integridad externo (`CRON_SECRET`) | CONFIRMADO (pendiente del dueño) |
| H-04 | Baja | Alta (código) / Baja (unidades de `ts`) | Webhook de Mercado Pago | POR VALIDAR |
| H-05 | Baja | Alta | CI: acciones sin fijar por SHA | CONFIRMADO |
| H-06 | Baja | Alta | Prueba e2e del panel (carrera) | CORREGIDO (local) |
| H-07 | Baja | Alta | PR de Dependabot | CONFIRMADO |
| H-08 | Informativo | Alta | Alcance de la auditoría | INFORMATIVO |

## H-01 · La aplicación se conecta a la base como dueña de las tablas

- **Evidencia:** `pg_stat_activity` en Neon muestra un único rol conectado, `neondb_owner`
  (`BYPASSRLS`), que es el dueño de las tablas.
- **Impacto:** los triggers que impiden borrar pedidos y pagos o alterar montos (migración 0015)
  protegen contra errores y contra cualquier ataque por la API. Pero quien obtenga la URL de la
  base o ejecute código en el servidor puede desactivarlos (`ALTER TABLE … DISABLE TRIGGER`)
  porque es dueño. La cadena de sellos lo detectaría, pero no lo impediría.
- **Recomendación:**
  1. Crear un rol `tgs_app` con solo `SELECT/INSERT/UPDATE` sobre las tablas y sin propiedad.
  2. Dejar `neondb_owner` solo para las migraciones, con una variable aparte.
  3. Probarlo antes en una rama de Neon.
- **Requiere autorización:** crear el rol y cambiar `DATABASE_URL` en Render (es un secreto).
- **Verificación:** con el rol nuevo, `ALTER TABLE orders DISABLE TRIGGER ALL` debe fallar y las
  suites de integración deben pasar.

## H-02 · Respaldos: una sola instantánea manual, del 7 de octubre

- **Evidencia:** `list_snapshots` devuelve solo `respaldo-2026-10-07` (manual).
  `get_snapshot_schedule` está vacío. La historia de PITR del plan es de 6 h
  (`history_retention_seconds` = 21600).
- **Impacto:** la instantánea es anterior a las migraciones 0014 y 0015 y a la activación de
  ventas. Ante una pérdida de datos más vieja que 6 h, se volvería a un esquema y datos de hace
  días.
- **Recomendación:**
  1. Tomar una instantánea manual nueva ahora.
  2. Configurar un calendario de instantáneas si el plan lo permite. **NO VERIFICADO** si el plan
     gratuito acepta calendario o cuántas instantáneas guarda.
  3. Probar una restauración en una rama (`docs/incident-response.md`).
- **Requiere autorización:** crear recursos en Neon (instantánea o calendario).

## H-03 · Sin testigo externo de integridad ni respaldo de tareas desde GitHub

- **Evidencia:**
  - «Tareas programadas» sale `skipped` en cada ejecución.
  - El paso de integridad de «Diagnóstico diario» depende de `CRON_SECRET`, que no existe en
    GitHub. **NO VERIFICADO** en Render.
- **Impacto:** la cadena de sellos solo la verifica el propio servidor. Un atacante con acceso
  total a la base podría alterarla sin que nadie de afuera lo note a tiempo.
- **Recomendación:** el dueño crea `CRON_SECRET` con el mismo valor en Render y en GitHub
  (`docs/seguridad-tienda.md`). No se pega en ningún chat.

## H-04 · El webhook acepta firmas válidas sin límite de antigüedad

- **Evidencia:** en `src/server/integrations/payments/mercadopago.ts`, `verifyWebhook` llama a
  `WebhookSignatureValidator.validate` sin `toleranceSeconds`. En el SDK 3.6.1, sin ese valor no
  se revisa el `ts`.
- **Impacto bajo:** un aviso firmado capturado podría reenviarse, pero el servidor siempre
  consulta el pago en la API de Mercado Pago y procesa de forma idempotente. Hay pruebas: webhook
  duplicado, monto distinto, `live_mode` y segundo pago.
- **Por validar:** si el `ts` real de Mercado Pago viene en segundos, como asume el SDK. El ejemplo
  de la documentación oficial (`ts=1704908010`, 10 dígitos) apunta a segundos; es una inferencia,
  no una regla escrita. Activar la tolerancia con la unidad equivocada rechazaría todos los avisos;
  la conciliación periódica igual confirmaría los pagos, pero con demora.
- **Recomendación:** primero registrar la diferencia de tiempo sin rechazar nada, y con datos
  reales activar `toleranceSeconds`.

## H-05 · Acciones de GitHub fijadas por versión mayor, no por SHA

- **Evidencia:** `uses: actions/checkout@v4`, `actions/setup-node@v4`, `github/codeql-action/*@v4`.
- **Impacto:** si se compromete la etiqueta de una acción, la CI ejecutaría código ajeno. Los
  permisos ya son mínimos (`contents: read` en casi todos los flujos; `permissions: {}` en
  «Mantener la tienda activa»).
- **Recomendación:** fijar por SHA (Dependabot de `github-actions` ya está activo, PR #13) y
  revisar las advertencias de Node 20 en las acciones v4.

## H-06 · Prueba e2e del panel: carrera al leer el aviso del pago (corregida en local)

- **Evidencia:** CI del PR #14 (13-oct): `expect(notices).toContain('Pedido pagado por entregar')`
  recibió `[]`.
- **Causa raíz:** pedidos pagados de pruebas anteriores ya ponían «(N) Pagados por entregar» en
  el título. La espera del título pasaba al instante y los avisos se leían antes de que llegara
  la respuesta del botón «Actualizar».
- **Corrección:** `expect.poll` sobre los avisos y después el título (`e2e/behavior.spec.ts`).
  Solo cambia la prueba; el panel no cambia.

## H-07 · PR de Dependabot abiertos

| PR | Contenido | CI | Recomendación |
|---|---|---|---|
| #13 | 3 acciones de GitHub | Verde | Fusionar (con autorización) |
| #14 | 6 dependencias de producción (parches y menores) | Verde salvo la prueba de H-06 | Fusionar tras subir la corrección de H-06 |
| #15 | Dependencias de desarrollo, incluye Playwright 1.56 → 1.64 | WebKit falla siempre en «foco visible con teclado» | Retener: adaptar la prueba al WebKit nuevo (solo verificable en la CI) |
| #16 | TypeScript 6 → 7 (mayor) | `npm ci` falla: `typescript-eslint` exige `<6.1.0` | Cerrar e ignorar TypeScript mayor en `dependabot.yml` |
| #12 | Corrección manual de `curl --proto` (10-oct) | — | Su cambio ya está en la rama: cerrar como superado |

## H-08 · Límites de esta auditoría

- **Producción no se abre desde este entorno** (el proxy bloquea `onrender.com`). Las cabeceras
  CSP y HSTS de producción las verifica a diario `golive:check` en «Diagnóstico diario» (éxito el
  13-oct a las 11:33 UTC).
- **No hubo pruebas invasivas en producción**, ni compras reales, ni cambios de variables.
- **No se pudieron listar las alertas abiertas de CodeQL** (falta herramienta); el análisis
  termina en verde.
- **n8n** no conecta (error 404 del conector) y quedó reemplazado el 11-oct; no se auditó en vivo.

## Controles verificados (sin hallazgos)

- Precios y totales calculados en el servidor; el cliente no puede cambiarlos (e2e
  `tampering.spec.ts` e integración `commerce.test.ts`).
- Pago confirmado solo con la API de Mercado Pago:
  - firma HMAC del webhook con comparación en tiempo constante (SDK oficial);
  - monto y moneda iguales al pedido;
  - `live_mode` coherente;
  - idempotencia, segundo pago → `NEEDS_REFUND` y reembolso → `REFUNDED`.
- Panel solo del dueño: lista blanca, MFA, ruta oculta, 404 para no administradores y rutas
  aprobadas fijas (`owner-only.test.ts`).
- CSRF, límites por IP, escudo anti-abuso y bloqueo por enumeración de pedidos ajenos
  (`security.test.ts`).
- Base de datos: 26 triggers activos y 0 desactivados; 24 de 24 eventos sellados.
- Dependencias: `npm audit` sin vulnerabilidades (producción y desarrollo); gitleaks en verde en la
  CI.
- Agentes de IA: `.claude/settings.json` exige confirmación para push, Render, rutinas y GitHub, y
  prohíbe push forzado y reescritura de historial. La guardia `guardia-datos.sh` bloquea secretos
  y el documento del dueño.
