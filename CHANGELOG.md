# Cambios

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versiones:
[SemVer](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido

- Burbujas de soporte (WhatsApp y correo) que solo aparecen si el canal está configurado.
- "Mis favoritos" en el menú de cuenta.
- Panel "Estado de operación" con el estado real del servidor (antes, porcentajes fijos).
- Vigilancia de producción cada 30 min con reinicio por deploy hook de Render e issues de
  incidente, y pull request semanal de mantenimiento (`docs/autorreparacion.md`).
- Botón "Deploy to Render" en el README.
- Despliegue alternativo en Vercel (`docs/deployment-vercel.md`).
- Pruebas de ataque desde el navegador (`e2e/tampering.spec.ts`): precios, pagos falsos,
  CSRF, panel oculto, cookies inventadas y XSS almacenado contra el panel.

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
