# Auditoría total A–P · 2026-10-25

Pedido del dueño: «PROMPT MAESTRO DEFINITIVO» (fases A–J, informe A–P), con sus reglas: cambios
aislados, nada en producción sin autorización explícita, sin compras ni entregas reales, sin
pruebas destructivas ni fuerza bruta contra producción, sin secretos ni datos personales en el
informe, y lo que no se pudo comprobar marcado como **NO VERIFICADO**. Este informe no promete
seguridad absoluta: describe lo revisado, lo corregido y lo que queda abierto.

Estado del código revisado: `aba648b` (en producción desde el 2026-10-21) más los cambios locales
de este informe (sin publicar al escribirlo).

## A. Resumen ejecutivo

- La base de pagos y pedidos está sólida: el precio se calcula en el servidor, Mercado Pago solo
  cuenta si coinciden importe, moneda (COP) y modo (producción o prueba), el aviso de Mercado Pago
  se firma y se consulta de nuevo a la API, Nequi solo lo confirma el dueño con doble factor y una
  referencia de Nequi confirma un solo pedido.
- **Corregido (local, con pruebas):** A-01 código de la app autenticadora reutilizable dentro de
  su ventana; A-02 IP de los clientes en claro en los registros de Render, contra lo que promete
  la política de privacidad; A-10 dos avisos moderados en dependencias de producción y uno en
  desarrollo. A-03 (textos del acceso) se deshizo a pedido del dueño: el acceso queda como estaba.
- **Abierto y en manos del dueño:** A-04 respaldos de Neon sin programación (último manual del
  2026-10-13); A-05 ruta de salud vacía en Render; hoja de Google y correo sin credenciales.
- **URGENTE para el dueño:** el pedido `TGS-TKRX3MBM03` (11.000 COP) tiene un aviso de
  transferencia Nequi del 2026-10-20 sin revisar; el pedido venció el 2026-10-21. Revisar el
  movimiento en la app Nequi y, en el panel, confirmarlo (queda en revisión por tardío) o
  rechazarlo.

## B. Arquitectura

- Un servicio web Node 24 + Fastify 5 + TypeScript (Render, plan gratuito, Virginia, una
  instancia), PostgreSQL 18 en Neon (plan gratuito), frontend estático servido por el mismo
  proceso (Vite, sin scripts de terceros).
- Integraciones: Mercado Pago Checkout Pro (SDK oficial), Nequi por transferencia confirmada por
  el dueño, Google OIDC (+ Facebook, hoy apagado), Google Sheets (cuenta de servicio, hoy sin
  llave), SMTP (hoy sin configurar), UniPin (apagado).
- Tareas internas en el proceso (con bloqueo en PostgreSQL) y respaldo opcional por GitHub
  Actions (`tareas.yml`, desactivado a propósito). Vigilancia: «Diagnóstico diario», «Vigilancia y
  autorreparación», «Mantener la tienda activa» y la ronda diaria de mantenimiento.
- La base protege lo crítico con CHECK, índices únicos, disparadores de inmutabilidad y un rol de
  aplicación sin DELETE (salvo tablas listadas).

## C. Superficie de ataque

| Zona | Rutas | Control principal |
| --- | --- | --- |
| Público | `/api/config`, `/api/catalog`, `/api/reviews`, `/api/receipts/verify`, `/api/health`, `/api/ready` | Solo datos públicos; límites por IP; sin secretos |
| Cliente | `/api/profile`, `/api/player/lookup`, `/api/checkout`, `/api/orders/*` (pago, Nequi, reseña, PIN) | Dueño de la orden (cuenta, invitado o token con HMAC); CSRF; límites por IP |
| Acceso | `/auth/google`, `/auth/facebook`, callbacks, contraseña y llave del dueño | state + nonce + PKCE; contraseña scrypt; bloqueo por cuenta |
| Panel | 28 rutas `/api/admin/*` + MFA | Rol admin + correo en la lista + doble factor; 404 para el resto |
| Proveedores | `/api/webhooks/mercadopago` | Firma `x-signature`; el pago se consulta a la API |
| Interno | `/api/internal/jobs`, `/api/internal/integrity` | `CRON_SECRET` (comparación en tiempo constante); 404 sin él |

Se comprobó con un script que todas las rutas del panel pasan por `requireAdmin`.

## D. Hallazgos

| ID | Severidad | Evidencia | Impacto | Archivo | Estado | Solución |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Media | Prueba de integración: el código usado para activar la app volvía a abrir el panel (200) dentro del mismo paso de 30 s | Quien vea o intercepte un código (pantalla, reenvío) entra hasta ~90 s después, si además tiene la contraseña | `src/server/services/auth.ts` | Corregido (local) | Último paso aceptado en `users.mfa_totp_last_step` (migración 0024, solo agrega); actualización atómica que rechaza ese paso y los anteriores (RFC 6238 §5.2) |
| A-02 | Baja | Prueba unitaria: el registro de cada petición guardaba la IP en claro | Contradice la política de privacidad («la IP se guarda solo como huella»); dato personal en los registros de Render | `src/server/plugins/logging.ts` | Corregido (local) | Se registra la huella con clave (`ipHash`), la misma de la auditoría y del escudo |
| A-03 | Baja | Capturas: etiquetas en inglés técnico en la tienda; en el acceso, «OAuth 2.0», «ACCOUNT / TGS» y «No configurado» (en producción Facebook está apagado) | Confusión del cliente | `src/web/index.html` | Tienda: corregido (local). Acceso: sin cambios por decisión del dueño («los logins no me lo toques») | Etiquetas de la tienda en español claro; la ventana de acceso es idéntica a la de `aba648b` (captura 02 sin cambios) |
| A-04 | Media | Neon: un snapshot manual (2026-10-13), sin programación; retención del historial de 6 h | Ante un borrado o una corrupción detectada tarde se perderían hasta 12 días de pedidos | Neon (proyecto de producción) | Abierto | Snapshot antes de publicar la migración 0024 y programación diaria (necesita autorización: es un cambio en un servicio externo) |
| A-05 | Baja | Render: `healthCheckPath` vacío; `render.yaml` dice `/api/ready` | Un proceso colgado no se reinicia solo | Render | Abierto (dueño) | Poner `/api/health` (no consulta la base y no impide que Neon se suspenda) |
| A-06 | Baja | `/api/ready` y cualquier ruta pública que lea la base pueden mantener despierto Neon | Gasto de horas de cómputo del plan gratuito; proyección actual ~65 de 100 CU-h al mes | `src/server/modules/health/routes.ts` | Aceptado, en vigilancia | La ronda diaria mide el consumo; actuar si pasa de 80 CU-h |
| A-07 | Baja | Revisión: el bloqueo por intentos (contraseña y MFA) cuenta y registra en pasos separados | Peticiones simultáneas podrían probar algunos intentos más antes del bloqueo | `services/admin-password.ts`, `services/auth.ts` | Residual | Mitigado por límite por IP, contraseña de 12+ caracteres, segundo factor y escudo; endurecer si aparece en la auditoría |
| A-08 | Baja | Revisión: 20 perfiles de invitado nuevos por IP al día | Con muchas IP se puede inflar la pestaña «Usuarios» y gastar cuota de Sheets (los pedidos se sincronizan primero) | `services/profiles.ts` | Residual | Vigilar el conteo de perfiles en la ronda |
| A-09 | Informativo | Captura móvil completa: 9.338 px de alto (~26 pantallas) | Recorrido largo en celular | `src/web/index.html` | Recomendación | Ver sección P |
| A-10 | Media (producción) / Baja (desarrollo) | `npm audit`: `fast-uri` (GHSA-w74x-v6f9-j3xg y otros) y `ip-address` (GHSA-rxp7-6hxx-x8q5) en producción; `smtp-server` de pruebas con nodemailer viejo | Validación de URI y una expresión regular lenta en dependencias transitivas | `package-lock.json`, `package.json` | Corregido (local) | `fast-uri` 3.1.9 / 4.2.3, `ip-address` 10.7.4, `smtp-server` 3.21.1; `npm audit` 0 |
| A-11 | Baja | La tienda no tiene PHP (0 archivos `.php`, servicio `runtime: node`); producción responde 404 JSON a `/index.php`, sin ejecutar nada ni filtrar el servidor. Pero el escudo no reconocía 16 formas de sondeo PHP (`.phtml`, `.phar`, `.phps`, `.pht`, `.inc`, `.user.ini`, `/phpinfo`, `%00`, `php://`, `composer.lock`, `vendor/composer`, `web.config`, `_ignition`, `_profiler`, `telescope`, `storage/logs`) | Un escáner que solo pidiera esas rutas no sumaba señales ni quedaba bloqueado | `src/server/services/shield.ts` | Corregido (local) | Patrones agregados; 2 sondeos bloquean la IP (probado en local: `.phtml` + `laravel.log` → 403); las rutas legítimas siguen igual |

Abiertos de auditorías anteriores (sin cambios, ver `HALLAZGOS.md` y `BACKLOG.md`): H-01 la
aplicación se conecta como dueña de las tablas (mitigación lista, falta el rol), H-03 testigo
externo de `CRON_SECRET`, H-04 tolerancia del `ts` del aviso de Mercado Pago (aún sin datos
reales suficientes), H-05 acciones de GitHub sin fijar por SHA.

## E. Antifraude (verificado en código)

- Precio y total: siempre del catálogo en el servidor (con piso de promoción); el navegador solo
  envía SKU y cantidad, y `expectedTotalCop` solo sirve para avisar si cambió.
- Mercado Pago: firma del aviso; el pago se consulta por su id a la API con el token del dueño;
  cuenta solo con COP, importe exacto y `live_mode` igual al modo configurado; un segundo pago
  aprobado de la misma orden queda para reembolso; un pago de Mercado Pago en un pedido de Nequi
  nunca lo paga; los estados se aplican con bloqueo de la orden e idempotencia por id del pago.
- Nequi: solo el dueño (sesión de administrador con doble factor) confirma; el importe debe ser el
  total; la referencia del movimiento es única (índice en la base); el aviso del cliente nunca
  confirma nada.
- Acceso a pedidos: cuenta, invitado (cookie guardada como hash) o token del enlace (HMAC con
  llavero rotativo, comparación en tiempo constante); inexistente y ajeno responden igual (404).
- Límites: pedidos abiertos por correo y por UID serializados con bloqueos de PostgreSQL.

## F. Protección de datos

- IP: solo huella con clave en la base y, desde este cambio, también en los registros (A-02).
- Registros: sin cookies, `authorization`, `x-order-token` ni la consulta de los callbacks de
  acceso.
- Enlace de seguimiento: el código va en el fragmento (`#pedido=…&codigo=…`), que el navegador no
  envía al servidor.
- Nombres de usuario: alias públicos sin correo, nombre real, IP ni cookie; formato que impide
  números de 7+ cifras (celular o documento).
- Del cliente de Nequi solo se guardan los 4 últimos dígitos.
- Hoja de Google: la pestaña «Entregas» tiene datos del jugador; sus permisos se revisan en la
  ronda diaria (hoy la hoja no está conectada: falta la llave).

## G. Render

- Servicio `taygamestore` en vivo con `aba648b` (despliegue automático por commit en
  `claude/taygamestore-production-pfctbn`). Del 2026-10-21 al 2026-10-25: 0 respuestas 5xx y 0
  registros de error o fatal; solo avisos «Hoja de Google apagada» (falta la llave, esperado).
- Arranque: correo apagado, eventos externos apagados, hoja de Google apagada, plazo de entrega
  publicado.
- `healthCheckPath` vacío (A-05). Configuración pública leída en producción: Mercado Pago en modo
  producción y Nequi por transferencia activos; Google activo, Facebook apagado.
- **NO VERIFICADO:** cómo se ve la tienda publicada en un navegador. El navegador de pruebas no
  confía en el certificado del proxy de esta sesión y no se desactivó la verificación TLS; se
  verificó con la misma configuración en el entorno local.

## H. Base de datos y respaldos

- Neon: PostgreSQL 18, ~34,6 MB, consumo del período ~45,6 CU-h a los 18 días (proyección ~65 de
  100). Compute activo al revisar.
- Respaldos: snapshot manual `respaldo-2026-10-13` y rama `respaldo-2026-10-13`; sin programación
  de snapshots; retención del historial (restauración a un momento) de 6 h (A-04).
- Migraciones solo aditivas; la 0024 agrega una columna que admite nulos.

## I. Cambios de código (locales, sin publicar)

- `src/server/lib/totp.ts`: `matchTotpStep` devuelve el paso aceptado.
- `src/server/services/auth.ts`: un solo uso por código (activación y verificación), mensaje
  «Ese código ya se usó» y `reused: true` en la auditoría.
- `src/server/db/schema.ts` + migración `0024_totp_un_solo_uso.sql` (+ snapshot y diario).
- `src/server/plugins/logging.ts`: `ipHash` en lugar de la IP.
- Landing e interfaz (`src/web/index.html`, `features/entry.js`, `app.js`, tokens de
  tipografía en las capas CSS y `styles/layers/39-landing-clarity.css`): ver
  `docs/auditoria/registro.md`, entradas del 2026-10-25. El acceso (`features/account.js` y la
  ventana de acceso) no cambia.
- `package.json` / `package-lock.json`: dependencias de A-10.
- `src/server/services/shield.ts`: más formas de sondeo PHP (A-11).

## J. Pruebas (ejecutadas, con cifras)

- Nuevas: integración «un código de la app sirve una sola vez» (falló antes de la corrección con
  200 en vez de 400; detecta la mutación que quita la condición); unitarias de `matchTotpStep` y
  del registro sin IP (falló antes de la corrección); e2e de la oferta de la entrada y del acceso
  sin proveedores apagados; e2e del panel: el código de la activación ya no entra y el siguiente
  sí.
- Resultados locales: lint y formato OK, tipos OK, unitarias 327/327, integración 304/304, e2e
  74/74, visuales 3/3 (capturas 01, 02 y 03 regeneradas tras revisarlas), `drizzle-kit check` OK,
  escáner de datos sensibles 0 coincidencias, `npm audit` 0.
- Fallos intermitentes encontrados y corregidos: eran carreras en las dos pruebas e2e nuevas,
  no en la tienda. Una leía los precios antes de que se pintaran las tarjetas (ahora espera con
  `expect.poll`) y otra recalculaba el código de la activación con la hora actual (ahora
  reutiliza el mismo). Firefox y WebKit solo corren en CI: **NO VERIFICADO** en local.

## K. Dependencias

- Producción y desarrollo: `npm audit` 0 tras A-10. Pendientes sin aviso de seguridad:
  `@fastify/static` 10.1.7, `nodemailer` 10.2.1, `eslint` 10.13.0, `typescript-eslint` 8.72.0;
  `@playwright/test` 1.64 (PR de Dependabot aparte: cambia los navegadores de prueba);
  `typescript` 7 y `@types/node` 26 son saltos mayores (aparte, con pruebas).

## L. Despliegue (requiere autorización explícita)

1. Snapshot de Neon antes de publicar (recomendado; también requiere autorización).
2. Commit con estos cambios y `git push` a `claude/taygamestore-production-pfctbn`: Render compila
   y aplica la migración 0024 antes de publicar.
3. Verificar: `list_deploys` en `live`, registros sin error, CI y CodeQL en verde, `/api/health`
   y `/api/config`.

## M. Rollback (solo con autorización)

- Revertir el commit (`git revert`, sin reescribir historial) y publicar: la columna
  `mfa_totp_last_step` puede quedarse (admite nulos y el código anterior no la usa); no hace falta
  bajar la migración. Para datos: restaurar desde el snapshot o la rama de respaldo.

## N. Riesgos residuales

A-04 a A-08; H-01, H-03, H-04 y H-05; una sola instancia con límites en memoria; dependencia del
plan gratuito (suspensión de Render y cuota de Neon); credenciales del dueño en Render (rotación
pendiente B-13); MFA del dueño en GitHub/Render/Neon (B-12) **NO VERIFICADO** desde aquí.

## O. Lista del dueño

1. URGENTE: revisar en Nequi el aviso de `TGS-TKRX3MBM03` (11.000 COP) y confirmarlo o
   rechazarlo en el panel.
2. Autorizar (o no) el snapshot de Neon y la publicación de estos cambios.
3. Render → Settings → Health Check Path: `/api/health`.
4. Conectar la hoja de Google (llave nueva en `GOOGLE_SHEETS_CREDENTIALS_JSON`) y el correo SMTP.
5. Pendientes anteriores: rol `tgs_app` (B-01), `CRON_SECRET` en GitHub (B-03), MFA en las
   cuentas de servicios (B-12) y rotación de credenciales (B-13).

## P. Plan de mantenimiento

- Diario (rutina): CI/CodeQL, Render, Neon (consumo y pedidos), hoja y avisos.
- Semanal: `npm audit` y `npm outdated`; revisar la auditoría del panel (fallos de MFA, códigos
  reutilizados `reused: true`, avisos inválidos).
- Mensual: snapshot de Neon y prueba de restauración en una rama; rotación de credenciales según
  `BACKLOG.md`.
- Producto: acortar el recorrido móvil (A-09) agrupando «Compra guiada», «Así llegan tus
  diamantes» y «Opiniones» detrás de pestañas o acordeones, sin quitar contenido.
