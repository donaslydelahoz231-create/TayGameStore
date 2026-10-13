# Hallazgos de seguridad y operación

Ciclo del 2026-10-13, actualizado a las 18:45 UTC (autorización total del dueño). Cada hallazgo tiene evidencia
redactada, sin secretos ni datos personales.
Estados: CONFIRMADO, POR VALIDAR, MITIGACIÓN LISTA (falta el dueño), CORREGIDO, RIESGO ACEPTADO,
INFORMATIVO.
Plan de acción: [`BACKLOG.md`](BACKLOG.md).

| ID | Severidad | Confianza | Componente | Estado |
|---|---|---|---|---|
| H-01 | Media | Alta | Base de datos (rol de la app) | MITIGACIÓN LISTA (rol de grupo en producción; falta `tgs_app` con la clave del dueño) |
| H-02 | Media | Alta | Respaldos de Neon | CORREGIDO (instantánea del 13-oct) |
| H-03 | Media | Alta | Testigo de integridad externo (`CRON_SECRET`) | CONFIRMADO (pendiente del dueño) |
| H-04 | Baja | Alta (código) / Baja (unidades de `ts`) | Webhook de Mercado Pago | POR VALIDAR (registro listo) |
| H-05 | Baja | Alta | CI: acciones sin fijar por SHA | CONFIRMADO |
| H-06 | Baja | Alta | Prueba e2e del panel (carrera) | CORREGIDO (CI verde con `8754120`) |
| H-07 | Baja | Alta | PR de Dependabot | EN PARTE (#13 y #14 fusionados; #15 retenido) |
| H-08 | Informativo | Alta | Alcance de la auditoría | INFORMATIVO |
| H-09 | Baja | Alta | Repositorio público | RIESGO ACEPTADO (decisión del dueño) |
| H-10 | Informativo | Alta | Ramas de Git superadas | EN PARTE (PR #12 cerrado; faltan 7 ramas) |

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
- **Avance (13-oct, 15:20 UTC):**
  - Rol de grupo `tgs_app_rw` en `src/server/db/privileges.ts`:
    - `SELECT/INSERT/UPDATE` en las tablas;
    - solo agregar en el historial;
    - `DELETE` solo en sesiones, estados OAuth, retos, códigos MFA, búsquedas y bloqueos.
  - `MIGRATION_DATABASE_URL` opcional para migrar con el dueño.
  - Probado:
    - 210 de 210 pruebas de integración con la app como rol mínimo (también en la CI desde
      ahora);
    - en una rama de Neon (PG18), `DISABLE TRIGGER` falla con «must be owner» y `UPDATE` del
      historial con «permission denied».
  - En producción el rol no existe: el código es inerte hasta que el dueño siga
    [`docs/base-datos-rol-minimo.md`](../base-datos-rol-minimo.md).
  - **Riesgo residual:** la URL del dueño seguiría en las variables de Render (fase 2 en esa guía).
- **Avance (13-oct, 18:40 UTC, con autorización del dueño):**
  - Se creó en producción el rol de grupo `tgs_app_rw` (`NOLOGIN`, sin clave). El despliegue
    `dep-db77h0u7bikc73aclv90` migró y aplicó los permisos.
  - Comprobado con `has_table_privilege` y `has_schema_privilege` en producción:

    | Permiso | Resultado |
    |---|---|
    | Leer y actualizar pedidos | Sí |
    | Borrar pedidos o vaciar pagos | No |
    | Agregar al historial | Sí |
    | Editar el historial | No |
    | Borrar sesiones | Sí |
    | Crear tablas | No |
  - **Falta:** el rol con acceso `tgs_app` y el cambio de `DATABASE_URL`. Llevan una clave, así que
    los hace el dueño; nunca pasa por un chat (pasos 2 y 3 de la guía).

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
- **Avance (13-oct, 15:02 UTC):**
  - `create_snapshot` responde **HTTP 422 «snapshots limit exceeded»**: el plan gratuito
    (`free_v3`) guarda **una sola instantánea**, y ya la ocupa la del 7-oct. Un calendario
    tampoco cabe sin borrar esa.
  - Se creó un respaldo como **rama de Neon** `respaldo-2026-10-13`
    (`br-quiet-rain-b533qmjv`, copia de producción a las 15:01 UTC). No borra nada y no cambia
    producción.
  - **Restauración verificada en la rama:** mismos conteos que producción (1 pedido, 2 ítems,
    1 intento de pago, 6 productos, 9 usuarios, 24 eventos, 2 sellos). También 26 triggers
    activos, 16 migraciones, cadena de sellos enlazada y contigua, y huellas md5 iguales de
    precios y sellos.
  - **Pendiente:**
    - Renovar la instantánea: borrar la del 7-oct y crear una nueva. Requiere autorización
      porque es un borrado.
    - Probar `restore_snapshot` de esa instantánea. No se hizo: con `finalize` por defecto
      movería la tienda a la copia vieja. Si se prueba, va con `finalize: false`.
- **Avance (13-oct, 18:37 UTC, con autorización del dueño):**
  - Se borró `respaldo-2026-10-07` y se creó la instantánea `respaldo-2026-10-13`
    (`snap-empty-dew-b5cu82in`) de producción.
  - La rama `respaldo-2026-10-13` sigue como segunda copia.

## H-03 · Sin testigo externo de integridad ni respaldo de tareas desde GitHub

- **Evidencia:**
  - «Tareas programadas» sale `skipped` en cada ejecución.
  - El paso de integridad de «Diagnóstico diario» depende de `CRON_SECRET`, que no existe en
    GitHub. En Render sí existe (registro «avisos y automatización», `cronExterno: true`, 13-oct).
- **Impacto:** la cadena de sellos solo la verifica el propio servidor. Un atacante con acceso
  total a la base podría alterarla sin que nadie de afuera lo note a tiempo.
- **Recomendación:** el dueño crea `CRON_SECRET` con el mismo valor en Render y en GitHub
  (`docs/seguridad-tienda.md`). No se pega en ningún chat.
- **Evidencia (13-oct):** en «Diagnóstico diario» (ejecución 38391086854), el paso «Testigo de
  integridad» terminó en 0 s. Eso coincide con la rama que imprime «NO VERIFICADO: falta el secreto
  CRON_SECRET en GitHub». No se leyó esa línea del registro: **inferido**.
- **13-oct, 18:45 UTC:** sigue pendiente del dueño aun con su autorización total, por dos motivos:
  - el valor tiene que estar igual en Render y en los secretos de GitHub, y esta sesión no puede
    escribir secretos de GitHub;
  - crearlo aquí lo dejaría escrito en la conversación.

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
- **Avance (13-oct):**
  - Cada aviso con firma válida deja en el log de Render `webhook signature age` con
    `tsAgeSeconds` y `tsUnit`. `tsUnit` es la unidad detectada: 13 cifras o más = milisegundos.
  - No rechaza nada. Pruebas en `tests/unit/webhook-age.test.ts`.
  - Tras el despliegue y los primeros pagos reales, revisar esos valores y decidir la tolerancia.

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
| #14 | 6 dependencias de producción (parches y menores) | Verde salvo la prueba de H-06 | Fusionar (con autorización), tras traer la principal con la corrección de H-06 (`8754120`) |
| #15 | Dependencias de desarrollo, incluye Playwright 1.56 → 1.64 | WebKit falla siempre en «foco visible con teclado» | Retener: adaptar la prueba al WebKit nuevo (solo verificable en la CI) |
| #16 | TypeScript 6 → 7 (mayor) | `npm ci` falla: `typescript-eslint` exige `<6.1.0` | Cerrar e ignorar TypeScript mayor en `dependabot.yml` |
| #12 | Corrección manual de `curl --proto` (10-oct) | — | Su cambio ya está en la rama: cerrar como superado |

**13-oct, 18:45 UTC (autorización del dueño):**
- **#13 y #14:** fusionados en la rama. Antes de subirlos, en local:
  - formato, lint y tipos en verde;
  - 259 pruebas unitarias;
  - 214 de integración con el rol mínimo;
  - build y `npm audit` con 0 vulnerabilidades;
  - 67 de 67 e2e y visuales en escritorio.
- **#12:** cerrado como superado.
- **#15:** sigue retenido: su CI falla en WebKit.
- **#16:** ya no figura entre los PR abiertos.

## H-09 · El repositorio es público

- **Evidencia:** `list_repos` devuelve `TayGameStore` con visibilidad pública (13-oct).
- **Impacto:**
  - Cualquiera puede leer el código y `docs/seguridad/`, incluidos los pendientes como H-01 y
    H-03.
  - No hay secretos: gitleaks en la CI y el escáner del repositorio dan 0.
  - Los datos del dueño están protegidos por la guardia.
- **Por qué no se cambia solo:**
  - En un repositorio privado del plan gratuito, GitHub Actions deja de ser ilimitado.
  - Solo «Mantener la tienda activa» (cada 10 min) ya suma unas 4.300 ejecuciones al mes.
  - Además, cambiar la visibilidad es una decisión del dueño.
- **Recomendación:**
  - Mantenerlo público y no publicar detalles que faciliten un ataque (pasos de explotación,
    rutas internas, nombres de cuentas).
  - Si el dueño prefiere privado, primero medir los minutos de Actions.
- **13-oct, 18:45 UTC:** se mantiene público, como recomienda este hallazgo.
  - La autorización total del dueño no dice en qué sentido cambiarlo.
  - Pasarlo a privado tendría estos efectos en el plan gratuito:
    - limita los minutos de Actions;
    - CodeQL deja de correr;
    - GitHub Pages se apaga.
  - Esta sesión tampoco tiene una herramienta para cambiar la visibilidad.

## H-10 · Ramas de Git superadas sin borrar

- **Evidencia:** `git cherry`, comparación de archivos y escaneo de secretos de cada rama contra
  la principal (13-oct).
- **Sin fusionar, pero ya superadas:** la principal tiene versiones más nuevas de los mismos
  archivos.
  - `ops/recover-actions-monitoring-20261009` (13 commits): `tareas.yml` es idéntico; el resto
    (vigilancia, `render.yaml`, `app.ts`, documentos) es más viejo que la principal.
  - `ops/production-smoke-check-20261009` (1 commit): su cambio ya está en la principal (`git
    cherry` = equivalente).
  - `fix/vigilancia-curl-https-20261010` (PR #12): usa `--proto '=https:'`; la principal ya tiene
    la forma correcta `'=https'`.
- **Ya fusionadas:**
  - `fix/vigilancia-curl-proto-20261010`
  - `ops/redirect-github-pages-20261009`
  - `security/receipt-proof-hmac-20261011`
  - `security/refresh-blocklist-cache-20261012`
- **Sin secretos** en los diffs de las 3 ramas sin fusionar.
- **Recomendación:** borrar las 7 ramas y cerrar el PR #12. Requiere autorización (borrado).
- **Avance (13-oct, 18:45 UTC, con autorización del dueño):**
  - PR #12 cerrado con un comentario.
  - Revisión de nuevo antes de borrar: las 7 ramas siguen como arriba (4 fusionadas y 3
    superadas).
  - El borrado (`git push --delete`) lo rechaza el proxy de esta sesión con HTTP 403: solo deja
    escribir en la rama de trabajo. Lo hace el dueño en GitHub → Branches.
  - **Rama nueva, sin revisar:** `fix/smoke-deployed-revision-20261013`, 3 commits del 13-oct que
    no están en la principal. No se toca.

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
