# Cambios

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versiones:
[SemVer](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido

- Eventos de pedidos hacia n8n (`EVENTS_WEBHOOK_URL` + `EVENTS_WEBHOOK_SECRET`): pagado,
  entregado y reembolsado salen por la cola de avisos con id estable, llave Bearer, sin
  redirecciones y sin correo ni nombre del cliente. Flujos de n8n de tareas, vigilancia y
  registro de pedidos: `docs/n8n.md`.
- Pago en proceso: si un pago de Mercado Pago queda pendiente (Efecty o PSE), la tienda lo
  muestra como «Pago en proceso» y avisa antes de abrir otro pago, para no cobrar dos veces. La
  tienda informa los medios de Checkout Pro en Colombia (tarjeta, PSE, Efecty, saldo).
- n8n: Diagnóstico integral, latido de la Vigilancia, agentes especializados (infraestructura,
  pedidos, marketing) bajo el Cerebro y plan de proveedor (`docs/specs/proveedores-recargas.md`).
- Evento `order.awaiting_verification` al crear un pedido con verificación manual (con su
  plazo): el dueño recibe al momento el aviso para verificar ID, nickname y región.
- Catálogo de producción cargado con los precios del HTML original, aprobados por el
  propietario el 2026-10-06 (registro de auditoría `product.created`).
- Burbujas de soporte (WhatsApp y correo) que solo aparecen si el canal está configurado.
- "Mis favoritos" en el menú de cuenta.
- Panel "Estado de operación" con el estado real del servidor (antes, porcentajes fijos).
- Vigilancia de producción cada 30 min con reinicio por deploy hook de Render e issues de
  incidente, y pull request semanal de mantenimiento (`docs/autorreparacion.md`).
- Botón "Deploy to Render" en el README.
- Despliegue alternativo en Vercel (`docs/deployment-vercel.md`).
- Pruebas de ataque desde el navegador (`e2e/tampering.spec.ts`): precios, pagos falsos,
  CSRF, panel oculto, cookies inventadas y XSS almacenado contra el panel.

### Corregido

- Base de datos: `sslmode=require` (y `prefer`/`verify-ca`) se fija como `verify-full`, el
  comportamiento que `pg` 8 ya aplicaba. Quita el aviso de seguridad en cada arranque de Render
  y evita que `pg` 9 debilite la verificación del certificado.

### Salida a producción

- Publicación gratuita: `render.yaml` pasa al plan Free de Render con PostgreSQL de Neon
  (la base gratuita de Render caduca); las migraciones cierran la compilación (el plan gratuito
  no tiene `preDeployCommand`). Guía `docs/despliegue-gratis.md`. Simulado con una base vacía:
  migraciones, `/api/ready`, tareas, panel oculto y segundo despliegue sin errores.
- `/api/internal/jobs` es ahora una ruta de la app (Render, Vercel o cualquier hosting), con
  `CRON_SECRET` validado (mínimo 32 caracteres): sin llave o con otra, 404; si una tarea falla,
  500 para que el flujo de GitHub quede en rojo. `tareas.yml` sirve para ambos hostings y, en
  Render Free, mantiene la tienda despierta.

- Seguridad de los correos: no incluyen el nombre que escribe el cliente (texto libre); así
  nadie puede pagar un pedido con el correo de otra persona para colarle un engaño en un
  correo legítimo de la tienda. El nombre del pedido rechaza saltos de línea y caracteres
  invisibles (ancho cero, inversión de dirección).

- Correos al cliente ("Pago confirmado", "Recarga completada", "Reembolso registrado") y al
  dueño ("Pedido pagado por entregar") por SMTP (Gmail con contraseña de aplicación u otro
  servidor). Cola `notifications` en la misma transacción que el cambio de estado, envío
  inmediato, reintentos (1/5/15/60 min) y alerta "Avisos sin enviar" tras 5 fallos; nunca
  duplicados. Al cliente solo se le escribe tras un pago confirmado. Validado contra un
  servidor SMTP real local con STARTTLS y autenticación.

- Aviso al dueño cuando Mercado Pago confirma un pago: notificación del sistema, sonido y
  contador en el título del panel (también en segundo plano), y mensaje de Telegram opcional
  (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`). Se envía una sola vez por pedido, después de
  guardar el pago; si el canal falla, el pago queda igual.
- Alerta "Pagados por entregar" en el panel.
- El aviso del panel también funciona en Chrome para Android (donde `new Notification` falla) y
  en navegadores sin notificaciones (queda el sonido); la alerta se pinta antes de avisar.
- `npm run golive:check` revisa las variables de producción y la tienda publicada
  (`docs/salir-a-produccion.md`).
- Flujo de GitHub `tareas.yml`: en Vercel dispara las tareas del servidor cada 10 minutos
  (conciliación de pagos sin webhook, vencimientos, reintentos); antes, en Hobby, una vez al día.

### Seguridad del panel

- Panel en una dirección secreta (`ADMIN_PATH`, obligatoria en producción con `ADMIN_EMAILS`):
  `/admin.html` responde 404, sin enlaces públicos, `noindex` y sin Referer. `/api/admin/*`
  responde 404 (no 401/403) a quien no es administrador. Un intento de entrada al panel sin
  permiso recibe el mensaje genérico de Google.
- "Ver tienda como cliente" en el panel y "Panel de administración" en el menú de cuenta (solo
  para el dueño); volver al panel exige Google + TOTP.

### Simulación de clientes

- `npm run load:sim` (`tools/load/simulate.mjs`, `docs/simulacion-clientes.md`): hasta 300
  clientes comprando a la vez y ataques simultáneos. 9 rondas, ≈ 210.000 peticiones, 0 errores
  del servidor, 0 clientes fallidos, memoria estable y las 9 defensas activas.
- Doble de Mercado Pago de pruebas: id de pago único aunque coincida el milisegundo.

### Accesibilidad y diseño (revisión con las guías de Apple, HIG)

- Ningún texto bajo 11 px (había 163 en móvil, el menor de 7,2 px); `--muted2` de 3,99:1 a
  5,34:1 sobre paneles; paso "02" de 1,5:1 a ≥5,5:1; pie de la entrada de 2,1:1 a 5,8:1.
- Anillo de foco cian en todos los controles con teclado (44 de 44).
- Controles táctiles de 44 px en pantallas táctiles (había 68 por debajo).
- Respuesta a "Aumentar contraste" y "Reducir transparencia" del sistema.
- La numeración 01–04 queda solo para los pasos de compra (Lab, Soporte y FAQ sin número).

### Rendimiento

- Arranque y fluidez sin quitar animaciones: las que no se ven (fuera de pantalla, tras la
  pantalla de entrada) se pausan y continúan al volver; partículas a 30 FPS en móvil; cursor,
  inclinación y barra de avance una vez por fotograma; aura y brillo sin repintar la página.
  Medido con CPU ×4 en móvil: arranque 2,1 s → 0,9 s, bloqueos 2,5 s → 0,8 s, entrada a 60 FPS;
  en escritorio el cursor pasa de 25 a 60 FPS. `e2e/motion.spec.ts` lo vigila.

### Corregido

- Enlaces del menú y vuelta de Mercado Pago: la sección quedaba bajo la cabecera o se pasaba.
- "Soporte" cortado en el menú con sesión iniciada; "Quitar" ilegible en favoritos.
- "COP COP" en el panel; pasos de compra numerados 01–05 en orden; textos de programador
  ("backend", "frontend", "checkout") retirados de la tienda.

## [1.0.0-rc.1] — 2026-10-05

Primera versión candidata a producción. **No se ha vendido todavía**: faltan los pasos del
propietario de la sección "Antes de la 1.0.0".

### Tienda

- Frontend cinematográfico original conservado (`legacy/` intacto) y separado en capas CSS y
  módulos ES; responsive sin desbordes de 360 a 1920 px y accesible (axe-core WCAG 2.1 AA).
- Catálogo y precios decididos por el servidor; carrito (deshacer, ahorro, tope por paquete,
  sincronización entre pestañas) y favoritos completos; espacios compactados.
- Pedido → verificación del jugador → "Sí, es mi cuenta" → pago → entrega manual → comprobante
  JPG/PDF y seguimiento. Búsqueda de ID estilo LootBar lista tras un proveedor autorizado, con
  verificación manual automática de respaldo.
- Panel `/admin.html`: verificación, entregas, revisión, catálogo, bloqueos, auditoría y
  alertas.

### Pagos (Mercado Pago, única pasarela)

- Checkout Pro con el SDK oficial, webhook firmado, idempotencia, conciliación, reembolsos y
  pagos duplicados o tardíos controlados.
- Sandbox seguro: `MP_MODE` contrastado con `live_mode` de cada pago, avisos de modo prueba y
  `npm run mp:sandbox`.

### Cuentas

- Clientes: Google, Discord y Facebook (OAuth oficial), vinculación explícita que nunca une por
  correo. Administración: solo Google + `ADMIN_EMAILS` + TOTP.

### Seguridad

- CSP, CSRF, cookies `__Host-`, sesiones opacas, validación estricta, auditoría inalterable,
  secretos solo por entorno con llaveros rotables.
- Escudo anti-abuso (escáneres, CSRF, ráfagas, enumeración, MFA) con bloqueo escalonado,
  límite global por IP, `requestTimeout`, bloqueo de MFA por cuenta, filtro de U+0000 y errores
  del enrutador con formato estándar.
- Sin rutas que toquen credenciales, cobros o administradores (prueba de inventario).

### Rendimiento y datos

- Listado de pedidos sin N+1 (151 → 4 consultas); estáticos precomprimidos (br/gzip) y caché
  inmutable; índices en todas las claves foráneas.

### Calidad

- 117 pruebas unitarias, 131 de integración con PostgreSQL (incluye fuzzing de toda la API con
  semillas reproducibles), 35 e2e en Chromium, Firefox y WebKit (CI) y 3 referencias visuales.
- CI: lint, formato, tipos, deriva esquema/migraciones, auditoría de dependencias (0
  vulnerabilidades), gitleaks verificado por checksum, CodeQL y Dependabot semanal.

### Despliegue y operación

- `render.yaml` validado contra la configuración; guías de despliegue, sandbox, runbook,
  incidentes, dinero y acceso; textos legales en borrador con bloqueo de ventas mientras
  queden campos `[COMPLETAR`.

### Retirado

- Wompi, el botón de VK ID (protocolo no verificable) y el formulario de contraseña que nunca
  funcionó.

### Antes de la 1.0.0 (propietario)

1. Apps de Google, Discord y Meta; claves en Render.
2. Sandbox de Mercado Pago completo (`docs/sandbox-mercadopago.md`).
3. Render + dominio + catálogo y precios reales.
4. Textos legales completos y revisados por un abogado.
5. `ADMIN_EMAILS` solo con el correo del propietario.
