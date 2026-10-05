# TayGameStore — Plan técnico de arquitectura para producción (v2)

> **Estado:** documento de planificación. **No hay código de aplicación implementado.**
> **Fuente de verdad:** el único artefacto existente, `TayGameStore-index-cinematic-v4.html` (SPA de un solo archivo, 1296 líneas). El repositorio no contiene backend, base de datos, tests ni CI. Todo lo que aquí se describe como servidor es **diseño propuesto**.
> **Versión:** 2 — incorpora la revisión arquitectónica crítica (problemas P1–P30) y las decisiones C1–C12 confirmadas por el propietario.
> **Fecha:** 2026-10-05

> **Decisiones posteriores (prevalecen sobre este documento):**
> - **Pagos:** Mercado Pago es la única pasarela; **Wompi queda eliminado**. Todo lo que este
>   plan dice sobre Wompi está **sustituido** por [`docs/specs/pagos.md`](specs/pagos.md).
> - **Verificación de jugador:** [`docs/specs/verificacion-jugador.md`](specs/verificacion-jugador.md).

## Convenciones

| Marca | Significado |
|---|---|
| **[A VERIFICAR]** | Dato externo (Wompi, Google, hosting, librerías) que **no se ha comprobado**. Se contrasta con documentación oficial antes de implementar. |
| **PENDIENTE DE CONFIGURACIÓN** | Depende de credenciales, cuentas o infraestructura que todavía no existen. |
| **NO VERIFICADO** | No hay evidencia de que funcione o exista. |
| **BLOQUEADO** | No se implementa hasta que se resuelva la condición indicada. |
| **[POR DEFINIR]** | Valor de negocio que debe fijar el propietario; el sistema lo deja configurable y no inventa un valor. |

Reglas permanentes de este plan:
1. No se inventan APIs, proveedores, credenciales, métodos de pago, estados ni tiempos de Wompi.
2. No se inventa un proveedor de recargas ni un método de verificación de jugadores.
3. El cliente muestra; **el servidor decide** precios, promociones, totales, estados, identidad y roles.
4. Se conserva la identidad visual cinematográfica (oscuro, violeta, azul, cian, animaciones).

---

## 1. Decisiones

### 1.1 Confirmadas

| # | Decisión | Consecuencia en la arquitectura |
|---|---|---|
| C1 | **Verificación manual del jugador por un operador antes de habilitar el pago.** No se inventa el método. | Nuevo estado `AWAITING_VERIFICATION`. La función de verificación queda **BLOQUEADA** hasta que el propietario confirme una fuente legítima (ver §8). |
| C2 | **Google OAuth + checkout como invitado. Sin contraseñas** al lanzamiento. | Se eliminan hashing de contraseñas, recuperación, verificación de correo propia y tablas asociadas. |
| C3 | Hosting **no cerrado**. Requisito: proceso Node persistente + PostgreSQL gestionado con backups y **PITR**. | Arquitectura portátil (imagen Docker). Opciones en §18. |
| C4 | Widget vs. redirección de Wompi **sin decidir** hasta verificar documentación oficial. | El módulo de pagos se diseña tras una interfaz; la Fase 8 empieza con una verificación documental. |
| C5 | No inventar métodos, estados ni expiraciones de Wompi. | Todo dato de Wompi va marcado **[A VERIFICAR]**; los TTL propios de la tienda son independientes y configurables. |
| C6 | Antifraude: **máx. 5 unidades por producto**, **máx. $1.000.000 COP por orden**, rate limiting por **IP, email y UID**, **lista de bloqueo**. Todo configurable. | Límites en configuración + tabla `blocklist`. |
| C7 | Panel admin con **alerta visual/sonora** de órdenes pagadas. Email/WhatsApp después. Tienda con **tiempo de entrega realista y horario de atención**. | Endpoint de alertas + configuración de horario y tiempo estimado. |
| C8 | Correo no bloquea fases iniciales; resuelto **antes del lanzamiento** si se envían comprobantes o enlaces de orden. Sin recuperación de contraseña. | Interfaz `Mailer` con implementación nula hasta elegir proveedor. |
| C9 | Reembolsos manuales (panel de Wompi + panel admin) con **registro de quién y por qué**. | Campos de reembolso en `payments` + `audit_events`. |
| C10 | Preparar términos, privacidad y aceptación. **No afirmar facturación electrónica.** Usar **"Comprobante"**. Validación legal antes del lanzamiento. | Versión de términos aceptada guardada en cada orden. |
| C11 | **Un solo administrador.** Sin rol `support`. | Roles: `customer`, `admin`. |
| C12 | Sin CAPTCHA inicial; **rate limiting desde el día uno**; CAPTCHA preparado para activarse. | Interfaz `CaptchaVerifier` desactivada por configuración; proveedor no elegido. |

### 1.2 Aún pendientes (resumen; detalle en §22)

| # | Pendiente | Bloquea |
|---|---|---|
| R1 | **Fuente legítima para verificar UID/nickname** (C1). | Ventas (Fase 7, verificación) |
| R2 | **Hosting** entre las opciones de §18. | Staging y producción (Fase 10) |
| R3 | **Acceso a la documentación oficial de Wompi** desde el entorno de desarrollo (hoy `docs.wompi.co` está bloqueado por la red del entorno) y cuenta/llaves sandbox. | Fase 8 |
| R4 | **Valores de negocio**: horario de atención, tiempo de entrega estimado, TTL de verificación y de pago, catálogo y precios reales. | Fases 4, 6 y 7 |
| R5 | **Cliente OAuth de Google** (consola de Google Cloud) y lista de correos administradores. | Fase 5 |
| R6 | **Dominio**. | OAuth en producción, webhooks, correo |
| R7 | **Proveedor de correo** (antes del lanzamiento). | Fase 11 |

---

## 2. Registro de cambios v1 → v2 (P1–P30)

| P | Problema de v1 | Corrección en v2 | Sección |
|---|---|---|---|
| P1 | Verificación bloqueante sin proveedor ⇒ cero ventas | Verificación manual por operador (C1); bloqueada hasta confirmar fuente legítima | §8 |
| P2 | Doble cobro de una orden | Un único intento de pago activo por orden (índice único parcial); pago aprobado extra ⇒ `needs_refund` + alerta | §10, §11 |
| P3 | Expiración vs. pagos asíncronos | No expira mientras haya intento pendiente; un pago aprobado y válido gana sobre la expiración; sin cancelación por cliente | §7.3 |
| P4 | Estados de pago mezclados con la orden | Estados de orden y de intento separados | §7.3 |
| P5 | Doble entrega manual / sin notificación | Reclamo atómico (`claimed_by`) + alertas en el panel | §9, §14 |
| P6 | Órdenes de invitado en cuentas ajenas; pre-hijacking | Asociación solo con correo verificado por Google; sin vinculación automática insegura | §6 |
| P7 | Webhook con dedupe como defensa principal | Webhook = notificación → verificar firma → consultar Wompi → aplicar idempotente; firmas inválidas solo a logs | §11 |
| P8 | Reconciliación dependiente de búsqueda por referencia | Endpoint `sync` con id de transacción + reconciliación de intentos con id; búsqueda por referencia [A VERIFICAR] | §11 |
| P9 | CSP con nonce | CSP estática por cabecera; eliminar estilos inline | §13 |
| P10 | Contraseñas sin correo | Sin contraseñas (C2) | §6 |
| P11 | Sin antifraude | Límites C6 + rate limiting + blocklist | §7.5, §13 |
| P12 | Sin interruptor de emergencia | `CHECKOUT_ENABLED`, `MAINTENANCE_MODE` | §7.6 |
| P13 | Node 22 | Node 24 LTS [A VERIFICAR estado LTS al instalar] | §3 |
| P14 | Monorepo excesivo | Un solo paquete | §19 |
| P15 | Cola y worker prematuros | Un proceso con tareas programadas + advisory lock | §4, §12 |
| P16 | 15 tablas | 9 tablas | §5 |
| P17 | Idempotencia duplicada | `checkout_key UNIQUE` en `orders` | §7.4 |
| P18 | CSRF con token sincronizado | Cabecera personalizada + `Origin`/`Sec-Fetch-Site` + JSON | §6.4 |
| P19 | Sesiones de invitado | Invitado sin sesión; token de orden | §6.3 |
| P20 | `version` + CAS de estado | Solo CAS de estado | §12 |
| P21 | Entrega parcial indefinida | `DELIVERED` solo si todos los ítems; parcial ⇒ `NEEDS_REVIEW` | §9 |
| P22 | Faltan secretos MFA / pepper IP | `MFA_ENCRYPTION_KEY`, códigos de recuperación, `IP_HASH_PEPPER` | §6.5, §16 |
| P23 | Token en query de enlaces | Token en fragmento `#t=` | §6.3 |
| P24 | Sin registro de términos | `terms_version` + `terms_accepted_at` en la orden | §5, §7 |
| P25 | Oráculo de lookup | No hay lookup público al lanzar; rate limit; CAPTCHA preparado | §8, §13 |
| P26 | TS en Fase 1 | JS modular primero; TS gradual (`checkJs`) | §4.2 |
| P27 | 16 fases | 11 fases + "Después" | §20 |
| P28 | Zona horaria / impuestos | UTC en BD, `America/Bogota` en UI; IVA a validar con contador | §5, §22 |
| P29 | Solo widget | Widget vs. redirección decidido tras documentación (C4) | §10 |
| P30 | Admin vanilla podría crecer | Entrada Vite separada; migrable sin tocar la tienda | §14 |

---

## 3. Stack

| Capa | Elección | Notas |
|---|---|---|
| Runtime | **Node 24 LTS** + TypeScript | [A VERIFICAR estado LTS al instalar] |
| Servidor HTTP | **Fastify** | Plugins oficiales para cookies, cabeceras, rate limit y estáticos |
| Validación | **Zod** compartido cliente/servidor | Un contrato único |
| Base de datos | **PostgreSQL ≥ 16** (versión que ofrezca el hosting) | Transacciones, `FOR UPDATE`, índices parciales, JSONB |
| Acceso a datos | **Drizzle ORM** + `drizzle-kit` | Migraciones SQL generadas y **revisadas a mano** |
| Frontend | HTML/CSS/JS actuales → **módulos con Vite** | Sin React/Next; identidad intacta |
| Tests | Vitest, Playwright, axe-core | Postgres real en CI (servicio de contenedor) |
| Calidad | ESLint, typescript-eslint, Prettier | |
| CI | GitHub Actions | |
| Empaquetado | Dockerfile multi-etapa | Portabilidad entre hostings |

Versiones concretas: se fijan al instalar y quedan en el lockfile; no se afirman aquí.

---

## 4. Arquitectura

### 4.1 Vista general

```
Navegador ── tienda (/) y panel (/admin)
   │  HTTPS · mismo origen · sin CORS
   ▼
Proxy/TLS del hosting (HSTS)
   ▼
┌──────────── Un proceso Node (Fastify) ─────────────────────────────┐
│ Plugins: cabeceras+CSP estática · cookies · sesión · CSRF ·        │
│          rate limit · errores · logs (pino, con redacción)         │
│ Módulos: config · health · auth(Google) · catalog · checkout ·     │
│          orders · verification · payments · fulfillment · refunds ·│
│          blocklist · limits · admin · alerts · legal               │
│ Tareas programadas (advisory lock): expiración · reconciliación    │
│ Estáticos: build de Vite (tienda + admin)                          │
└───────────────┬────────────────────────────────────────────────────┘
                ▼
       PostgreSQL gestionado (backups + PITR)
                │
Integraciones (detrás de interfaces):
  PaymentGateway ─► Wompi           [A VERIFICAR · PENDIENTE DE CONFIGURACIÓN]
  FulfillmentProvider ─► Manual     (proveedor real: NO VERIFICADO, sin implementar)
  PlayerVerifier ─► Manual (operador) [BLOQUEADO hasta R1]
  Mailer ─► Nulo                    (PENDIENTE DE CONFIGURACIÓN, C8)
  CaptchaVerifier ─► Desactivado    (C12)
  IdentityProvider ─► Google OIDC   (PENDIENTE DE CONFIGURACIÓN, R5)
```

- **Mismo origen**: la API sirve el frontend compilado. No hay CORS; cookies `SameSite` y CSRF son más simples.
- **Un solo proceso** con tareas programadas protegidas por `pg_try_advisory_lock`, de modo que si en el futuro hay varias instancias, solo una ejecuta cada tarea.
- **Interfaces para todo lo externo**: permiten implementar Wompi y un proveedor de recargas después sin reescribir órdenes.

### 4.2 Estrategia del frontend (sin reemplazar)

1. Copiar el HTML original a `legacy/` (referencia inmutable).
2. Capturas de referencia con Playwright (360, 768, 1280 px) **antes** de tocar nada.
3. Extraer CSS por capas (`tokens`, `base`, `layout`, `components`, `cinematic`, `responsive`) **sin cambiar reglas**.
4. Extraer JS a **módulos JS** (no TS todavía) manteniendo funciones y nombres: `core/`, `features/`, `effects/`.
5. Comparar capturas: misma apariencia.
6. Activar `checkJs` y convertir a TS de forma gradual, empezando por `core/api` y `core/state`.

### 4.3 Cambios de contrato y de UX en el frontend

| Hoy en el HTML | Cambio |
|---|---|
| `?demo=1` / `file:` simula pago y jugador | Modo demo **solo en build de desarrollo**; ausente del build de producción |
| `FALLBACK_FREEFIRE` con precios fijos | Eliminado; sin catálogo ⇒ estado vacío honesto |
| `localStorage` con órdenes, historial, `verified`, PII; `Object.assign(state, s)` sin lista blanca | Lista blanca: favoritos, preferencias de UI y **referencias + tokens de las órdenes del invitado** (capacidad de acceso, no fuente de verdad). Estado siempre desde el servidor |
| Verificación instantánea "en tiempo real" y modal "Buscar jugador" | Flujo asíncrono: "Solicitar verificación" → el operador verifica → el cliente confirma el nickname → pagar. El modal de búsqueda en tiempo real se oculta mientras no exista una fuente automática legítima |
| `?code=` + `hashCode()` (FNV 32 bits) | Token aleatorio en cabecera `X-Order-Token` |
| Toggle Normal/Promo elegido por el cliente | El servidor aplica la promo vigente; la UI solo la muestra |
| `nickname`, `tariff`, precios enviados por el cliente | El cliente envía solo `productId`, `quantity`, UID, datos de contacto y aceptación de términos |
| "Factura", "Factura digital", "Factura viva" | **"Comprobante"** (C10) |
| "LIVE", "Sistemas activos", "24 ms" fijos | Estado real de `/api/config` o nada; tiempo de entrega y horario visibles (C7) |
| `window.state` en `tgs-cinematic-v4` (confeti nunca se dispara) | Evento `tgs:order-delivered` |
| Polling doble (5 s + 15 s) | Un poller con backoff y refresco al volver a la pestaña |
| 29 `onclick` inline, `style="…"` inline | `addEventListener` y clases CSS (requisito de CSP) |
| Google Fonts remotas | Autoalojadas (privacidad y CSP) |
| OAuth Google/Facebook/Discord/VK + formulario de contraseña | Solo Google + "Continuar como invitado"; sin formulario de contraseña |
| Modales sin `role="dialog"`/`aria-modal`/foco | Módulo `a11y/modal` |

La sección **"Ruta de seguimiento"** existente (Pedido creado → Jugador validado → Pago → Entrega) encaja con el nuevo flujo y se conserva como eje visual.

---

## 5. Base de datos (9 tablas)

Convenciones: UUID como PK, `timestamptz` en **UTC**, dinero en **enteros en unidad mínima** (centavos de COP) con `CHECK` de positividad; la conversión al formato que exija Wompi se hace en el adaptador **[A VERIFICAR]**. Moneda única inicial: `COP`.

```
users
  id, google_sub UNIQUE, email, email_verified bool, name,
  role ('customer'|'admin'), status ('active'|'disabled'),
  mfa_secret_enc NULL, mfa_recovery_hashes jsonb NULL, mfa_enabled_at NULL,
  created_at, last_login_at

sessions
  id, token_hash bytea UNIQUE, user_id FK NOT NULL,
  created_at, last_seen_at, expires_at, revoked_at NULL,
  mfa_verified_at NULL, ip_hash, user_agent

products
  id, game ('freefire'|…) , sku UNIQUE, name, description, tag, units int,
  price_minor bigint CHECK (>0),
  promo_price_minor bigint NULL CHECK (promo_price_minor < price_minor),
  promo_starts_at NULL, promo_ends_at NULL,
  status ('draft'|'active'|'archived'), sort, created_at, updated_at

orders
  id, public_ref UNIQUE (aleatoria), checkout_key uuid UNIQUE,
  user_id FK NULL, access_token_hash bytea NOT NULL,
  customer_name, customer_email,
  game, player_uid,
  player_nickname NULL, player_region NULL,
  verification_source ('manual'|'provider') NULL, verified_by FK NULL, verified_at NULL,
  verification_note NULL, rejection_reason NULL,
  player_confirmed_at NULL,                 -- el cliente confirma "es mi cuenta"
  subtotal_minor, discount_minor, total_minor,
  CHECK (total_minor = subtotal_minor - discount_minor AND total_minor > 0),
  currency, status order_status,
  claimed_by FK NULL, claimed_at NULL,
  terms_version, terms_accepted_at,
  expires_at, created_at, updated_at, paid_at NULL, delivered_at NULL

order_items
  id, order_id FK, product_id FK,
  product_name_snapshot, units_snapshot,
  unit_price_minor, quantity CHECK (quantity BETWEEN 1 AND <límite>),
  line_total_minor

payments                                   -- intentos de pago
  id, order_id FK, provider ('wompi'), reference UNIQUE,
  provider_tx_id UNIQUE NULL, status, provider_status_raw NULL,
  amount_minor, currency, raw jsonb NULL,
  needs_refund bool DEFAULT false,
  refunded_at NULL, refunded_by FK NULL, refund_reason NULL, refund_external_ref NULL,
  created_at, updated_at
  -- índice único parcial: un solo intento "abierto" por orden

fulfillments
  id, order_item_id FK UNIQUE, method ('manual'|'provider'),
  status ('pending'|'succeeded'|'failed'|'unknown'),
  provider_ref NULL, evidence_note NULL, attempts int,
  completed_by FK NULL, completed_at NULL, last_error NULL

blocklist
  id, kind ('email'|'player_uid'|'ip_hash'|'google_sub'),
  value_norm, reason, created_by FK, created_at, expires_at NULL,
  UNIQUE (kind, value_norm)

audit_events                               -- append-only
  id bigserial, entity_type, entity_id, action,
  from_status NULL, to_status NULL,
  actor_type ('system'|'customer'|'admin'|'webhook'), actor_id NULL,
  data jsonb, ip_hash NULL, created_at
```

Notas:
- **Snapshot de precios** en `order_items`: reemplaza la tabla `product_prices` de v1; cambios de precio quedan en `audit_events`.
- **Juegos** como constante en código (solo 4 conocidos); tabla `games` cuando haga falta.
- La **cantidad máxima** del `CHECK` se valida también en la aplicación con el valor configurable; el `CHECK` de BD es un tope de seguridad.
- El rol de BD de la aplicación **no** tiene `UPDATE`/`DELETE` sobre `audit_events`.
- Índices: `orders(status, created_at)`, `orders(user_id)`, `orders(lower(customer_email))`, `orders(player_uid)`, `payments(order_id)`, `audit_events(entity_type, entity_id)`.
- El valor exacto del "intento abierto" (estado pendiente de Wompi) se define tras la verificación documental **[A VERIFICAR]**.
- **Eliminadas respecto a v1:** `oauth_identities`, `email_tokens`, `product_prices`, `provider_products`, `idempotency_keys`, `webhook_events`, `settings`, `games`, `order_events` (fusionada en `audit_events`).

---

## 6. Autenticación y autorización

### 6.1 Clientes: Google OAuth (C2)
- OpenID Connect, Authorization Code + **PKCE**, `state` y `nonce` verificados; validación del ID token (emisor, audiencia, expiración, firma) mediante una librería mantenida **[A VERIFICAR librería y endpoints con la documentación de Google]**.
- Identidad por `google_sub`. Se usa el correo solo si Google lo marca como verificado.
- **PENDIENTE DE CONFIGURACIÓN:** cliente OAuth en Google Cloud y URIs de redirección exactas por ambiente (R5, R6).

### 6.2 Asociación de órdenes de invitado (P6)
- Una orden de invitado se asocia a una cuenta **solo** si el correo de Google está verificado y coincide con `customer_email`. Nunca por un correo no verificado.
- No hay cuentas locales con contraseña, por lo que no existe el escenario de vincular Google con una cuenta local no verificada.

### 6.3 Invitado y token de orden (P19, P23)
- El invitado **no tiene sesión**.
- Al crear la orden, el servidor genera un **token aleatorio de 256 bits**, guarda su hash (con `ORDER_TOKEN_PEPPER`) y devuelve el token **una sola vez**.
- El cliente lo guarda en `localStorage` como capacidad de acceso (lista blanca) y lo envía en la cabecera `X-Order-Token`.
- Enlaces por correo (cuando exista, C8): `/#/orden/<ref>#t=<token>` en el **fragmento**, que no llega a servidores ni al `Referer`. `Referrer-Policy: no-referrer` en esas vistas.
- Si el invitado pierde el token y no hay correo: recuperación por soporte, verificando datos de la orden (procedimiento operativo, §21).

### 6.4 Sesiones y CSRF (P18)
- Sesión opaca de 256 bits (hash en BD) solo para usuarios autenticados.
- Cookie `__Host-tgs_sid`: `HttpOnly; Secure; SameSite=Lax; Path=/`. En desarrollo local, nombre sin prefijo si el navegador no lo admite en `http://localhost` [A VERIFICAR].
- Rotación al iniciar sesión y al completar MFA; expiración absoluta e inactividad; logout revoca en BD.
- **CSRF** en toda petición que cambie estado: cabecera personalizada obligatoria (`X-TGS-Request: 1`), `Content-Type: application/json` y validación de `Origin`/`Sec-Fetch-Site` contra `PUBLIC_BASE_URL`. `GET` nunca cambia estado. El webhook está excluido (se autentica por firma).

### 6.5 Administrador (C11, P22)
- Un solo rol privilegiado: `admin`.
- Acceso: Google OAuth **y** correo incluido en `ADMIN_EMAILS` **y** rol `admin` asignado por CLI (`create-admin`) **y** **TOTP obligatorio** en cada sesión.
- Secreto TOTP cifrado con `MFA_ENCRYPTION_KEY`; códigos de recuperación de un solo uso guardados como hash.
- Sesión admin con caducidad corta.

### 6.6 Autorización

| Acción | Invitado (token) | customer | admin |
|---|---|---|---|
| Ver catálogo | ✔ | ✔ | ✔ |
| Crear orden | ✔ | ✔ | — |
| Ver / confirmar / pagar **su** orden | con `X-Order-Token` | si `orders.user_id = sesión` | ✔ |
| Historial | ✘ | ✔ (propio) | ✔ |
| Verificar jugador, reclamar, entregar, reembolsar | ✘ | ✘ | ✔ |
| Catálogo, precios, promos, blocklist, auditoría | ✘ | ✘ | ✔ |

- `user_id`, `role`, `status`, precios y totales **nunca** se aceptan del cliente.
- El filtro de propietario va **dentro del SQL** (`WHERE public_ref = $1 AND (user_id = $2 OR access_token_hash = $3)`), con respuesta `404` indistinguible para "no existe" y "no es tuya".

---

## 7. Productos y órdenes

### 7.1 Catálogo y promociones
- Productos en BD, gestionados por el admin. **Ningún precio en el código ni en el frontend.**
- Precio vigente = `promo_price_minor` si `now()` está dentro de `[promo_starts_at, promo_ends_at)`; si no, `price_minor`. Lo calcula el servidor.
- Carga inicial por CLI **con datos que proporcione el propietario** (R4).

### 7.2 Creación de la orden (`POST /api/checkout`)
1. Comprobar `CHECKOUT_ENABLED` / `MAINTENANCE_MODE`.
2. Validar con Zod: `checkoutKey` (UUID), `items[{productId, quantity}]`, un solo juego, `playerUid` (formato), `customerName`, `customerEmail`, `termsVersion` igual a la vigente y `termsAccepted: true`.
3. Rate limit por IP, email y UID; consultar `blocklist`.
4. Cargar productos **desde BD**; rechazar inactivos o de otro juego; aplicar límites C6.
5. Calcular totales en el servidor; si el cliente envía `expectedTotalMinor` y difiere ⇒ `409 PRICE_CHANGED` con los valores reales (el cliente nunca es autoridad).
6. Insertar orden + ítems en una transacción con estado `AWAITING_VERIFICATION`, `expires_at = now() + VERIFICATION_TTL`.
7. Responder `{ reference, orderToken (una vez), status }` y emitir alerta al panel.

El precio queda **bloqueado** en la orden; si la promo termina mientras la orden está vigente, se respeta el precio bloqueado.

### 7.3 Máquina de estados de la orden (P3, P4)

Estados: `AWAITING_VERIFICATION`, `REJECTED`, `AWAITING_PAYMENT`, `PAID`, `DELIVERING`, `DELIVERED`, `NEEDS_REVIEW`, `EXPIRED`, `REFUNDED`.

| Desde | Hacia | Disparador | Condiciones |
|---|---|---|---|
| `AWAITING_VERIFICATION` | `AWAITING_PAYMENT` | Admin verifica | Nickname registrado + nota de fuente; nuevo `expires_at = now() + PAYMENT_TTL` |
| `AWAITING_VERIFICATION` | `REJECTED` | Admin rechaza | Motivo obligatorio |
| `AWAITING_VERIFICATION` | `EXPIRED` | Tarea de expiración | Vencido |
| `AWAITING_PAYMENT` | `PAID` | Pago aprobado y válido | `player_confirmed_at` presente; referencia, monto y moneda coinciden |
| `AWAITING_PAYMENT` | `EXPIRED` | Tarea de expiración | Vencido **y sin intento de pago abierto** |
| `EXPIRED` | `PAID` | Pago aprobado y válido tardío | **El pago gana**: se respeta el precio bloqueado si los productos siguen activos; si no ⇒ `NEEDS_REVIEW` |
| `PAID` | `DELIVERING` | Admin reclama (CAS) | `claimed_by`, `claimed_at` |
| `DELIVERING` | `PAID` | Admin libera el reclamo | Auditado |
| `DELIVERING` | `DELIVERED` | Admin marca entrega | **Todos** los `fulfillments` en `succeeded`, con nota de evidencia |
| `PAID`, `DELIVERING` | `NEEDS_REVIEW` | Admin o sistema | Entrega parcial/fallida, discrepancia de pago |
| `NEEDS_REVIEW` | `DELIVERING` | Admin reintenta | |
| `NEEDS_REVIEW`, `DELIVERED` | `REFUNDED` | Admin registra reembolso | Motivo obligatorio; ejecutado en Wompi (C9) |

- Estados terminales: `REJECTED`, `EXPIRED` (salvo pago tardío), `DELIVERED` (salvo reembolso excepcional), `REFUNDED`.
- **Sin cancelación por el cliente**: las órdenes no pagadas expiran (evita carreras con pagos en curso).
- Los **intentos de pago** tienen sus propios estados, que se tomarán de la documentación oficial de Wompi **[A VERIFICAR]**. Un intento rechazado **no cambia** la orden: el cliente puede intentar de nuevo mientras la orden esté vigente.
- Pago aprobado sobre orden ya `PAID`/`DELIVERING`/`DELIVERED`/`REFUNDED` ⇒ el intento se marca `needs_refund = true` + alerta; la orden no cambia (P2).
- Pago aprobado con discrepancia de monto, moneda o referencia ⇒ `NEEDS_REVIEW` + alerta.
- Mapa único de estados → texto UI en `shared/order-states`.

### 7.4 Idempotencia del checkout (P17)
- `checkout_key` lo genera el cliente por intento de compra.
- `INSERT … ON CONFLICT (checkout_key) DO NOTHING RETURNING …`: si ya existe, se devuelve la misma orden **solo** si el solicitante es el mismo (sesión o mismo correo + huella de la petición); si no, `409`.
- El token de orden no se vuelve a emitir en reintentos: el cliente lo conserva desde la primera respuesta; si la perdió, recuperación por soporte.

### 7.5 Antifraude (C6, P11)

| Control | Valor inicial | Configurable |
|---|---|---|
| Unidades por producto | **5** | `LIMIT_MAX_UNITS_PER_PRODUCT` |
| Total por orden | **1.000.000 COP** | `LIMIT_MAX_ORDER_TOTAL_COP` |
| Rate limit por IP / email / UID | **[POR DEFINIR]** | `RATE_LIMIT_*` |
| Órdenes abiertas simultáneas por email/UID | **[POR DEFINIR]** | `LIMIT_MAX_OPEN_ORDERS_*` |
| Lista de bloqueo | email, UID, hash de IP, `google_sub` | Tabla `blocklist`, gestionada en el panel |

- Rate limit de peticiones: en memoria (una instancia). Límites de negocio (órdenes abiertas por email/UID): **consulta a BD**, válidos aunque haya varias instancias.
- Las respuestas por bloqueo no revelan el motivo.

### 7.6 Interruptores (P12)
- `CHECKOUT_ENABLED=false` ⇒ `503 CHECKOUT_DISABLED`; la UI muestra un aviso.
- `MAINTENANCE_MODE=true` ⇒ solo lectura del catálogo y consulta de órdenes.
- Expuestos en `/api/config`. Cambio = cambio de variable + reinicio (panel editable más adelante).

---

## 8. Verificación del jugador (C1)

### 8.1 Flujo
1. El cliente crea la orden (`AWAITING_VERIFICATION`) y ve en "Ruta de seguimiento": *Verificación pendiente · horario de atención · tiempo estimado*.
2. El panel admin alerta de la nueva orden.
3. El operador verifica el UID **usando una fuente legítima** (ver 8.2) y registra nickname, región (si la fuente la da) y una nota de la fuente; o rechaza con motivo.
4. El cliente ve el nickname marcado **"Verificado por operador"** y debe confirmar "Sí, es mi cuenta" (`player_confirmed_at`).
5. Se habilita el pago.

### 8.2 Limitación explícita — **BLOQUEADO**
- **No existe en este proyecto una fuente legítima confirmada** para comprobar UID/nickname de Free Fire. El HTML menciona "LioGames" solo en textos de error; no hay documentación, contrato ni credenciales. **NO VERIFICADO.**
- Este plan **no define ni sugiere** ningún método de verificación.
- **Hasta que el propietario confirme una fuente legítima y autorizada** (R1), el paso 3 queda **BLOQUEADO**: el código del flujo se puede construir y probar, pero **no se habilitan ventas reales**.
- Si no existe una fuente legítima, la decisión C1 debe revisarse.

### 8.3 Futuro proveedor automático
- Interfaz `PlayerVerifier { verify(game, uid) → { status: 'verified'|'not_found'|'unavailable', nickname?, region?, source } }`.
- Implementación actual: `ManualPlayerVerifier` (el operador). **No** se crea un verificador automático hasta tener documentación y credenciales reales.
- Un endpoint público de consulta se añadiría con rate limit estricto y CAPTCHA activable (P25).

---

## 9. Entrega (fulfillment)

### 9.1 Manual (modo inicial, `FULFILLMENT_MODE=manual`)
1. Pago confirmado ⇒ orden `PAID` + alerta visual/sonora en el panel (C7).
2. El admin **reclama** la orden: `UPDATE orders SET status='DELIVERING', claimed_by=$admin, claimed_at=now() WHERE id=$1 AND status='PAID' RETURNING id`. Si no devuelve fila, otro proceso ya la reclamó: **imposible entregar dos veces por concurrencia**.
3. Entrega por el medio que use el operador (fuera del sistema; **no se modela ni se inventa**).
4. Marca cada ítem como `succeeded` con nota de evidencia; cuando todos lo están ⇒ `DELIVERED` y se dispara el evento de confeti en el cliente.
5. Entrega parcial o fallida ⇒ `NEEDS_REVIEW` (P21).

### 9.2 Proveedor automático futuro — **NO VERIFICADO, sin implementar**
```ts
interface FulfillmentProvider {
  createTopup(input: { idempotencyKey: string; sku: string; playerUid: string; quantity: number }): Promise<TopupResult>;
  getTopup(ref: string): Promise<TopupResult>;
}
```
- Requisitos para activarlo: documentación oficial, credenciales, confirmación de soporte de idempotencia y de consulta de estado.
- Reglas ya fijadas: timeout o respuesta ambigua ⇒ `unknown`, **nunca reintento ciego**; se consulta `getTopup` antes de decidir; sin resolución ⇒ `NEEDS_REVIEW`.
- En ese momento se añaden: tabla de mapeo de SKUs, cola de trabajos y, si conviene, un proceso worker separado.

---

## 10. Pagos — Wompi (C4, C5)

### 10.1 Estado
**PENDIENTE DE CONFIGURACIÓN y [A VERIFICAR].** No se implementa ningún detalle de Wompi hasta completar la verificación documental de 10.3. Mientras tanto, `POST /api/orders/:ref/pay` responde `503 PAYMENTS_NOT_CONFIGURED` y la UI muestra el botón de pago deshabilitado con ese texto. **Nunca se simula un pago aprobado fuera de los tests.**

### 10.2 Diseño independiente del proveedor
```ts
interface PaymentGateway {
  createAttempt(order): Promise<{ reference: string; clientParams: unknown }>; // lo que necesite el widget o la redirección
  verifyNotification(rawRequest): Promise<{ valid: boolean; transactionId?: string }>;
  fetchTransaction(transactionId): Promise<{ reference; amountMinor; currency; status; raw }>;
}
```
- Las llaves privadas y secretos **solo** en el servidor.
- El servidor genera la referencia del intento; un único intento abierto por orden (P2).
- El resultado del widget/redirección es **solo UX**: el estado solo cambia con datos que el servidor obtiene de Wompi (§11).

### 10.3 Lista de verificación contra la documentación oficial (antes de la Fase 8)

| # | Pregunta | Afecta a |
|---|---|---|
| W1 | ¿Widget, Web Checkout por redirección o ambos? Parámetros de cada uno | Decisión C4 |
| W2 | Dominios y directivas CSP que requiere cada opción | §13 |
| W3 | Algoritmo y campos exactos de la firma de integridad | `createAttempt` |
| W4 | Unidad del monto y monedas admitidas | Conversión en el adaptador |
| W5 | Estados de transacción y cuáles son finales | Mapeo de estados del intento |
| W6 | Métodos de pago disponibles y cuáles son asíncronos (plazos) | TTL de pago, UX |
| W7 | Parámetro de expiración del checkout: semántica | TTL de pago |
| W8 | Eventos/webhooks: tipos, payload, algoritmo de checksum, cabeceras, marca de tiempo, reintentos y respuesta esperada | `verifyNotification` |
| W9 | API de consulta de transacción: endpoint, autenticación | `fetchTransaction` |
| W10 | ¿Se puede buscar por referencia? | Reconciliación (P8) |
| W11 | Unicidad y reutilización de referencias tras un rechazo | Intentos |
| W12 | Parámetros de retorno de la redirección | Endpoint `sync` |
| W13 | Reembolsos/anulaciones: ¿API o solo panel? | C9 |
| W14 | Sandbox: URLs, prefijos de llaves, datos de prueba | Tests y staging |
| W15 | Requisitos de la cuenta comercial | R3 |

Resultado esperado: `docs/wompi-verificacion.md` con cada respuesta y el enlace a la página oficial correspondiente. **Acceso actual:** `docs.wompi.co` está bloqueado por la política de red del entorno de desarrollo (R3).

---

## 11. Webhooks y reconciliación (P7, P8)

1. `POST /api/webhooks/wompi` (ruta tentativa): verificar la firma con el secreto de eventos del ambiente (algoritmo **[A VERIFICAR W8]**; comparación en tiempo constante).
2. **Firma inválida** ⇒ responder con error, registrar en logs y métricas; **no escribir en BD**.
3. **Firma válida** ⇒ extraer el id de transacción y **consultar la transacción en Wompi** (`fetchTransaction`). El cuerpo del evento no es la fuente de verdad.
4. Aplicar en **una transacción**: `SELECT … FOR UPDATE` sobre la orden; actualizar el intento (`provider_tx_id` es `UNIQUE`); aplicar la transición permitida (§7.3) por CAS; escribir `audit_events`.
5. **Idempotencia natural:** repetir un evento produce el mismo resultado (el estado solo avanza; CAS falla sin efectos).
6. Referencia desconocida con firma válida ⇒ responder éxito para evitar reintentos infinitos [A VERIFICAR W8] + alerta al panel.
7. **`POST /api/orders/:ref/sync {transactionId}`**: el cliente, al volver del widget o de la redirección, aporta solo el id; el servidor consulta Wompi y exige que la referencia pertenezca a esa orden. Acelera la confirmación sin confiar en el cliente.
8. **Reconciliación periódica** (tarea programada): consulta en Wompi los intentos abiertos con `provider_tx_id`; los que no tengan id solo se pueden reconciliar si W10 lo permite. Si no, queda como **riesgo residual documentado**.

---

## 12. Concurrencia y transacciones

- Nivel `READ COMMITTED` (por defecto) + `SELECT … FOR UPDATE` en webhook/sync + **CAS de estado** (`WHERE status = $esperado RETURNING`). No se necesita `SERIALIZABLE`.
- Unicidades que impiden duplicados: `orders.checkout_key`, `payments.reference`, `payments.provider_tx_id`, índice parcial de intento abierto por orden, `fulfillments.order_item_id`.
- Tareas programadas con `pg_try_advisory_lock` (una sola ejecución aunque haya varias instancias).
- Escenarios cubiertos por tests: doble clic de checkout, dos webhooks simultáneos, webhook + `sync` simultáneos, dos pestañas del admin reclamando la misma orden, pago tardío sobre orden expirada, segundo pago aprobado.

---

## 13. Seguridad

| Área | Medida |
|---|---|
| **CSP** (P9) | Cabecera **estática**: `default-src 'self'; script-src 'self' [+Wompi W2]; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src [Wompi W2 o 'none']; form-action 'self' [+Wompi W2]; frame-ancestors 'none'; base-uri 'none'; object-src 'none'`. Mientras queden estilos inline, `style-src` incluye `'unsafe-inline'` temporalmente; **nunca** en `script-src` |
| Otras cabeceras | HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (`no-referrer` en vistas con token), `Permissions-Policy`, `Cross-Origin-Opener-Policy` |
| **CORS** | Deshabilitado (mismo origen) |
| **CSRF** | §6.4 |
| **Rate limiting** | Desde el día uno: global por IP; específico en checkout, consulta de orden, `sync`, OAuth y admin; por IP, email y UID (C6) |
| **CAPTCHA** (C12) | Interfaz `CaptchaVerifier` con `CAPTCHA_ENABLED=false`; proveedor **no elegido**; activable en checkout |
| Validación | Zod en todas las rutas; límite de tamaño de cuerpo; campos desconocidos rechazados |
| SQL injection | Solo consultas parametrizadas |
| XSS | `textContent`/`esc()`; revisión de cada `innerHTML` al modularizar; sin handlers inline |
| SSRF | Sin URLs proporcionadas por usuarios; se elimina `TGS_CONFIG.playerLookupUrl` |
| IDOR/BOLA | Propiedad en SQL; referencias aleatorias; `404` uniforme |
| Manipulación de precio/estado/IDs | El cliente no envía precios, totales, estados, `user_id`, roles ni nickname |
| Replay | `checkout_key`, unicidad de `provider_tx_id`, CAS, tokens con expiración |
| Secretos | Solo variables de entorno / gestor del hosting; `.env` ignorado; gitleaks en CI; logs con redacción |
| Privacidad | `ip_hash` con `IP_HASH_PEPPER`; minimización de PII; política de retención [POR DEFINIR con asesoría legal] |
| Dependencias | Lockfile; `audit` en CI |
| Errores | `{ error: { code, message, requestId } }`, sin trazas al cliente |

---

## 14. Panel administrativo (`/admin`)

Entrada Vite separada, mismos tokens visuales de TayGameStore, JS modular (P30). Un solo administrador (C11).

| Vista | Función |
|---|---|
| **Cola en vivo** | Órdenes `AWAITING_VERIFICATION`, `PAID`, `NEEDS_REVIEW`, pagos `needs_refund`. **Alerta visual y sonora** (C7) |
| Detalle de orden | Datos, ítems, intentos de pago, entregas, línea de tiempo (`audit_events`) |
| Verificación | Registrar nickname/región + nota de fuente, o rechazar con motivo (**BLOQUEADO para uso real hasta R1**) |
| Entrega | Reclamar, liberar, marcar ítems entregados con evidencia, enviar a revisión |
| Reembolsos | Registrar reembolso ejecutado en Wompi: quién, motivo, referencia externa (C9) |
| Catálogo | Productos, precios, promociones con vigencia, estado |
| Lista de bloqueo | Altas, bajas, expiración, motivo |
| Auditoría | Consulta de `audit_events` |
| Estado | Integraciones configuradas, interruptores (solo lectura al inicio) |

Alertas:
- Polling corto a `GET /api/admin/alerts?since=` (sin infraestructura extra; SSE más adelante si conviene).
- Sonido con Web Audio: los navegadores bloquean el audio sin interacción previa, así que el panel tendrá un botón **"Activar alertas"** al iniciar el turno [comportamiento del navegador; A VERIFICAR en los navegadores objetivo].
- Título de pestaña con contador; `Notification API` opcional con permiso.

Toda mutación genera `audit_events` con actor, antes/después y motivo cuando aplica.

---

## 15. Endpoints de la API

### Públicos
| Método y ruta | Auth | Notas |
|---|---|---|
| `GET /api/health` | — | Liveness |
| `GET /api/ready` | — | Readiness (BD) |
| `GET /api/config` | — | Horario, tiempo de entrega, soporte, interruptores, límites visibles, versión de términos, integraciones configuradas (sí/no). **Sin secretos** |
| `GET /api/catalog?game=` | — | Productos activos con precio vigente |

### Autenticación
| `GET /auth/google` · `GET /auth/google/callback` | — | OIDC + PKCE |
| `GET /api/auth/me` | sesión | |
| `POST /api/auth/logout` | sesión + CSRF | |

### Órdenes
| Método y ruta | Auth | Notas |
|---|---|---|
| `POST /api/checkout` | CSRF | Crea orden `AWAITING_VERIFICATION` (§7.2). Se conserva el nombre de ruta que ya usa el frontend |
| `GET /api/orders/:ref` | sesión o `X-Order-Token` | Estado y datos de la orden |
| `GET /api/orders` | sesión | Historial del cliente |
| `POST /api/orders/:ref/confirm-player` | propietario + CSRF | El cliente confirma el nickname verificado |
| `POST /api/orders/:ref/pay` | propietario + CSRF | Crea/reutiliza el intento abierto. **503 hasta la Fase 8** |
| `POST /api/orders/:ref/sync` | propietario + CSRF | `{ transactionId }` (Fase 8) |
| `POST /api/webhooks/wompi` | firma | Fase 8; ruta tentativa |

### Administración (`/api/admin/*`: sesión admin + TOTP + CSRF)
`POST /mfa/setup`, `POST /mfa/verify` · `GET /alerts` · `GET /orders`, `GET /orders/:id` · `POST /orders/:id/verify-player`, `/reject`, `/claim`, `/release`, `/items/:itemId/delivered`, `/needs-review`, `/refund` · `POST /payments/:id/refund` (duplicados) · `GET|POST|PATCH /products` · `GET|POST|DELETE /blocklist` · `GET /audit`.

**Eliminadas respecto a v1/HTML:** `/api/nickname`, `/api/player/lookup` (hasta que exista fuente automática), `/api/auth/register`, `/api/auth/login`, `/api/auth/csrf`, rutas OAuth de Facebook/Discord/VK, cancelación de orden, `?code=`.

---

## 16. Variables de entorno

`.env.example` con **nombres y descripción, sin valores** salvo los límites que el propietario ya fijó.

| Variable | Secreta | Notas |
|---|---|---|
| `NODE_ENV`, `PORT`, `LOG_LEVEL` | no | |
| `PUBLIC_BASE_URL` | no | Origen único; base de CSRF, cookies y OAuth |
| `TRUST_PROXY` | no | Según el hosting |
| `DATABASE_URL` | **sí** | |
| `SESSION_TTL_HOURS`, `SESSION_IDLE_MINUTES`, `ADMIN_SESSION_TTL_MINUTES` | no | [POR DEFINIR] |
| `ORDER_TOKEN_PEPPER`, `IP_HASH_PEPPER`, `MFA_ENCRYPTION_KEY` | **sí** | Generados por el propietario; rotación documentada |
| `ADMIN_EMAILS` | no | Correos con permiso de admin |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | secreto | PENDIENTE DE CONFIGURACIÓN (R5) |
| `CHECKOUT_ENABLED`, `MAINTENANCE_MODE` | no | Interruptores |
| `LIMIT_MAX_UNITS_PER_PRODUCT` | no | `5` |
| `LIMIT_MAX_ORDER_TOTAL_COP` | no | `1000000` |
| `LIMIT_MAX_OPEN_ORDERS_PER_EMAIL`, `LIMIT_MAX_OPEN_ORDERS_PER_UID` | no | [POR DEFINIR] |
| `RATE_LIMIT_IP_*`, `RATE_LIMIT_EMAIL_*`, `RATE_LIMIT_UID_*` | no | [POR DEFINIR] |
| `VERIFICATION_TTL_MINUTES`, `PAYMENT_TTL_MINUTES` | no | TTL **de la tienda**, no de Wompi; [POR DEFINIR] |
| `STORE_TIMEZONE` | no | `America/Bogota` |
| `STORE_HOURS` | no | Horario de atención (JSON) [POR DEFINIR] |
| `DELIVERY_ESTIMATE_MINUTES` | no | Tiempo realista [POR DEFINIR] |
| `SUPPORT_WHATSAPP`, `SUPPORT_EMAIL` | no | [POR DEFINIR] |
| `TERMS_VERSION`, `PRIVACY_VERSION` | no | Versión vigente de los textos legales |
| `FULFILLMENT_MODE` | no | `manual` |
| `CAPTCHA_ENABLED` | no | `false` |
| `CAPTCHA_*` | secreto | Proveedor no elegido |
| `PAYMENTS_ENABLED` | no | `false` hasta la Fase 8 |
| `WOMPI_*` | secretos | **Nombres definitivos tras la verificación W1–W15**; no se definen ahora |
| `MAIL_*` | secreto | PENDIENTE (C8) |
| `SENTRY_DSN` o equivalente | secreto | Opcional |

Validación al arrancar con Zod: en producción, falta de variable obligatoria ⇒ el proceso no arranca.

---

## 17. Testing

| Nivel | Herramienta | Cobertura mínima |
|---|---|---|
| Unitarias | Vitest | Dinero, precio vigente/promos, límites C6, máquina de estados (todas las transiciones válidas e inválidas), tokens, validadores |
| Integración | Vitest + PostgreSQL real (servicio en CI / Docker Compose local) | Repositorios, CAS, unicidades, advisory locks, expiración |
| API | `fastify.inject` | Auth Google (proveedor OIDC **simulado solo en tests**), admin + TOTP, CSRF, rate limit, blocklist, errores |
| Seguridad | Vitest | IDOR por referencia/token, manipulación de precio/estado/`user_id`/rol, CSRF sin cabecera, asociación de órdenes con correo no verificado, admin sin TOTP |
| Concurrencia | Vitest | Escenarios de §12 |
| Pagos | Vitest | **Bloqueado hasta W1–W15**; fixtures tomados de la documentación oficial, no inventados |
| E2E | Playwright | Tienda → orden → verificación (admin) → confirmación → pago (deshabilitado/sandbox) → entrega → comprobante |
| Visual | Playwright (capturas 360/768/1280) | Protege la identidad cinematográfica |
| Accesibilidad | axe-core | Modales, foco, teclado, contraste |
| Rendimiento | Lighthouse (manual al inicio) | Presupuesto de JS y `prefers-reduced-motion` |

**CI en cada push/PR:** instalar → lint → typecheck → unit + integración → build → E2E → audit de dependencias → gitleaks.

---

## 18. Despliegue y hosting (C3 — sin cerrar)

### 18.1 Requisitos
Proceso Node persistente · PostgreSQL gestionado con backups automáticos y **PITR** · TLS y dominio propio · gestión de secretos · logs · región con latencia razonable hacia Colombia · imagen Docker portable · ambientes `staging` y `production`.

### 18.2 Opciones (todas **[A VERIFICAR]** en precio, plan y región al contratar)

| | **A. PaaS gestionado (p. ej. Render)** | **B. DigitalOcean** | **C. AWS** |
|---|---|---|---|
| App | Web Service con imagen Docker | App Platform (o Droplet + Docker) | ECS Fargate (o Lightsail Containers) detrás de un balanceador |
| Postgres | Render Postgres (plan de pago con PITR) | Managed PostgreSQL (backups y PITR) | RDS for PostgreSQL (backups automáticos y PITR) |
| Secretos | Variables de entorno del servicio | Variables cifradas de App Platform | Secrets Manager / Parameter Store |
| Operación | La más simple | Simple, algo más de control | La más compleja |
| Escala futura | Buena | Buena | La mayor |
| Encaja si… | Hay un solo operador y se quiere mínima administración | Se quiere equilibrio coste/control | Ya hay experiencia en AWS o se prevé crecimiento fuerte |

**No recomendados** para el proceso principal: plataformas solo serverless/edge, porque el diseño necesita un proceso persistente con tareas programadas y conexiones a Postgres.

**Recomendación preliminar:** A o B para el lanzamiento con un solo operador. La imagen Docker y Postgres estándar permiten migrar a C sin cambios de código.

### 18.3 Común a cualquier opción
- Migraciones como paso de despliegue, nunca automáticas al arrancar.
- `staging` con Wompi sandbox; `production` con llaves reales.
- URL pública HTTPS del webhook registrada por ambiente.
- **Prueba de restauración PITR** antes del lanzamiento.
- Alertas: órdenes `PAID` sin reclamar más de N minutos, `NEEDS_REVIEW`, pagos `needs_refund`, firmas de webhook inválidas, errores 5xx.
- Rollback: imagen anterior + migraciones compatibles hacia atrás (expand/contract).

---

## 19. Estructura de carpetas

```
TayGameStore/
├─ legacy/index-cinematic-v4.html          # original congelado
├─ src/
│  ├─ web/
│  │  ├─ index.html                        # tienda (marcado actual)
│  │  ├─ admin/index.html                  # panel
│  │  ├─ store/{core,features,effects,a11y}/
│  │  ├─ admin/{views,core}/
│  │  └─ styles/{tokens,base,layout,components,cinematic,responsive,admin}.css
│  ├─ server/
│  │  ├─ index.ts · app.ts
│  │  ├─ config/                           # env (Zod), límites, interruptores
│  │  ├─ plugins/                          # headers/CSP · session · csrf · rate-limit · errors · logging
│  │  ├─ modules/                          # auth · catalog · checkout · orders · verification
│  │  │                                    # payments · fulfillment · refunds · blocklist
│  │  │                                    # admin · alerts · health · config · legal
│  │  ├─ integrations/
│  │  │  ├─ payments/        (interfaz; wompi/ tras la verificación)
│  │  │  ├─ fulfillment/     (interfaz; manual)
│  │  │  ├─ player/          (interfaz; manual)
│  │  │  ├─ identity/        (google)
│  │  │  ├─ mail/            (interfaz; nula)
│  │  │  └─ captcha/         (interfaz; desactivada)
│  │  ├─ scheduler/                        # expiración · reconciliación
│  │  ├─ db/{schema.ts,client.ts,migrations/}
│  │  ├─ lib/                              # money · crypto · ids · time
│  │  └─ cli/                              # create-admin · seed-products
│  └─ shared/                              # order-states · contratos Zod · códigos de error · money
├─ public/{fonts,legal}/                   # fuentes autoalojadas; páginas legales (texto pendiente)
├─ tests/{unit,integration,api,security,concurrency}/
├─ e2e/
├─ docker/{Dockerfile,compose.dev.yml}
├─ .github/workflows/ci.yml
├─ docs/{PLAN-ARQUITECTURA.md,wompi-verificacion.md,adr/,runbooks/}
├─ package.json · tsconfig.json · vite.config.ts · eslint.config.js
├─ .env.example · .gitignore · .editorconfig
└─ README.md
```

---

## 20. Orden de implementación

Cada fase termina con: proyecto ejecutable, tests de la fase en verde, informe (objetivo, archivos, cambios, tests, errores, pendientes).

| Fase | Contenido | Bloqueos |
|---|---|---|
| **0** | Repositorio, Node 24, `package.json`, lint, typecheck, CI, `.env.example`, `.gitignore`, `legacy/`, **capturas de referencia** | — |
| **1** | Modularizar el frontend en JS **sin cambiar comportamiento ni apariencia** | — |
| **2** | Limpieza del cliente (§4.3): demo solo en desarrollo, sin precios de respaldo, `localStorage` con lista blanca, confeti, indicadores honestos, sin `onclick`/estilos inline, "Comprobante", flujo de verificación asíncrono en la UI, accesibilidad de modales, fuentes autoalojadas | — |
| **3** | Servidor base: Fastify, config validada, logs, errores, cabeceras + CSP, estáticos, `/health`, `/ready`, `/config`, BD + migraciones, `audit_events`, scheduler, interruptores, rate limit base | — |
| **4** | Catálogo y promociones calculadas en servidor; CLI de carga | Datos reales (R4) para uso real |
| **5** | Google OAuth (clientes y admin), sesiones, CSRF, admin con TOTP, CLI `create-admin` | Cliente OAuth (R5) para probar fuera de tests |
| **6** | Checkout de invitado y cliente: `checkout_key`, token de orden, propiedad en SQL, límites C6, blocklist, rate limit IP/email/UID, términos | Valores [POR DEFINIR] |
| **7** | Panel admin: cola en vivo con alertas, verificación/rechazo, confirmación del cliente, reclamo/entrega/revisión, registro de reembolsos, catálogo, blocklist, auditoría | **Verificación real BLOQUEADA hasta R1** |
| **8** | Wompi: **8a** verificación documental W1–W15 → decisión C4; **8b** implementación sandbox: intentos, webhook, `sync`, reconciliación, pagos tardíos/duplicados | R3 (acceso a docs + cuenta/llaves sandbox) |
| **9** | Cuentas de cliente: historial, asociación de órdenes con correo verificado | — |
| **10** | Endurecimiento y staging: tests de seguridad y concurrencia completos, accesibilidad, responsive, rendimiento, hosting elegido (R2), backups + prueba PITR, runbooks | R2 |
| **11** | Lanzamiento: textos legales validados, correo transaccional (C8), compra real de bajo monto verificada de extremo a extremo | R1, R6, R7, validación legal/fiscal |
| **Después** | Email/WhatsApp para alertas, proveedor real de recargas y de verificación (solo con documentación real), cola + worker, CAPTCHA activo si hay abuso, ajustes editables en el panel, rol `support`, más juegos | Según necesidad |

Las Fases 0–7 pueden avanzar **sin credenciales externas** (OAuth se prueba con un proveedor simulado solo en tests hasta tener R5).

---

## 21. Procedimientos operativos a documentar (runbooks)

- Turno del operador: activar alertas, cola de verificación, cola de entrega.
- Pago aprobado sobre orden expirada o con discrepancia.
- Pago duplicado (`needs_refund`) y registro del reembolso.
- Recuperación de acceso de un invitado sin token (verificación de identidad mínima, sin exponer datos).
- Activar `CHECKOUT_ENABLED=false` / modo mantenimiento.
- Rotación de secretos (peppers, MFA, llaves de Wompi, OAuth).
- Restauración PITR.
- Alta y baja en la lista de bloqueo.

---

## 22. Pendientes por infraestructura, credenciales o decisión

| # | Elemento | Estado |
|---|---|---|
| R1 | Fuente legítima para verificar UID/nickname | **BLOQUEADO / NO VERIFICADO** |
| R2 | Hosting (A/B/C) | Decisión pendiente |
| R3 | Acceso a `docs.wompi.co` desde el entorno, cuenta comercial y llaves sandbox | **PENDIENTE DE CONFIGURACIÓN** |
| R4 | Catálogo y precios reales; horario; tiempo de entrega; TTLs; límites [POR DEFINIR]; canales de soporte | Pendiente del propietario |
| R5 | Cliente OAuth de Google y `ADMIN_EMAILS` | **PENDIENTE DE CONFIGURACIÓN** |
| R6 | Dominio y DNS | Pendiente |
| R7 | Proveedor de correo (antes del lanzamiento) | Pendiente |
| R8 | Textos de términos, privacidad y reembolsos; política de retención de datos (Ley 1581) | Validación legal |
| R9 | Tratamiento tributario (IVA) y presentación de precios; no se afirma facturación electrónica | Validación contable |
| R10 | Proveedor de recargas automático | **NO VERIFICADO** (no se implementa) |
| R11 | Proveedor de CAPTCHA | Sin elegir (desactivado) |

---

## 23. Riesgos

| Riesgo | Mitigación |
|---|---|
| Sin fuente legítima de verificación no hay ventas | Bloqueo explícito (§8.2); revisar C1 si no existe |
| Verificación manual y entrega manual añaden latencia | Horario y tiempo realista visibles; alertas en el panel |
| Detalles de Wompi sin contrastar | Fase 8a obligatoria; nada de Wompi se codifica antes |
| Pagos asíncronos o tardíos | "El pago gana" + `NEEDS_REVIEW` solo ante discrepancias |
| Doble cobro | Un intento abierto por orden + `needs_refund` |
| Contracargos/fraude | Límites C6, blocklist, rate limit, verificación previa; procedimiento de contracargos con Wompi |
| Regresión visual | Capturas de referencia antes de cualquier cambio |
| Pérdida de datos | Postgres gestionado con PITR y prueba de restauración |
| Un solo operador | Interruptor de checkout y horario visible; alertas futuras por email/WhatsApp |

---

*Fin de la versión 2. Siguiente paso: resolver R1–R2 (y, para avanzar sin bloqueos, los valores R4 básicos). La Fase 0 no empieza hasta la aprobación del propietario.*
