# Cambios

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versiones:
[SemVer](https://semver.org/lang/es/).

## [Sin publicar]

### Cambiado

- Escudo anti-abuso: las sondas de salud no consultan la lista de bloqueos (la Vigilancia cada
  5 min impedía que Neon se suspendiera) y su exención es por ruta exacta, no por prefijo.
- `infra/n8n/`: copia de los flujos de n8n (sin secretos) con instrucciones de restauración.
- Tareas internas en **modo reposo** (`JOBS_IDLE_MINUTES`, 30 por defecto): sin visitas a la API
  ni trabajo pendiente, corren una vez cada 30 min en vez de cada 1-2 min, para que la base de
  datos (Neon, plan gratuito: 100 CU-horas al mes) pueda suspenderse. Antes la mantenían siempre
  encendida (~5,7 CU-horas al día: el cupo se agotaba hacia el día 17 del mes y Neon suspende la
  base hasta el mes siguiente). Cualquier petición de un cliente, del panel o de Mercado Pago
  devuelve el ritmo normal al instante.

### Corregido

- Guías: `LEGAL_ID` lleva solo los 4 últimos dígitos (la tabla decía «NIT o cédula»).
- Botones de Google y Facebook: arrancan deshabilitados hasta que la configuración del servidor
  confirma el proveedor. Antes, un clic durante «Comprobando…» (servidor lento o recién
  despertado) navegaba a `/auth/*` y volvía con «acceso no configurado»; Render mostraba esas
  visitas como errores. La prueba e2e ahora comprueba que no sale ninguna petición a `/auth/*`
  (antes solo miraba la URL final, que el servidor devolvía a «/»).
- Registro del servidor: «entrada rechazada por validación» en lugar de «validation error» (nivel
  info; Render lo pintaba en rojo por la palabra «error»).

### Retirado

- Acceso de clientes con Discord (a pedido del dueño): sin botón, sin rutas `/auth/discord*` ni
  variables `DISCORD_*`. La ventana de acceso ofrece Google y Facebook, lado a lado, además de
  comprar como invitado. La base de datos conserva el valor `discord` solo por compatibilidad.

### Añadido

- Eventos de pedidos hacia n8n conectados en producción: el flujo Pedidos reconoce la llave por
  su huella SHA-256 (la llave solo vive en Render) y está publicado.
- Guía `docs/puesta-en-marcha.md`: los pasos que solo hace el dueño (rotar claves expuestas,
  webhook de Mercado Pago, SMTP, credenciales de n8n, Google OAuth, privacidad en GitHub, Neon) con
  el lugar exacto donde va cada credencial.
- n8n · Vigilancia: antes de avisar de una caída, espera 90 s y confirma con una segunda consulta.
- Vista previa al compartir el enlace (WhatsApp, Facebook, X): etiquetas Open Graph y Twitter con
  imagen propia de la marca (`og-image.png`, 1200×630) y direcciones absolutas tomadas de
  `PUBLIC_BASE_URL` en el build; favicon (SVG e ICO) e ícono para iPhone; datos estructurados
  `WebSite`. Las imágenes se regeneran con `node tools/marca/generar-imagenes.mjs` (sin logos ni
  arte de terceros).
- `robots.txt` y `sitemap.xml` servidos por el servidor con la URL pública: solo la tienda; la API,
  el inicio de sesión y el panel no se anuncian; términos y privacidad siguen con `noindex`.
- Guardia de datos (`.claude/hooks/guardia-datos.sh`), skills de auditoría y despliegue seguro,
  escáner de secretos y del documento del propietario, y registro de auditoría.

- Privacidad del vendedor: términos y privacidad muestran el documento solo como «documento
  terminado en XXXX» (`LEGAL_ID` se guarda completo en el hosting, nunca en el repositorio) y
  piden a los buscadores no indexarlas (`<meta name="robots">` y cabecera `X-Robots-Tag`:
  `noindex, noarchive, nosnippet`). El documento completo se entrega solo a la autoridad o ante
  un reclamo formal por correo. Comprobantes y correos no llevan nombre ni documento del vendedor.
- Aviso de marcas visible en el pie de la tienda (y ampliado en los términos): Free Fire, Garena,
  Roblox, PUBG y Mobile Legends se nombran solo para indicar el juego; TayGameStore es
  independiente y no usa sus logos ni imágenes.
- Entrega automática con el inventario (`PIN_AUTO_DELIVERY=true`): al aprobar Mercado Pago el
  pago, si hay PIN para todas las unidades, el pedido queda entregado en la misma transacción;
  el comprador pulsa «Ver mi PIN» en su pedido (solo él: misma autorización que ver el pedido) y
  lo recibe por correo con los pasos de canje en pagostore.com. Sin PIN suficientes o con las
  entregas pausadas, sigue la entrega manual. El dueño recibe «pagado y entregado con PIN».
- Compra estilo LootBar sin proveedor de consulta (`PLAYER_VERIFICATION=customer`, por
  defecto): el cliente escribe su ID, lo **repite** y pulsa «Sí, es mi ID»; el pedido nace
  listo para pagar y paga al instante, sin esperar a que el dueño verifique el nickname. El
  servidor exige que el ID repetido coincida y deja constancia («confirmado por el cliente»).
  `operator` mantiene la verificación previa del equipo; con proveedor autorizado sigue la
  consulta instantánea de nickname y región.
- Inventario de recargas (Panel → Inventario): el dueño carga los PIN que compra a una red
  autorizada, cifrados y sin duplicados; al empezar la entrega de un pedido pagado se reserva
  el más antiguo por unidad, al entregarlo queda usado; liberar/anular, alerta de stock bajo y
  costo por PIN. Procedimiento completo: `docs/procedimiento-diamantes.md`.
- Acceso del dueño sin Google (`docs/acceso-administrador.md`): contraseña propia creada con
  la frase `ADMIN_SETUP_CODE` (scrypt, bloqueo tras 5 fallos) + código de la app autenticadora,
  o huella/llave de acceso (WebAuthn) que ya es de dos pasos. Cambiar contraseña y añadir otra
  huella desde el panel. Nada de esto se muestra al público.
- Promo de fin de semana automática (`PROMO_SCHEDULE=weekends`, por defecto): el precio
  promocional rige de sábado 00:00 a domingo 23:59, hora de Colombia, en el catálogo y en lo que
  cobra el servidor. «Radar promo» muestra el horario en hora de Colombia, del visitante y UTC.
- Comprobante de pago por correo: al confirmarse el pago el cliente recibe «Comprobante de pago ·
  Pedido …» con código, fecha y operación de Mercado Pago, jugador, detalle con precio unitario,
  descuento y total (aclara que no reemplaza una factura electrónica).
- Textos legales configurables: los datos del vendedor (`LEGAL_*`), los canales de soporte y la
  versión se ponen en `/terminos.html` y `/privacidad.html` al servirlas, sin guardarlos en Git.
  `golive:check` y el arranque dicen exactamente qué variable falta.
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

- Ir a una sección (menú, «Revisar factura», crear pedido) seguía corrigiendo la posición
  durante ~1 s aunque la persona ya se hubiera ido con la barra de desplazamiento o un clic: la
  devolvía a la sección y su clic caía en otro botón (p. ej. «Actualizar estado»). Ahora deja de
  corregir si algo más mueve la página o hay un clic.
- Configurar la app autenticadora del panel: el dueño no lograba activar el código (secreto
  solo en texto, que había que teclear; cada clic en «Generar clave» lo cambiaba e invalidaba
  lo ya añadido en la app; el campo cortaba «123 456» en 6 caracteres). Ahora hay **código QR**
  (generado en el navegador) y enlace «Abrir en mi app autenticadora», la clave pendiente es
  siempre la misma, los códigos se aceptan con espacios y los botones de acceso se bloquean
  mientras procesan (el doble clic mostraba «Frase incorrecta» tras crear la contraseña).
- Google: la cuenta del dueño creada con contraseña o huella se vincula a su Google (mismo correo
  verificado y en ADMIN_EMAILS) en vez de crear otra; los correos de Google se guardan en
  minúsculas.
- Panel: los botones ocultos («Cerrar sesión», «Ver tienda como cliente»…) se mostraban a
  quien no tenía sesión porque el estilo del botón anulaba `hidden`.
- Seguimiento del pedido: una consulta automática que llegaba tarde (red lenta) podía volver a
  mostrar «Confirma tu cuenta» justo después de que el cliente confirmaba; ahora una respuesta
  anterior a un cambio se descarta (prueba que reproduce la carrera).
- Safari: al volver al inicio tras un desplazamiento largo, la portada podía quedar con las
  animaciones en pausa; se recalcula la visibilidad al detenerse el desplazamiento.
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
