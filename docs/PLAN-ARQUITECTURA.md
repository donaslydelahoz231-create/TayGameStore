# TayGameStore — Plan técnico de arquitectura para producción

> **Estado:** documento de planificación. **No hay código implementado.**
> **Fuente de verdad:** el análisis del único archivo disponible, `TayGameStore-index-cinematic-v4.html` (SPA de un solo archivo, 1296 líneas). El repositorio está vacío: **no existe backend, base de datos, tests ni CI**. Todo lo descrito como "backend" es **diseño propuesto**, no existente.
> **Fecha:** 2026-10-05

## Convenciones de este documento

| Marca | Significado |
|---|---|
| **[DECISIÓN Dn]** | Requiere confirmación del propietario antes de implementar. Se resumen en el §0. |
| **[A VERIFICAR]** | Dato externo (Wompi, proveedor, librerías) que no pude comprobar en este entorno. Debe contrastarse con la documentación oficial antes de codificar. |
| **PENDIENTE DE CONFIGURACIÓN** | Depende de credenciales, cuentas o infraestructura que no existen todavía. |
| **NO VERIFICADO** | No hay evidencia de que funcione. |

Nada de lo que sigue asume que un proveedor de recargas, Wompi u OAuth estén configurados.

---

## 0. Decisiones que necesitan confirmación

| # | Decisión | Recomendación | Impacto si se cambia |
|---|---|---|---|
| D1 | Lenguaje/framework del backend | Node 22 LTS + TypeScript + Fastify | Todo el backend |
| D2 | Acceso a datos | PostgreSQL + Drizzle ORM (migraciones SQL versionadas) | Capa de datos; alternativa: Kysely o SQL puro |
| D3 | Frontend | **Conservar JS vanilla**, modularizado con Vite + TypeScript. **No migrar a React/Next** | Si se quiere React, es una fase aparte y costosa |
| D4 | Hosting / despliegue | Un único origen (API sirve el frontend compilado) en un PaaS con Postgres gestionado, o VPS con Docker + Caddy | Costos, backups, CORS |
| D5 | Cola de trabajos | `pg-boss` (usa Postgres, sin Redis) | Si ya hay Redis: BullMQ |
| D6 | Modo de entrega inicial | `FULFILLMENT_MODE=manual` (el operador entrega y marca desde el panel). El modo `provider` se activa solo cuando exista proveedor documentado | Define si se puede lanzar sin proveedor |
| D7 | Proveedor de recargas | **Sin definir.** El HTML menciona "LioGames" solo en mensajes de error; no hay prueba de que exista, tenga API ni credenciales | Bloquea la entrega automática y la verificación real |
| D8 | Política de verificación de jugador | Si no hay proveedor: estado **NO VERIFICADO** y el usuario debe confirmar explícitamente que el UID es correcto. ¿Se permite comprar así? | Riesgo de entregas a UID equivocado |
| D9 | Compra como invitado | Permitida, con correo obligatorio y token de acceso a la orden (no el `?code=` actual) | Superficie de acceso a órdenes |
| D10 | Proveedores OAuth | Lanzar con **solo Google** (o ninguno). Facebook, Discord y VK después, o eliminarlos | Menos secretos y menos superficie |
| D11 | Correo transaccional | Necesario (verificación, recuperación, comprobante). Proveedor sin elegir | Bloquea reset de contraseña y comprobantes |
| D12 | MFA del administrador | Obligatorio (TOTP) para roles `admin` y `support` | Seguridad del panel |
| D13 | Promociones | El toggle "Normal/Promo" que el cliente elige hoy **desaparece como decisión del cliente**: el servidor aplica la promo solo si está vigente | Cambia el flujo y la UI del toggle |
| D14 | Reembolsos | Proceso manual desde el panel de Wompi; el panel admin solo registra el estado | Política comercial |
| D15 | Facturación | Renombrar "Factura digital" a **"Comprobante"** hasta integrar facturación electrónica (DIAN) con un facturador autorizado | Texto legal de la UI; requiere asesoría contable |
| D16 | Cuenta Wompi | Requiere cuenta comercial aprobada. Empezar con **sandbox** | Bloquea pruebas reales de pago |
| D17 | Alcance de lanzamiento | Solo Free Fire (el HTML ya marca Roblox, PUBG y Mobile Legends como "próximamente") | Alcance del catálogo |
| D18 | Tipografías | Autoalojar Oxanium y Plus Jakarta Sans (privacidad + CSP estricta) | Cambia `font-src`/`style-src` |
| D19 | Cumplimiento | Política de privacidad, términos y reembolsos (Ley 1581 de 2012, Habeas Data, y normas de consumidor) | Requiere revisión legal; no es consejo legal |

---

## 1. Stack recomendado

| Capa | Elección | Justificación |
|---|---|---|
| Monorepo | pnpm workspaces | Código compartido (contratos, máquina de estados) sin duplicar |
| Frontend | HTML/CSS/JS actuales → módulos TS + **Vite** | Conserva marcado, clases y animaciones; solo se separa y se tipa |
| Backend | Node 22 LTS, TypeScript, **Fastify** | Validación por esquema, hooks de seguridad, rendimiento; ligero |
| Validación | **Zod** (compartido front/back) | Un solo contrato para ambos lados |
| BD | **PostgreSQL 16** | Transacciones, restricciones, `SELECT … FOR UPDATE`, JSONB |
| ORM/migraciones | **Drizzle** + `drizzle-kit` | Migraciones SQL revisables [DECISIÓN D2] |
| Cola | **pg-boss** | Entrega asíncrona e idempotente sin infraestructura extra [D5] |
| Contraseñas | **argon2id** | Estándar actual de hashing |
| Sesiones | Opacas en BD (no JWT) | Revocables, sin secretos en el cliente |
| Tests | Vitest, Playwright, axe-core, Testcontainers | Ver §13 |
| Calidad | ESLint, typescript-eslint, Prettier | Hoy no existe nada |
| CI | GitHub Actions | El repositorio ya está en GitHub |
| Contenedores | Docker + Compose (desarrollo) | Reproducibilidad |

> Las versiones concretas **no se fijan aquí**; se fijarán al instalar y se registrarán en el lockfile.

**Por qué no reescribir en React/Next.js:** el frontend actual funciona como una SPA cinematográfica con CSS y animaciones propias. Reescribirlo no aporta seguridad (el problema no está en el framework, sino en que la lógica crítica está en el cliente) y arriesga la identidad visual.

---

## 2. Arquitectura frontend / backend

### 2.1 Principio rector
**El cliente muestra; el servidor decide.** Precio, descuento, total, estado de pago, estado de orden, identidad, rol, resultado de entrega y verificación de jugador se calculan y validan solo en el servidor.

### 2.2 Vista general

```
Navegador (SPA TayGameStore + /admin)
        │  HTTPS, mismo origen (sin CORS)
        ▼
Reverse proxy / PaaS (TLS, HSTS)
        ▼
┌─────────────────────── Proceso `api` (Fastify) ───────────────────────┐
│ plugins: helmet+CSP(nonce) · cookies · sesión · CSRF · rate-limit ·    │
│          errores · logging(pino, redacción de secretos)                │
│ módulos: auth · catalog · pricing · player · orders · payments ·       │
│          webhooks · fulfillment · admin · support · health             │
│ estáticos: apps/web compilado                                          │
└──────────────┬───────────────────────────────┬─────────────────────────┘
               │                               │
        PostgreSQL 16                 Proceso `worker` (pg-boss)
               ▲                               │
               └───────────────────────────────┤
                                               ├─► Wompi (API + webhook entrante)
                                               └─► Proveedor de recargas (adaptador)
```

- **Mismo origen:** la API sirve el frontend compilado. Elimina CORS, simplifica cookies `SameSite` y CSRF. Si se separan dominios, hay que rediseñar CORS/cookies **[DECISIÓN D4]**.
- **Dos procesos, una imagen:** `api` (HTTP) y `worker` (trabajos de entrega y reconciliación).

### 2.3 Estrategia de frontend (strangler, sin reemplazar)
1. Congelar el HTML original en `legacy/` como referencia y capturar **capturas de referencia** (desktop/tablet/móvil) para detectar regresiones visuales.
2. Extraer CSS a archivos (`tokens`, `base`, `layout`, `components`, `cinematic`, `responsive`) **sin cambiar reglas**.
3. Extraer JS a módulos manteniendo funciones y nombres; los 3 bloques `<script>` pasan a `core/`, `features/` y `effects/`.
4. Cambios funcionales **solo** en la capa `core/api` y en los puntos de contrato listados en §2.4.
5. Reemplazar los 29 `onclick` inline por `addEventListener` (necesario para una CSP sin `unsafe-inline`).

### 2.4 Cambios de contrato frontend ↔ backend (derivados de la auditoría)

| Hoy en el HTML | Problema | Pasa a ser |
|---|---|---|
| `?demo=1` / `file:` activa pagos y jugador simulados | Comprobantes falsos en producción | Flag de **build** (`VITE_DEMO`), ausente del build de producción |
| `FALLBACK_FREEFIRE` con precios fijos | Precios inventados | Eliminado; catálogo vacío ⇒ estado "catálogo no disponible" |
| `localStorage`: órdenes, historial, `verified`, `currentOrder`, nombre, correo, UID | Fuente de verdad en el cliente + PII + `Object.assign(state, s)` sin lista blanca | Solo favoritos y preferencias de UI (con lista blanca). Órdenes/historial vienen del servidor |
| `?code=` + `hashCode()` FNV de 32 bits como "código" | Predecible; viaja en la URL | Token aleatorio de alta entropía en cabecera `X-Order-Token`, o sesión |
| `nickname` enviado por el cliente en `/api/checkout` | El cliente no es autoridad | `playerVerificationToken` firmado por el servidor (§6.3) |
| `tariff` elegido por el cliente | Manipulable | El servidor decide la promo vigente [D13] |
| `window.TGS_CONFIG.playerLookupUrl` + `/api/nickname` | URL externa configurable (SSRF/exfiltración) | Eliminado. Una sola ruta `/api/player/lookup` |
| `window.state` en el script cinematográfico (no existe) | Bug: el confeti nunca se dispara | Evento `tgs:order-fulfilled` emitido por el módulo de órdenes |
| Latencia `24 ms` y "Sistemas activos" fijos en el HTML | Indicadores falsos | Mostrar solo datos de `/api/health` o no mostrar |
| Polling doble (5 s y 15 s) | Duplicado, sin estado final tras 15 min | Un solo poller con backoff; refresco al volver a la pestaña |
| Modales sin `role="dialog"`/`aria-modal`/focus trap | Accesibilidad | Módulo `a11y/modal` |

---

## 3. Base de datos y esquema inicial

PostgreSQL. **Dinero en enteros** (`bigint`), unidad **centavos** de COP, coherente con `amount_in_cents` de Wompi **[A VERIFICAR]**. Moneda inicial: solo `COP`. Nunca `float`.

### 3.1 Tablas

```
users              id uuid PK, email citext UNIQUE, email_verified_at, password_hash NULL,
                   name, role ('customer'|'support'|'admin'), status ('active'|'disabled'),
                   mfa_secret_enc NULL, mfa_enabled_at NULL, created_at, updated_at
oauth_identities   id, user_id FK, provider, provider_user_id, UNIQUE(provider, provider_user_id)
sessions           id, token_hash bytea UNIQUE, user_id FK NULL, csrf_secret, created_at,
                   last_seen_at, expires_at, revoked_at NULL, ip_hash, user_agent
email_tokens       id, user_id FK, purpose ('verify'|'reset'), token_hash UNIQUE, expires_at, used_at

games              id, slug UNIQUE, name, unit_label, status ('live'|'soon'|'disabled'), sort
products           id uuid, game_id FK, sku UNIQUE, name, description, tag, units int,
                   status ('draft'|'active'|'archived'), sort
product_prices     id, product_id FK, kind ('base'|'promo'), amount_cents bigint CHECK (>0),
                   currency CHECK ('COP'), starts_at, ends_at NULL, status
provider_products  id, product_id FK, provider, provider_sku, cost_cents NULL,
                   verified_at NULL, active          -- verified_at NULL ⇒ no vendible por proveedor

orders             id uuid, public_ref UNIQUE (aleatoria, no secuencial), user_id FK NULL,
                   customer_name, customer_email, game_id FK,
                   player_uid, player_nickname NULL, player_region NULL,
                   player_verification ('verified'|'unverified'),
                   subtotal_cents, discount_cents, total_cents CHECK (total = subtotal - discount),
                   currency, status order_status, cart_hash, access_token_hash NULL,
                   expires_at, version int, created_at, updated_at, paid_at, fulfilled_at
order_items        id, order_id FK, product_id FK, product_name_snapshot, units_snapshot,
                   unit_price_cents, quantity CHECK (1..99), line_total_cents
order_events       id bigserial, order_id FK, type, from_status, to_status,
                   actor_type ('system'|'customer'|'admin'|'webhook'), actor_id, data jsonb, created_at
                   -- append-only (sin UPDATE/DELETE para el rol de la app)

payments           id, order_id FK, provider ('wompi'), reference UNIQUE, attempt int,
                   amount_cents, currency, status payment_status,
                   provider_tx_id UNIQUE NULL, provider_status, raw jsonb, created_at, updated_at
webhook_events     id, provider, dedupe_key UNIQUE, event_type, signature_valid bool,
                   payload jsonb, received_at, processed_at NULL, error NULL
fulfillments       id, order_item_id FK, provider ('manual'|<nombre>), provider_ref NULL,
                   status ('pending'|'in_progress'|'unknown'|'succeeded'|'failed'),
                   attempts int, idempotency_key uuid UNIQUE, last_error, completed_at,
                   completed_by_user_id NULL
idempotency_keys   scope, key, endpoint, request_hash, response_status, response_body,
                   order_id NULL, created_at, expires_at, PRIMARY KEY (scope, key)

audit_log          id, actor_user_id, action, entity, entity_id, before jsonb, after jsonb, ip, created_at
settings           key PK, value jsonb      -- canales de soporte, flags operativos
```

(`pg-boss` crea su propio esquema para la cola.)

### 3.2 Reglas de integridad
- `UNIQUE(provider_tx_id)` y `UNIQUE(webhook_events.dedupe_key)` impiden procesar dos veces el mismo pago/evento.
- `CHECK` de totales y de cantidad; precios con `> 0`.
- Los precios del pedido se **copian** en `order_items` (snapshot): cambiar el catálogo no altera órdenes pasadas.
- Índices: `orders(user_id, created_at)`, `orders(status, expires_at)`, `payments(order_id)`, `order_events(order_id)`.
- El rol de BD de la aplicación **no** puede borrar de `order_events` ni `audit_log`.
- Migraciones solo hacia adelante y revisadas; ninguna migración destructiva sin copia de seguridad previa.

---

## 4. Autenticación y autorización

### 4.1 Cuentas
- Registro y login con correo + contraseña: **argon2id**, longitud mínima 12, máximo razonable (p. ej. 128) para evitar DoS por hashing, comprobación contra contraseñas filtradas si se dispone de un servicio **[A VERIFICAR]**.
- Verificación de correo y recuperación de contraseña con tokens de un solo uso (hash en BD, expiración corta). **PENDIENTE DE CONFIGURACIÓN** [D11].
- Respuestas de login/registro/reset **sin enumeración de usuarios**; mismo mensaje y tiempos similares.
- Bloqueo progresivo por cuenta e IP además del rate limit global.

### 4.2 Sesiones
- Token **opaco de 256 bits** generado con CSPRNG; en BD solo se guarda su **hash**.
- Cookie `__Host-tgs_sid`: `HttpOnly; Secure; SameSite=Lax; Path=/`, sin `Domain`.
- Rotación del identificador al iniciar sesión y al elevar privilegios; expiración absoluta e inactividad; cierre de sesión revoca en BD.
- Sesión de **invitado** solo para el flujo de compra (sin privilegios).

### 4.3 CSRF
- Todas las peticiones que modifican estado exigen cabecera `X-TGS-CSRF` (valor ligado a la sesión) **y** validación de `Origin`/`Sec-Fetch-Site`.
- `GET` nunca cambia estado.

### 4.4 OAuth
- Authorization Code + **PKCE**, `state` y `nonce` verificados, redirect URIs exactas, vinculación por `provider_user_id` y correo **verificado** del proveedor.
- Lanzar solo con los proveedores confirmados **[D10]**. Cada uno requiere crear una app en su consola: **PENDIENTE DE CONFIGURACIÓN**.
- Hasta que un proveedor esté configurado, su botón se muestra **deshabilitado** (el HTML ya contempla `aria-disabled`).

### 4.5 Autorización (RBAC)

| Recurso / acción | Anónimo/Invitado | customer | support | admin |
|---|---|---|---|---|
| Ver catálogo | ✔ | ✔ | ✔ | ✔ |
| Crear checkout | ✔ (con correo) | ✔ | — | — |
| Ver **su** orden | con token de orden | si `order.user_id = sesión` | ✔ (solo lectura) | ✔ |
| Listar órdenes de otros | ✘ | ✘ | ✔ | ✔ |
| Marcar entrega manual / reintentar | ✘ | ✘ | ✔ | ✔ |
| Registrar reembolso | ✘ | ✘ | ✘ | ✔ |
| Editar catálogo, precios, promos | ✘ | ✘ | ✘ | ✔ |
| Gestionar usuarios/roles/ajustes | ✘ | ✘ | ✘ | ✔ |

- **El rol y el `user_id` salen siempre de la sesión.** Cualquier `user_id`, `role`, `status` u `order_id` recibido en el cuerpo se ignora o se rechaza.
- Toda consulta de orden filtra por propietario en SQL (`WHERE id = $1 AND (user_id = $2 OR token_hash = $3)`), no tras cargar el registro (evita IDOR/BOLA).
- Las cuentas `admin`/`support` **no** se crean por el registro público: se crean con un comando de CLI (`create-admin`) y exigen MFA [D12].

---

## 5. Productos y órdenes

### 5.1 Catálogo y precios
- El catálogo vive en BD, administrado desde el panel. **No hay precios en el código ni en el frontend.**
- `GET /api/catalog?game=` devuelve solo productos `active` con su precio vigente y la disponibilidad (`purchasable`), calculada en el servidor.
- Un producto solo es comprable si: está `active`, tiene precio vigente y (en modo `provider`) su mapeo con el proveedor tiene `verified_at`.
- **Promociones:** `product_prices.kind='promo'` con `starts_at/ends_at`. El servidor elige el precio vigente en el momento de crear la orden [D13].

### 5.2 Cálculo de la orden (servidor)
1. Validar entrada con Zod: `items[{productId, quantity 1..99}]`, un solo juego por orden, UID válido.
2. Cargar productos y precios **desde BD**; rechazar productos inactivos o de otro juego.
3. Calcular `subtotal`, `discount` y `total` en enteros.
4. Si el cliente envía `expectedTotalCents` y difiere ⇒ `409 PRICE_CHANGED` con los valores reales (el cliente **no** es autoridad; el valor solo evita sorpresas).
5. Crear `orders` + `order_items` con snapshot y `expires_at` (p. ej. 30 min **[DECISIÓN de negocio]**).

### 5.3 Máquina de estados de la orden

Estados: `AWAITING_PAYMENT`, `PAID`, `FULFILLING`, `FULFILLED`, `PAYMENT_DECLINED`, `PAYMENT_VOIDED`, `PAYMENT_ERROR`, `EXPIRED`, `CANCELLED`, `NEEDS_REVIEW`, `REFUND_PENDING`, `REFUNDED`.

| Desde | Hacia | Disparador |
|---|---|---|
| `AWAITING_PAYMENT` | `PAID` | Pago `APPROVED` confirmado por el servidor |
| `AWAITING_PAYMENT` | `PAYMENT_DECLINED` / `PAYMENT_VOIDED` / `PAYMENT_ERROR` | Resultado de Wompi |
| `AWAITING_PAYMENT` | `EXPIRED` | Job de expiración |
| `AWAITING_PAYMENT` | `CANCELLED` | Cliente (antes de pagar) |
| `PAYMENT_DECLINED`, `PAYMENT_ERROR` | `AWAITING_PAYMENT` | Nuevo intento de pago dentro de la vigencia |
| `PAID` | `FULFILLING` | Se encola la entrega |
| `PAID` | `NEEDS_REVIEW` | Monto/moneda no coincide, producto sin proveedor verificado, etc. |
| `FULFILLING` | `FULFILLED` | Entrega confirmada |
| `FULFILLING` | `NEEDS_REVIEW` | Fallo o resultado desconocido |
| `NEEDS_REVIEW` | `FULFILLING` / `FULFILLED` | Admin: reintento / entrega manual (auditado) |
| `NEEDS_REVIEW`, `FULFILLED` | `REFUND_PENDING` → `REFUNDED` | Admin [D14] |

Reglas:
- **Solo avance válido.** Cualquier otra transición se rechaza y se registra.
- **Pago aprobado sobre orden `EXPIRED`/`CANCELLED`:** el dinero llegó ⇒ se guarda el pago y la orden pasa a `NEEDS_REVIEW` (nunca se descarta en silencio).
- Cada transición: `UPDATE orders SET status=$nuevo, version=version+1 WHERE id=$1 AND status=$esperado AND version=$v` (compare-and-swap) + fila en `order_events`, en la misma transacción.
- La UI traduce estados con un mapa único (hoy `humanStatus` solo conoce 7 y usa `APPROVED`; se actualiza al nuevo conjunto).

### 5.4 Idempotencia y doble checkout
- `POST /api/checkout` exige `Idempotency-Key` (UUID generado por el cliente por intento de compra). Se guarda `(scope, key, request_hash, respuesta)`:
  - misma clave + mismo cuerpo ⇒ devuelve la respuesta guardada;
  - misma clave + cuerpo distinto ⇒ `422`.
- Además, `cart_hash` evita crear órdenes abiertas duplicadas para el mismo carrito y jugador: se reutiliza la orden `AWAITING_PAYMENT` vigente.
- El botón deshabilitado del cliente (`paymentBusy`) queda como mejora de UX, **no** como protección.

---

## 6. Sistema de recargas (fulfillment) y verificación de jugador

### 6.1 Abstracción de proveedor

```ts
interface FulfillmentProvider {
  name: string;
  getStatus(): Promise<'online' | 'offline' | 'not_configured'>;
  createTopup(input: { idempotencyKey: string; providerSku: string; playerUid: string; quantity: number }): Promise<TopupResult>;
  getTopup(providerRef: string): Promise<TopupResult>;   // para resolver resultados 'unknown'
}
interface PlayerLookupProvider {
  lookup(game: GameSlug, uid: string): Promise<{ found: boolean; nickname?: string; region?: string; sources: string[] }>;
}
```

Implementaciones previstas:

| Implementación | Estado | Notas |
|---|---|---|
| `ManualFulfillment` | Propuesta, sin dependencias externas | El operador entrega y marca en el panel; auditado |
| `DisabledProvider` / `DisabledPlayerLookup` | Propuesta | Devuelven `not_configured`; **no inventan datos** |
| `MockProvider` | Solo `NODE_ENV=test`, excluido del build de producción | Para pruebas |
| Proveedor real (¿LioGames?) | **NO VERIFICADO / PENDIENTE DE CONFIGURACIÓN** | Sin documentación, credenciales ni evidencia de API [D7] |

### 6.2 Entrega segura (sin doble entrega)
1. Al pasar a `PAID`, se crea un `fulfillment` por ítem con `idempotency_key` propia y se encola el trabajo.
2. El worker reclama el registro de forma atómica (`UPDATE … SET status='in_progress' WHERE status='pending' RETURNING`).
3. Llama al proveedor con la `idempotency_key` (si el proveedor la soporta **[A VERIFICAR]**).
4. **Timeout o respuesta ambigua ⇒ estado `unknown`, nunca reintento ciego.** Se consulta `getTopup` antes de decidir; si no se puede resolver ⇒ `NEEDS_REVIEW`.
5. Éxito ⇒ `FULFILLED`, evento de auditoría y correo de comprobante.
6. Reintentos con backoff acotado; tras N fallos ⇒ `NEEDS_REVIEW`.

### 6.3 Verificación de jugador
- `GET /api/player/lookup?uid=` con rate limit estricto. Responde `status`:
  - `verified` (solo si un proveedor real devolvió datos),
  - `unverified` / `provider_not_configured` (**el nickname y la región no se inventan**).
- Si `verified`, el servidor emite un **`playerVerificationToken`** firmado (HMAC) con `{game, uid, nickname, region, exp corto}`. `/api/checkout` lo exige y copia los datos a la orden; el `nickname` enviado por el cliente se ignora.
- Si no hay proveedor, la UI muestra explícitamente **"NO VERIFICADO"** y aplica la política D8.
- Una verificación por UID **no prueba que la cuenta pertenezca al comprador**; no se afirma lo contrario en la UI.

---

## 7. Integración con Wompi

> **[A VERIFICAR] contra https://docs.wompi.co.** No pude acceder a esa documentación desde este entorno (bloqueo de red), así que lo que sigue es el diseño y mi conocimiento previo, **no una confirmación**. Antes de codificar hay que contrastar: algoritmo exacto de la firma de integridad, formato y orden del checksum del evento, cabeceras, URLs sandbox/producción, estados y reglas de unicidad de `reference`.

### 7.1 Flujo
1. El cliente llama `POST /api/checkout`. El servidor crea la orden y un `payment` (intento) con `reference` única y devuelve **solo**: moneda, `amountInCents`, `reference`, llave **pública**, firma de integridad, expiración y `redirectUrl`.
2. El cliente abre el widget de Wompi con esos valores.
3. El resultado del widget es **solo UX**: no cambia el estado de la orden.
4. El estado real llega por **webhook** y se confirma consultando la API de Wompi (§8).
5. El cliente consulta `GET /api/orders/:ref` hasta estado final.

### 7.2 Reglas
- Llaves: pública en el cliente; **privada, secreto de integridad y secreto de eventos solo en el servidor** (variables de entorno, nunca en el repositorio ni en el HTML).
- Firma de integridad calculada en el servidor con el secreto de integridad (concatenación y hash **[A VERIFICAR]**).
- `reference` única por intento (p. ej. `<public_ref>-<attempt>`) **[A VERIFICAR si Wompi permite reutilizar referencias]**.
- Ambientes separados: `WOMPI_ENV=sandbox|production`, llaves distintas, URL de webhook distinta por ambiente.
- Estados de transacción esperados (`PENDING`, `APPROVED`, `DECLINED`, `VOIDED`, `ERROR`) **[A VERIFICAR]**.
- Mientras no existan llaves: el endpoint responde `503 WOMPI_NOT_CONFIGURED` y el botón de pago queda deshabilitado con el texto **PENDIENTE DE CONFIGURACIÓN**. **No se simula un pago aprobado.**

---

## 8. Webhooks e idempotencia

`POST /api/webhooks/wompi` (sin sesión ni CSRF; autenticada por firma):

1. Leer el cuerpo; **rechazar con 4xx si la firma/checksum es inválida** (comparación en tiempo constante, secreto de eventos del ambiente actual) **[A VERIFICAR el algoritmo]**.
2. Insertar en `webhook_events` con `dedupe_key` única (p. ej. id de transacción + estado + marca de tiempo del evento). Si ya existe ⇒ responder `200` sin reprocesar (replay inofensivo).
3. **No confiar solo en el cuerpo del evento:** consultar la transacción en la API de Wompi con la llave privada y comparar `reference`, monto, moneda y estado.
4. En **una transacción** de BD: bloquear la orden (`FOR UPDATE`), validar que `payment.amount_cents` y moneda coinciden con la orden, aplicar la transición permitida (§5.3), registrar `order_events`, encolar la entrega.
5. Responder `200` rápido; el trabajo pesado va a la cola.
6. Eventos fuera de orden: el estado solo avanza; un `PENDING` tardío no retrocede un `APPROVED`.
7. **Job de reconciliación** (cada pocos minutos): consulta en Wompi los pagos `AWAITING_PAYMENT` antiguos por si el webhook se perdió, y expira órdenes vencidas.
8. Fallos de procesamiento se guardan en `webhook_events.error` para reintento manual desde el panel.

---

## 9. Seguridad

| Área | Medida |
|---|---|
| **CSP** | Cabecera HTTP (no `<meta>`), con **nonce** por respuesta; sin `unsafe-inline` en scripts; `frame-ancestors 'none'`; `connect-src 'self'`; `frame-src`/`script-src` limitados al dominio de Wompi **[A VERIFICAR los dominios exactos]**; fuentes autoalojadas [D18] |
| **Otras cabeceras** | HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` |
| **CORS** | Mismo origen ⇒ **deshabilitado por defecto**. Si se separa el frontend, lista blanca explícita, nunca `*` con credenciales |
| **CSRF** | Cabecera + `Origin`/`Sec-Fetch-Site` (§4.3) |
| **Rate limiting** | Por IP y por cuenta; límites estrictos en login, registro, reset, `player/lookup`, `checkout` y webhook. Con varias instancias, almacén compartido [A decidir con el hosting] |
| **Validación** | Zod en cada ruta; tamaño máximo de cuerpo; `additionalProperties` rechazado |
| **SQL injection** | Solo consultas parametrizadas (ORM); prohibido concatenar SQL |
| **XSS** | Mantener `esc()`/`textContent`; revisar los `innerHTML` al modularizar; sin handlers inline |
| **SSRF** | El servidor no hace peticiones a URLs recibidas del usuario; se elimina `playerLookupUrl` |
| **IDOR/BOLA** | Filtro de propietario en SQL (§4.5); referencias públicas aleatorias |
| **Manipulación de precio/estado** | Imposible por diseño: el cliente solo envía `productId` y `quantity` |
| **Replay** | Idempotency-Key, `dedupe_key` de webhooks, expiración de tokens firmados |
| **Secretos** | Solo variables de entorno; `.env` en `.gitignore`; escaneo con gitleaks en CI; logs con redacción (`authorization`, `cookie`, llaves, contraseñas) |
| **Dependencias** | `pnpm audit` y revisión de lockfile en CI; versiones fijadas |
| **Privacidad** | Minimizar PII; `ip_hash`, no IP en claro; política de retención; política de privacidad publicada [D19] |
| **Errores** | Respuestas con códigos estables y sin trazas; detalles solo en logs |
| **Panel admin** | MFA, sesión corta, auditoría de toda mutación, opcionalmente lista de IP permitidas |

---

## 10. Panel administrativo

Ruta `/admin` (mismo origen), visual coherente con TayGameStore (mismos tokens CSS), JS vanilla modular. Solo roles `support` y `admin`, con MFA [D12].

| Módulo | Función | Roles |
|---|---|---|
| Resumen | Órdenes por estado, pagos pendientes, entregas fallidas | support, admin |
| Órdenes | Lista con filtros, detalle con **línea de tiempo** (`order_events`), pagos y entregas | support (lectura/acciones limitadas), admin |
| Entregas | Cola de `NEEDS_REVIEW`, **marcar entrega manual**, reintentar, con nota obligatoria | support, admin |
| Reembolsos | Registrar estado `REFUND_PENDING`/`REFUNDED` (ejecución en Wompi) | admin |
| Catálogo | CRUD de juegos y productos; estados `draft/active/archived` | admin |
| Precios y promos | Precios base y promocionales con vigencia | admin |
| Proveedor | Mapeo producto↔SKU de proveedor, marcar `verified_at` | admin |
| Usuarios | Ver, deshabilitar, cambiar rol | admin |
| Webhooks | Ver eventos, firma válida/inválida, reprocesar | admin |
| Ajustes | Canales de soporte (WhatsApp/correo), modo de entrega | admin |
| Auditoría | Consulta de `audit_log` | admin |

Cada acción escribe `audit_log` con `before/after` y el usuario que la ejecutó.

---

## 11. Endpoints de la API

Se **conservan las rutas que ya usa el frontend** para minimizar cambios; lo nuevo está marcado.

### Públicos / sesión
| Método y ruta | Auth | Notas |
|---|---|---|
| `GET /api/health` | — | Liveness mínima (sin detalles internos) |
| `GET /api/ready` *(nuevo)* | — | Readiness (BD); detalle solo para admin |
| `GET /api/config` | — | Soporte, banderas públicas, qué integraciones están configuradas. **Sin secretos** |
| `GET /api/auth/csrf` *(nuevo)* | sesión | Entrega el token CSRF |
| `GET /api/auth/me` | sesión | |
| `POST /api/auth/register` | — | Rate limit; sin enumeración |
| `POST /api/auth/login` | — | Rate limit; rota sesión |
| `POST /api/auth/logout` | sesión + CSRF | |
| `POST /api/auth/verify-email`, `/forgot`, `/reset` *(nuevo)* | — | Tokens de un solo uso |
| `GET /auth/:provider` y `/auth/:provider/callback` | — | OAuth; solo proveedores configurados |

### Compra
| Método y ruta | Auth | Notas |
|---|---|---|
| `GET /api/catalog?game=` | — | Solo activos, precio vigente calculado en servidor |
| `GET /api/player/lookup?uid=` | — | Rate limit; devuelve `verified`/`unverified`/`not_configured`; **elimina** `/api/nickname` |
| `POST /api/checkout` | CSRF + `Idempotency-Key` | Cuerpo: `items[{productId,quantity}]`, `playerUid`, `playerVerificationToken?`, datos de cliente, `expectedTotalCents?`. **Sin precios, estado, `user_id` ni nickname** |
| `GET /api/orders/:ref` | sesión **o** `X-Order-Token` | Filtro de propietario en SQL. Reemplaza `?code=` |
| `GET /api/orders` | sesión | Historial del usuario |
| `POST /api/orders/:ref/cancel` *(nuevo)* | propietario + CSRF | Solo en `AWAITING_PAYMENT` |
| `POST /api/orders/:ref/payment-attempts` *(nuevo)* | propietario + CSRF | Nuevo intento tras rechazo |

### Webhook
| `POST /api/webhooks/wompi` | Firma | §8 |

### Administración (`/api/admin/*`, rol + MFA + CSRF)
`GET/PATCH /orders`, `POST /orders/:id/fulfill-manual`, `POST /orders/:id/retry-fulfillment`, `POST /orders/:id/refund-status`, `CRUD /games`, `/products`, `/prices`, `/provider-products`, `GET/PATCH /users`, `GET /webhook-events`, `POST /webhook-events/:id/reprocess`, `GET/PUT /settings`, `GET /audit-log`.

Formato de error común: `{ "error": { "code": "…", "message": "…", "requestId": "…" } }` con códigos estables (los mismos que el frontend ya traduce en `friendlyPaymentError`: `WOMPI_NOT_CONFIGURED`, `PRICE_CHANGED`, `INVALID_PRODUCT`, etc.).

---

## 12. Variables de entorno

Se entregará `.env.example` **solo con nombres y descripciones, sin valores**. Ninguna credencial se inventa.

| Variable | Secreta | Obligatoria | Descripción |
|---|---|---|---|
| `NODE_ENV` | no | sí | `development` / `test` / `production` |
| `PUBLIC_BASE_URL` | no | sí | URL pública (cookies, redirecciones, OAuth) |
| `PORT` | no | no | Puerto HTTP |
| `TRUST_PROXY` | no | sí en prod | Saltos de proxy de confianza (IP real) |
| `LOG_LEVEL` | no | no | |
| `DATABASE_URL` | **sí** | sí | Conexión PostgreSQL |
| `SESSION_TTL_HOURS`, `SESSION_IDLE_MINUTES` | no | no | Vigencia de sesión |
| `PLAYER_TOKEN_SECRET` | **sí** | sí | Firma de `playerVerificationToken` |
| `ORDER_TOKEN_PEPPER` | **sí** | sí | Pepper para hashear tokens de orden |
| `WOMPI_ENV` | no | sí | `sandbox` / `production` |
| `WOMPI_PUBLIC_KEY` | no | PENDIENTE | Llave pública del widget |
| `WOMPI_PRIVATE_KEY` | **sí** | PENDIENTE | Consulta de transacciones |
| `WOMPI_INTEGRITY_SECRET` | **sí** | PENDIENTE | Firma de integridad |
| `WOMPI_EVENTS_SECRET` | **sí** | PENDIENTE | Verificación de webhooks |
| `WOMPI_API_BASE_URL` | no | PENDIENTE | **[A VERIFICAR]** según ambiente |
| `FULFILLMENT_MODE` | no | sí | `manual` / `provider` |
| `PROVIDER_NAME`, `PROVIDER_API_BASE_URL` | no | PENDIENTE | Solo si D7 se resuelve |
| `PROVIDER_API_KEY` (y las que exija el proveedor) | **sí** | PENDIENTE | |
| `PLAYER_LOOKUP_ENABLED` | no | no | Apagado hasta que exista proveedor real |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | secret | PENDIENTE | Solo si D10 incluye Google |
| `EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAIL_API_KEY`/`SMTP_*` | secret | PENDIENTE | D11 |
| `SUPPORT_WHATSAPP`, `SUPPORT_EMAIL` | no | no | Canales oficiales (hoy están vacíos en el HTML) |
| `ADMIN_BOOTSTRAP_EMAIL` | no | no | Para el comando `create-admin` |
| `SENTRY_DSN` | secret | no | Monitoreo opcional |

La aplicación **valida el entorno al arrancar** (Zod): en producción falla si falta una variable obligatoria o si hay llaves de sandbox con `WOMPI_ENV=production`.

---

## 13. Testing

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| Unitarias | Vitest | Dinero (enteros), cálculo de totales/promos, máquina de estados (transiciones válidas e inválidas), firma de integridad y checksum de webhook, validadores, tokens firmados |
| Integración | Vitest + PostgreSQL real (Testcontainers) | Repositorios, transacciones, CAS de estados, unicidad (`provider_tx_id`, `dedupe_key`, idempotencia) |
| API | `fastify.inject` | Autenticación, RBAC, CSRF, validación, rate limit, errores |
| Contrato Wompi | Vitest con fixtures | **Fixtures tomados de la documentación oficial** [A VERIFICAR]; no se inventan payloads |
| Seguridad | Vitest/Playwright | IDOR en órdenes, manipulación de precio/estado/`user_id`, webhook con firma inválida, replay de webhook, doble envío de checkout, CSRF sin cabecera, enumeración de usuarios |
| Concurrencia | Vitest | Dos webhooks simultáneos, doble clic de checkout, dos workers sobre la misma entrega ⇒ una sola entrega |
| E2E | Playwright (Chromium) | Entrada → catálogo → jugador → factura → checkout → seguimiento, con Wompi/proveedor simulados **solo en el entorno de prueba** |
| Accesibilidad | axe-core + Playwright | Modales, foco, contraste, navegación por teclado |
| Visual / responsive | Playwright (capturas) | Protege la identidad visual en 360, 768 y 1280+ px |
| Rendimiento | Lighthouse CI | LCP/CLS/JS; presupuesto de animaciones (`prefers-reduced-motion`) |

**CI (GitHub Actions)** en cada PR: instalar → `lint` → `typecheck` → tests unitarios/integración → build → E2E → `pnpm audit` → gitleaks. Bloqueo de merge si falla.

---

## 14. Despliegue

| Aspecto | Propuesta |
|---|---|
| Ambientes | `dev` (local, Docker Compose) · `staging` (Wompi **sandbox**) · `production` |
| Imagen | Un Dockerfile multi-etapa; procesos `api` y `worker` desde la misma imagen |
| Base de datos | PostgreSQL gestionada con **copias de seguridad y recuperación a un punto en el tiempo**; migraciones como paso de despliegue, nunca al arrancar la app |
| TLS | Terminado en el proxy/PaaS; HSTS |
| Secretos | Gestor de secretos del hosting; nunca en el repositorio |
| Webhook | URL pública HTTPS registrada en el panel de Wompi, una por ambiente |
| Observabilidad | Logs JSON (pino) con `requestId`, métricas básicas, alertas por: entregas en `NEEDS_REVIEW`, webhooks con firma inválida, tasa de errores 5xx |
| Salud | `/api/health` (liveness) y `/api/ready` (BD) para el orquestador |
| Rollback | Imagen anterior + migraciones compatibles hacia atrás (expand/contract) |
| Hosting | **[DECISIÓN D4].** No se asume ninguno. Cualquiera debe soportar procesos de larga duración y Postgres; evitar plataformas serverless puras para el `worker` |

---

## 15. Estructura de carpetas propuesta

```
TayGameStore/
├─ legacy/
│  └─ index-cinematic-v4.html            # original congelado (solo referencia)
├─ apps/
│  ├─ web/                               # frontend público
│  │  ├─ index.html                      # marcado actual, sin onclick inline
│  │  ├─ public/                         # fuentes autoalojadas, iconos
│  │  └─ src/
│  │     ├─ main.ts
│  │     ├─ styles/                      # tokens · base · layout · components · cinematic · responsive
│  │     ├─ core/                        # state · api · csrf · format · dom · status-map
│  │     ├─ features/                    # catalog · cart · player · invoice · checkout · tracking
│  │     │                               # history · favorites · auth · support · search
│  │     ├─ effects/                     # particles · cursor-glow · scroll · confetti (visual actual)
│  │     └─ a11y/                        # modal · focus-trap
│  ├─ admin/                             # panel /admin (mismos tokens CSS)
│  │  ├─ index.html
│  │  └─ src/ (views · api · auth · tables)
│  └─ api/
│     ├─ src/
│     │  ├─ server.ts · app.ts · worker.ts
│     │  ├─ config/env.ts                # validación Zod
│     │  ├─ plugins/                     # security · session · csrf · rate-limit · errors · logging
│     │  ├─ modules/
│     │  │  ├─ auth/ · users/ · catalog/ · pricing/ · player/
│     │  │  ├─ orders/ · payments/ · webhooks/ · fulfillment/
│     │  │  ├─ admin/ · support/ · health/
│     │  │  └─ (cada módulo: routes · service · repo · schemas)
│     │  ├─ providers/
│     │  │  ├─ wompi/                    # client · signature · webhook
│     │  │  ├─ fulfillment/              # types · manual · disabled  (· <proveedor real> pendiente)
│     │  │  └─ player/                   # types · disabled           (· <proveedor real> pendiente)
│     │  ├─ jobs/                        # fulfill-order · reconcile-payments · expire-orders
│     │  ├─ db/                          # schema.ts · client.ts · migrations/ · seed.ts
│     │  ├─ lib/                         # money · crypto · ids · idempotency
│     │  └─ cli/create-admin.ts
│     └─ tests/                          # unit · integration · security · concurrency
├─ packages/
│  └─ shared/                            # contratos Zod · order-state · money · códigos de error
├─ e2e/                                  # Playwright (flujos, a11y, visual)
├─ docker/ (Dockerfile · compose.dev.yml)
├─ .github/workflows/ci.yml
├─ docs/ (este plan · ADRs · runbooks · wompi-integration.md)
├─ .env.example · .gitignore · .editorconfig
├─ package.json · pnpm-workspace.yaml · tsconfig.base.json
├─ eslint.config.js · prettier.config.js
└─ README.md
```

---

## 16. Orden exacto de implementación por fases

Cada fase termina con el proyecto **ejecutable**, tests de la fase en verde y un informe (objetivo, archivos, cambios, tests, errores, pendientes).

| Fase | Contenido | Criterio de salida |
|---|---|---|
| **0. Decisiones y repositorio** | Resolver §0 (mínimo D1–D6, D9, D10). Crear estructura, pnpm, TypeScript, lint, `.gitignore`, `.env.example`, CI vacío. Copiar el HTML a `legacy/` | `pnpm lint/typecheck` ejecutan; CI corre |
| **1. Línea base visual y frontend modular** | Capturas de referencia; extraer CSS y JS a módulos **sin cambiar comportamiento ni diseño**; quitar `onclick` inline | Capturas idénticas (tolerancia mínima); app funciona en modo vista previa |
| **2. Limpieza de riesgos del frontend** | Quitar demo del build de producción, precios de respaldo, indicadores falsos, `playerLookupUrl`; lista blanca en `localStorage`; arreglar el confeti; tabla única de estados | Auditoría §2.4 cerrada en el cliente; tests unitarios del cliente |
| **3. Backend base** | Fastify, `env` validado, logging, errores, `/health`, `/ready`, `/config`, BD + migraciones iniciales, cabeceras de seguridad y CSP con nonce, servir estáticos | API arranca; tests de integración con Postgres; CSP sin `unsafe-inline` y sin errores en consola |
| **4. Sesiones y autenticación** | Sesiones opacas, CSRF, registro/login/logout, rate limit, argon2id; invitado | Tests de seguridad de auth (enumeración, fijación, CSRF) |
| **5. Catálogo y precios** | Tablas, repositorios, `GET /api/catalog`, seed **desde CLI/SQL revisado por el propietario** (no valores inventados), promos con vigencia | Catálogo real en la UI; catálogo vacío ⇒ estado honesto |
| **6. Verificación de jugador (abstracción)** | `PlayerLookupProvider` + `Disabled`, token firmado, UI **NO VERIFICADO** | Sin proveedor no se inventan datos (test) |
| **7. Órdenes y checkout (sin pago real)** | Cálculo servidor, `orders/order_items`, máquina de estados, idempotencia, acceso por propietario/token, `GET /orders` | Tests de manipulación de precio, IDOR, doble envío, transiciones |
| **8. Wompi sandbox** | Cliente, firma de integridad, intento de pago, webhook con checksum, confirmación por API, reconciliación, expiración | Pagos sandbox de extremo a extremo; replay y concurrencia probados. **Bloqueada hasta obtener llaves sandbox y la documentación** |
| **9. Admin mínimo + entrega manual** | `/admin`, RBAC + MFA, lista de órdenes, entrega manual, `NEEDS_REVIEW`, auditoría | Se puede operar la tienda sin proveedor automático |
| **10. Correo transaccional** | Verificación, recuperación, comprobante | **Bloqueada hasta elegir proveedor de correo** [D11] |
| **11. Proveedor de recargas real** | Implementar el adaptador con su documentación; mapeo y `verified_at`; entrega automática; reconciliación de `unknown` | **Bloqueada hasta tener documentación y credenciales** [D7]; hasta entonces sigue el modo manual |
| **12. Admin completo** | Catálogo, precios, promos, usuarios, webhooks, ajustes | CRUD con auditoría |
| **13. OAuth** | Solo los proveedores confirmados [D10], con PKCE | Cada proveedor probado en staging |
| **14. Accesibilidad, responsive y rendimiento** | Modales accesibles, foco, contraste, `prefers-reduced-motion`, presupuesto de rendimiento, fuentes autoalojadas | axe sin errores críticos; Lighthouse dentro del presupuesto; capturas 360/768/1280 |
| **15. Endurecimiento y despliegue** | Pentest propio de los casos de §9, límites ajustados, backups y restauración probados, runbooks, staging completo | Lista de verificación de salida a producción |
| **16. Lanzamiento** | Producción con Wompi real, textos legales, monitoreo y alertas | Compra real de bajo monto verificada de extremo a extremo |

---

## 17. Qué se conserva, refactoriza y crea

**Se conserva (identidad y activos)**
- Todo el marcado HTML y las clases CSS de la SPA actual (entrada cinematográfica, boot screen, hero, catálogo, carrito inteligente, factura viva, seguimiento, laboratorio, soporte, FAQ, modales, drawer).
- Paleta oscura violeta/azul/cian, tipografías, iconos SVG (`<symbol>`) y todas las animaciones (partículas, cursor glow, impactos, confeti, barra de progreso).
- La lógica de render y UX existente (carrito, favoritos, buscador, exportación del comprobante) con ajustes de contrato.
- Los códigos de error que el frontend ya traduce.

**Se refactoriza**
- `tgs-core-script` → módulos `core/` y `features/`; elimina estado crítico local.
- `tgs-visual-script` y `tgs-cinematic-v4` → `effects/` (incluye corrección del confeti).
- CSS de un solo `<style>` → archivos por capa.
- Meta CSP → cabecera HTTP.
- Login: botones OAuth según configuración real.

**Se crea** (ver árbol del §15): backend completo, esquema y migraciones, abstracciones de proveedores, panel admin, paquete `shared`, tests, CI, Docker, `.env.example`, documentación y runbooks.

**Dependencias a agregar** (versiones por fijar al instalar; **no verificadas aquí**)
- Runtime: `fastify`, `@fastify/helmet`, `@fastify/cookie`, `@fastify/rate-limit`, `@fastify/static`, `zod`, `drizzle-orm`, `pg`, `argon2`, `pg-boss`, `otplib` (TOTP), librería OAuth (`arctic` u `openid-client`), cliente de correo según D11.
- Desarrollo: `typescript`, `vite`, `tsx`, `vitest`, `@playwright/test`, `@axe-core/playwright`, `testcontainers`, `drizzle-kit`, `eslint`, `typescript-eslint`, `prettier`.
- CI: acción de gitleaks, `pnpm audit`.

---

## 18. Pendiente por falta de infraestructura o credenciales

| Elemento | Estado | Quién lo resuelve |
|---|---|---|
| Cuenta comercial Wompi y llaves sandbox/producción | PENDIENTE DE CONFIGURACIÓN | Propietario |
| Documentación oficial de Wompi (firma, checksum, URLs, estados) | A VERIFICAR | Contrastar antes de la Fase 8 |
| Proveedor de recargas (identidad, API, credenciales, soporte de idempotencia) | NO VERIFICADO | Propietario |
| Proveedor de verificación de jugador real | NO VERIFICADO | Propietario |
| Apps OAuth (Google u otros) | PENDIENTE DE CONFIGURACIÓN | Propietario |
| Proveedor de correo transaccional y dominio de envío (SPF/DKIM) | PENDIENTE DE CONFIGURACIÓN | Propietario |
| Dominio y DNS, hosting y base de datos gestionada | PENDIENTE DE CONFIGURACIÓN | Propietario |
| Catálogo y precios reales (productos, SKUs, promociones) | PENDIENTE | Propietario (no se inventan) |
| Número de WhatsApp y correo oficiales de soporte | PENDIENTE | Propietario |
| Textos legales: términos, privacidad, reembolsos; facturación DIAN | PENDIENTE | Propietario + asesoría |
| Gestor de secretos y política de rotación | PENDIENTE | Propietario/DevOps |
| Acceso a `docs.wompi.co` y al registro de npm desde el entorno de desarrollo | No disponible aquí (egreso bloqueado) | Verificar al implementar |

---

## 19. Riesgos principales del plan

1. **Sin proveedor de recargas no hay entrega automática.** Mitigación: modo manual (D6), con auditoría.
2. **Verificación de jugador no confiable.** Mitigación: estado explícito "NO VERIFICADO" y confirmación del usuario (D8).
3. **Detalles de Wompi sin contrastar.** Mitigación: Fase 8 bloqueada hasta leer la documentación oficial y probar en sandbox.
4. **Regresión visual al modularizar.** Mitigación: capturas de referencia antes de tocar nada (Fase 1).
5. **Pago aprobado fuera de tiempo o con monto distinto.** Mitigación: `NEEDS_REVIEW` en lugar de descartar o entregar.
6. **Cumplimiento legal y fiscal.** Mitigación: asesoría antes del lanzamiento (D15, D19).

---

*Fin del documento. Al aprobarlo (y resolver las decisiones del §0), el siguiente paso es la Fase 0.*
