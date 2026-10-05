# Auditoría total del sistema real — TayGameStore

- **Fecha:** 2026-10-05
- **Commit auditado:** `5a820f0` (rama `claude/taygamestore-production-pfctbn`)
- **Alcance:** auditoría sin implementación (primera ejecución del prompt maestro "cobertura
  total"). Ningún archivo de código se modificó.
- **Método:** lectura del código, configuración, migraciones, tests y workflows; ejecución local
  de lint, typecheck, tests unitarios/API/integración, `drizzle-kit generate`, `npm audit`,
  build, arranque del servidor y búsqueda heurística de secretos en el historial de Git.

Leyenda de las matrices: `✔` existe y tiene evidencia · `◐` parcial o solo heredado/no fiable ·
`✘` no existe · `—` no aplica · `B` bloqueado por dependencia externa.

---

## 0. Conclusión

TayGameStore **no es hoy un sistema de comercio**: es una base técnica de servidor (salud,
configuración, errores, logs, una tabla de auditoría) más el frontend original modularizado,
que **simula** en el navegador casi todo el dominio (catálogo de respaldo con precios fijos,
verificación de jugador, historial, comprobante y, en modo demo, pago y entrega). Ningún flujo
de negocio recorre completo `UI → API → servicio → BD → proveedor`. Las ventas están
correctamente bloqueadas por configuración. **Estado: NOT PRODUCTION READY.**

---

## 1. Inventario completo

### 1.1 Estructura real del repositorio

| Ruta | Contenido real |
|---|---|
| `src/server/` | `index.ts` (arranque, cierre ordenado), `app.ts` (Fastify), `config/env.ts` (Zod), `plugins/{errors,logging,maintenance}.ts`, `modules/{health,config}/routes.ts`, `lib/time.ts`, `db/{schema,client,migrate}.ts`, `db/migrations/0000_init.sql` + `meta/` |
| `src/shared/errors.ts` | 10 códigos de error estables |
| `src/web/` | `index.html` (solo marcado, CSP `<meta>`), `main.js`, `styles/` (28 capas), `js/` (compat, 12 módulos `store/`, 17 `store/features/`, 2 `effects/`) |
| `tests/` | `unit` (3 archivos, 16 tests), `api` (3 archivos, 20), `integration` (1 archivo, 4), `helpers.ts` |
| `e2e/` | `behavior.spec.ts` (21 tests, 1 `test.fail`), `visual.spec.ts` (1 test × 3 viewports), `support/page.ts`, fixtures de fuentes, `__screenshots__/` |
| `legacy/index-cinematic-v4.html` | HTML original congelado (185 KB) |
| `docs/` | `PLAN-ARQUITECTURA.md` (v3), `specs/pagos.md`, `specs/verificacion-jugador.md`, esta auditoría |
| `.github/workflows/ci.yml` | 3 jobs: quality, integration (postgres:16), e2e |
| Raíz | `package.json` (deps exactas), `package-lock.json` (342 entradas con `integrity`), `.npmrc` (`save-exact`, `engine-strict`), `.nvmrc` (24), `tsconfig*.json`, `vite/vitest/playwright/drizzle/eslint` config, `.prettierrc.json`, `.editorconfig`, `.env.example`, `README.md` |
| **No existen** | `Dockerfile`, `docker-compose*`, `scripts/`, `db/` en raíz, `specs/` en raíz (están en `docs/specs/`), runbooks, deployment, `CLAUDE.md` |

### 1.2 Inventario funcional (requisito → ¿existe?)

| Dominio | Elemento | Frontend | Backend | BD |
|---|---|---|---|---|
| Producto | catálogo, productos, precios, promo | ◐ (respaldo con precios fijos en `config.js`) | ✘ | ✘ |
| | categorías / juegos | ◐ (4 pestañas; solo Free Fire activo) | ✘ | ✘ |
| | disponibilidad (`providerAvailable`) | ◐ | ✘ | ✘ |
| | límites por producto | ◐ (`MAX_QTY = 99`, contradice el límite 5) | ✘ | ✘ |
| | imágenes / metadatos | ✘ (solo iconos SVG; no hay imágenes de producto) | ✘ | ✘ |
| | activo / inactivo | ✘ | ✘ | ✘ |
| Cliente | visitante / invitado | ◐ (`guestBtn`, estado local) | ✘ | ✘ |
| | usuario autenticado, perfil, cuenta | ◐ (UI de contraseña heredada) | ✘ | ✘ |
| | historial / órdenes | ◐ (`localStorage`) | ✘ | ✘ |
| | comprobantes | ◐ (JPG/PDF generados en el navegador) | ✘ | ✘ |
| Autenticación | Google OAuth, callback, sesiones, logout, expiración, revocación | ◐ (enlaces `/auth/google`, `/auth/facebook`, `/auth/discord`, `/auth/vk`; login/registro con contraseña) | ✘ | ✘ |
| Administración | login, allowlist, MFA/TOTP, recovery, órdenes, verificación, fulfillment, refunds, blocklist, catálogo, auditoría, configuración | ✘ (no hay panel) | ✘ | ◐ (`audit_events`) |
| Carrito | agregar, quitar, cantidad, vaciar, persistencia | ✔ (local) | — | — |
| | producto eliminado / precio cambiado | ◐ (se filtran ids desconocidos; sin aviso de cambio de precio) | ✘ | ✘ |
| | múltiples pestañas | ✘ (sin sincronización; `localStorage` se pisa) | — | — |
| Checkout | datos, validación, términos | ◐ (validación de UI) | ✘ (`POST /api/checkout` → 404) | ✘ |
| | cálculo, límites, idempotencia, creación de orden | ✘ | ✘ | ✘ |
| Verificación de jugador | UID, consulta, resultado, confirmación | ◐ (consulta desde el navegador a rutas inexistentes; demo ficticio) | ✘ | ✘ |
| | operador, rechazo, timeout, desconocido | ✘ | ✘ | ✘ |
| Órdenes | creación, referencia, token, snapshots, estados, expiración, acceso, historial, cancelación, revisión, refund | ◐ (referencia `TGS-NNNN` y código FNV en el navegador) | ✘ | ✘ |
| Pagos (Mercado Pago) | creación, checkout, retorno, webhook, autenticidad, consulta, estados, idempotencia, expiración, rechazo, timeout, tardío, duplicado, incorrecto, refund, reconciliación | ✘ (el frontend aún tiene la pasarela retirada) | B | ✘ |
| Recargas | proveedor, API, creación, consulta, estados, reconciliación | ✘ (demo simula entrega) | B (sin proveedor) | ✘ |
| Fulfillment manual | claim, operador, evidencia, doble entrega | ✘ | ✘ | ✘ |
| Operación | health, ready, config, mantenimiento | ◐ (el frontend espera campos que el servidor no envía) | ✔ | — |
| | soporte (WhatsApp / correo) | ◐ (vacío hasta que `/api/config` lo envíe; no lo envía) | ✘ | — |

---

## 2. Mapa de arquitectura real

```
Navegador
  └─ build Vite (index.html + 1 JS 58 KB / 18,8 KB gz + 1 CSS 92 KB / 17,0 KB gz)
       ├─ estado y "dominio" simulados en JS + localStorage (carrito, jugador, órdenes, historial, PII)
       ├─ fetch → /api/catalog, /api/checkout, /api/orders, /api/auth/*, /api/player/lookup,
       │          /api/nickname      ⇒ 404 (no existen en el servidor)
       ├─ fetch → /api/config, /api/health  ⇒ 200 (pero con otro contrato del esperado)
       ├─ script externo de la pasarela retirada (cargado solo al pagar; nunca llega a usarse)
       └─ Google Fonts (CSS y fuentes de terceros en cada visita)

Servidor Fastify (un proceso)
  ├─ /api/health · /api/ready (ping BD con timeout) · /api/config (3 interruptores)
  ├─ guardia de mantenimiento · formato de error · requestId · redacción de logs
  ├─ @fastify/static sirve dist/web (SERVE_WEB)
  └─ pg Pool + Drizzle ──▶ PostgreSQL: audit_events (única tabla; nadie escribe en ella)

Proveedores externos conectados: ninguno.
```

---

## 3. Matriz de funcionalidades (recorrido completo)

Columnas: FE frontend · API · SVC servicio · DB · EXT proveedor · ERR manejo de error · SEC
seguridad · AUD auditoría · OBS observabilidad · TST test · REC recuperación · DOC documentación.

| Requisito | FE | API | SVC | DB | EXT | ERR | SEC | AUD | OBS | TST | REC | DOC | Hueco |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Health / readiness | ◐ | ✔ | — | ✔ | — | ✔ | ✔ | — | ✔ | ✔ | ✔ | ✔ | Frontend espera `wompi`/`provider` en `/api/health` |
| Configuración pública / interruptores | ◐ | ✔ | — | — | — | ✔ | ✔ | — | ✔ | ✔ | — | ✔ | Frontend ignora `maintenanceMode`, `checkoutEnabled`, `paymentsEnabled` y espera `auth`, `support` |
| Modo mantenimiento | ✘ | ✔ | — | — | — | ✔ | ✔ | ✘ | ✔ | ✔ | — | ✔ | Sin pantalla de mantenimiento |
| Catálogo | ◐ | ✘ | ✘ | ✘ | — | ◐ | ✘ | ✘ | ✘ | ◐ (e2e del respaldo) | ✘ | ✔ | Todo |
| Carrito | ✔ | — | — | — | — | ◐ | ✘ (límite 99 ≠ 5) | — | — | ✔ | ◐ | ◐ | Validación en servidor inexistente |
| Favoritos / búsqueda / tarifa | ✔ | — | — | — | — | ✔ | — | — | — | ✔ | ✔ | ◐ | Tarifa "promo" la elige el cliente |
| Verificación de jugador | ◐ | ✘ | ✘ | ✘ | B | ◐ | ✘ | ✘ | ✘ | ◐ | ✘ | ◐ | Todo; el diseño vigente (manual en la orden) no tiene UI |
| Checkout / creación de orden | ◐ | ✘ | ✘ | ✘ | — | ◐ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | Todo |
| "Confirmar y pagar" | ✘ | ✘ | ✘ | ✘ | — | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | Todo |
| Pago Mercado Pago | ✘ | ✘ | ✘ | ✘ | B | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ◐ | Bloqueado |
| Webhook / reconciliación | — | ✘ | ✘ | ✘ | B | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ◐ | Bloqueado |
| Seguimiento de orden | ◐ | ✘ | ✘ | ✘ | — | ◐ (errores silenciados) | ✘ (`?code=` en URL) | ✘ | ✘ | ◐ | ◐ | ✔ | Todo |
| Historial | ◐ (`localStorage`) | ✘ | ✘ | ✘ | — | ◐ | ✘ | ✘ | ✘ | ◐ | ✘ | ✔ | Todo |
| Comprobante (JPG/PDF) | ◐ | ✘ | ✘ | ✘ | — | ✔ | ✘ (datos del navegador) | ✘ | — | ✔ | — | ◐ | Comprobante sin respaldo del servidor |
| Login Google / sesión / logout | ◐ | ✘ | ✘ | ✘ | ✘ | ◐ | ✘ | ✘ | ✘ | ◐ | ✘ | ✔ | Todo |
| Invitado | ◐ | ✘ | ✘ | ✘ | — | — | ✘ | ✘ | ✘ | ✔ | ✘ | ✔ | Token de acceso inexistente |
| Admin + MFA | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | Todo |
| Fulfillment manual | ✘ | ✘ | ✘ | ✘ | — | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ◐ | Todo |
| Refund | ✘ | ✘ | ✘ | ✘ | B | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ◐ | Todo + decisión |
| Blocklist / antifraude | ✘ | ✘ | ✘ | ✘ | — | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | Todo |
| Soporte | ◐ | ✘ | — | — | — | ✔ | ✔ | — | — | ✘ | — | ◐ | `/api/config` no envía canales |
| Auditoría | — | — | ✘ | ✔ | — | — | — | ✘ | — | ✔ (tabla) | — | ✔ | Nadie escribe eventos |

**Resultado:** solo *health/ready* y *configuración* tienen todas las columnas aplicables
cubiertas en el servidor. Ninguna funcionalidad de negocio está completa.

---

## 4. Matriz API → frontend → BD

| Ruta | Llamada desde | Servidor | BD | Observación |
|---|---|---|---|---|
| `GET /api/health` | `service.js` `checkHealth` | ✔ `{status:'ok'}` | — | El frontend lee `j.wompi`, `j.provider`, `j.player`: contrato inexistente |
| `GET /api/ready` | nadie | ✔ | ping | Solo para el hosting |
| `GET /api/config` | `service.js` `bootstrapConfig` | ✔ 3 interruptores | — | El frontend lee `auth`, `support`, `wompi`, `ok`: no existen |
| `GET /api/catalog?game=` | `catalog.js` | ✘ 404 | ✘ | Al fallar muestra el catálogo de respaldo **con precios fijos** también fuera del modo demo |
| `POST /api/checkout` | `checkout.js` | ✘ 404 | ✘ | Envía `uid`, **`nickname`**, `customerName`, `customerEmail`, `tariff`, ítems |
| `GET /api/orders/:ref?code=` | `orders.js` | ✘ 404 | ✘ | Token de acceso en query string; errores silenciados |
| `GET /api/orders?limit=100` | `history.js` | ✘ 404 | ✘ | — |
| `POST /api/auth/login`, `/register` | `account.js` | ✘ 404 | ✘ | Contraseñas: contrario a la decisión del propietario |
| `GET /api/auth/me`, `POST /api/auth/logout` | `account.js` | ✘ 404 | ✘ | — |
| `GET /auth/{google,facebook,discord,vk}` | enlaces en `index.html` | ✘ 404 | ✘ | Solo Google está decidido |
| `GET /api/player/lookup`, `/api/nickname` | `player.js` | ✘ 404 | ✘ | Además acepta `window.TGS_CONFIG.playerLookupUrl` (destino arbitrario fijado en el cliente) |
| Script de la pasarela retirada | `checkout.js` | — | — | A eliminar |

**Contrato de error roto:** el servidor responde `{ error: { code, message, requestId } }`;
`api.js` hace `new Error(data.error)` y el mensaje resultante es `"[object Object]"`. Ningún
código de error del servidor puede llegar a la interfaz tal como está.

**Endpoints sin consumidor:** `/api/ready` (correcto: es del hosting). **Consumidores sin
endpoint:** 11 rutas.

---

## 5. Matriz de estados

Ninguna máquina de estados está implementada. Diseño vigente (`PLAN-ARQUITECTURA.md` v3) y
propuestas para las que faltan; las marcadas **[PROPUESTA]** requieren aprobación (§10).

### 5.1 ORDER (`orders.status`) — `DISEÑADO`

| Estado | Entrada | Salidas válidas | Quién | Timeout | Error / recuperación |
|---|---|---|---|---|---|
| `AWAITING_VERIFICATION` | checkout válido | `AWAITING_PAYMENT`, `REJECTED`, `EXPIRED` | sistema, operador, cliente (confirma) | TTL `[POR DEFINIR]` | job de expiración |
| `REJECTED` | verificación negativa / "no es mi cuenta" | final | operador, cliente | — | — |
| `AWAITING_PAYMENT` | verificación + confirmación | `PAID`, `AWAITING_VERIFICATION`, `EXPIRED`, `NEEDS_REVIEW` | webhook/reconciliación, sistema | TTL `[POR DEFINIR]` | intento abierto impide expirar |
| `PAID` | pago `APPROVED` validado | `DELIVERING`, `NEEDS_REVIEW`, `REFUNDED` | admin, sistema | alerta "pagado sin entrega" | — |
| `DELIVERING` | reclamo del admin | `DELIVERED`, `PAID` (liberar), `NEEDS_REVIEW` | admin | reclamo abandonado `[POR DEFINIR]` | job de recuperación |
| `DELIVERED` | entrega con evidencia | `REFUNDED` | admin | — | — |
| `NEEDS_REVIEW` | discrepancia / incertidumbre | `DELIVERING`, `REFUNDED` | admin | alerta | revisión manual |
| `EXPIRED` | vencimiento | `PAID`/`NEEDS_REVIEW` (pago tardío) | sistema | — | reconciliación |
| `REFUNDED` | reembolso registrado | final | admin | — | — |

Persistencia: columna `status` + CAS + `audit_events` en la misma transacción (`DISEÑADO`).
Hueco: **no hay estado de cancelación por el cliente** (pedido en el inventario) → decisión §10.

### 5.2 PAYMENT (`payments.status`, intento) — `DISEÑADO`, proveedor `BLOCKED`

`PENDING` → `APPROVED` | `DECLINED` | `EXPIRED`; `APPROVED` → `NEEDS_REFUND` | `REFUNDED`;
`NEEDS_REFUND` → `REFUNDED`. Quién: webhook, reconciliación, admin (refund). Timeout: según
proveedor `[A VERIFICAR]`. Resultado desconocido: hoy se queda en `PENDING`; el prompt maestro
pide un estado `UNKNOWN` explícito → contradicción §10 #3.

### 5.3 FULFILLMENT (`fulfillments.status`) — **[PROPUESTA]**

| Estado | Entrada | Salidas | Quién | Timeout / recuperación |
|---|---|---|---|---|
| `READY_FOR_FULFILLMENT` | orden pasa a `PAID` | `CLAIMED` | sistema | alerta si supera `[POR DEFINIR]` |
| `CLAIMED` | claim atómico (CAS, `claimed_by`, `claimed_at`) | `DELIVERING`, `READY_FOR_FULFILLMENT` (liberar) | admin | liberación por abandono (job) |
| `DELIVERING` | operador inicia la recarga | `DELIVERED`, `FAILED` | admin / `TopUpProvider` | consulta de estado; sin reintento ciego |
| `DELIVERED` | evidencia registrada | final | admin | — |
| `FAILED` | fallo confirmado | `READY_FOR_FULFILLMENT` (reintento manual), `NEEDS_REVIEW` en la orden | admin | — |

Regla: no se crea fulfillment si el pago no está `APPROVED` y validado (FK + CHECK por estado).
Relación con `orders.status`: `PAID` mientras el fulfillment está `READY`/`CLAIMED`; `DELIVERING` y
`DELIVERED` reflejan el agregado de los ítems.

### 5.4 PLAYER_VERIFICATION (columnas de la orden) — **[PROPUESTA]**

`PENDING` → `VERIFIED` (operador) | `NOT_FOUND`/`AMBIGUOUS`/`BLOCKED_ACCOUNT` (operador → orden
`REJECTED`); `VERIFIED` → `CONFIRMED` (cliente) | `DECLINED_BY_CUSTOMER` (→ `REJECTED`) |
`EXPIRED` (TTL `[POR DEFINIR]` → vuelve a `PENDING`). Operador y nickname registrados; auditado.

### 5.5 SESSION (`sessions`) — **[PROPUESTA]**

`ACTIVE` → `EXPIRED` (absoluta/inactividad) | `REVOKED` (logout, rotación, admin). Admin:
`ACTIVE_PENDING_MFA` → `ACTIVE` (TOTP). Se modela con `expires_at`, `revoked_at`,
`mfa_verified_at`, no con una columna de estado.

---

## 6. Matriz de seguridad

### 6.1 Controles

| Control | Estado real | Evidencia |
|---|---|---|
| Validación de entrada (Zod) | ✔ configuración; ✘ endpoints de negocio (no existen) | `env.ts` |
| Límite de cuerpo | ✔ 64 KiB | `app.ts` |
| Errores sin detalles internos | ✔ | `tests/api/errors.test.ts` |
| Redacción de logs | ✔ `authorization`, `cookie`, `x-order-token`, `set-cookie` | `tests/unit/logging.test.ts` |
| Cabeceras de seguridad (CSP, HSTS, X-Frame/`frame-ancestors`, nosniff, Referrer-Policy, Permissions-Policy) | ✘ **ninguna** enviada por el servidor (comprobado con `curl -I`) | — |
| CSP `<meta>` | ◐ `script-src 'unsafe-inline'`, `connect-src 'self' https:` (cualquier origen HTTPS), dominio de la pasarela retirada | `index.html` |
| Clickjacking | ✘ (`frame-ancestors` no puede ir en `<meta>`) | — |
| CSRF | ✘ (todavía no hay escrituras de negocio) | — |
| Cookies seguras | ✘ (no hay cookies) | — |
| CORS | ✔ no registrado (mismo origen) | `app.ts` |
| Rate limiting | ✘ | — |
| IDOR / autorización | ✘ (no hay recursos) | — |
| Mass assignment / prototype pollution | ◐ `loadLocal()` hace `Object.assign(state, JSON.parse(localStorage))`: cualquier clave guardada (incluido `__proto__`, `verified`, `localDemo`) entra en el estado | `storage.js` |
| XSS | ◐ `esc()` en `innerHTML`; `toast()` usa `textContent`; mensaje `?message=` del retorno de auth se muestra como texto | `dom.js`, `ui.js`, `account.js` |
| SSRF | — servidor sin llamadas salientes; en el cliente `window.TGS_CONFIG.playerLookupUrl` permite redirigir la consulta de jugador a cualquier URL | `player.js` |
| API de depuración global | ◐ `window.TGS` expone `state` y acciones | `app.js` |
| Secretos en Git | ✔ heurística sin hallazgos reales (solo valores de prueba ficticios en tests); **gitleaks no ejecutado** (no disponible en el entorno ni en CI) | historial (11 commits) |
| Dependencias | ✔ producción: 0 vulnerabilidades; desarrollo: 4 moderadas (cadena `drizzle-kit` → `esbuild`) | `npm audit` |
| Pinning / lockfile | ✔ todas las versiones exactas, `save-exact`, lockfile con integridad | `package.json`, `.npmrc` |
| TLS / HSTS | ✘ depende del hosting (no desplegado) | — |
| Credenciales de BD | ✔ solo por variable de entorno; SSL por cadena de conexión | `client.ts` |
| Contenedores | — no hay Dockerfile | — |

### 6.2 Matriz de autorización (diseño; nada implementado)

| Ruta | guest | customer | admin | system/job | webhook | Ownership |
|---|---|---|---|---|---|---|
| `GET /api/health`, `/api/ready`, `/api/config` | ✔ | ✔ | ✔ | ✔ | — | — |
| `GET /api/catalog` | ✔ | ✔ | ✔ | — | — | — |
| `POST /api/checkout` | ✔ | ✔ | ✘ | — | — | sesión o token nuevo |
| `GET /api/orders/:ref` | con token de la orden | dueño (SQL) | ✔ | — | — | `404` uniforme |
| `GET /api/orders` | ✘ | propias | ✔ | — | — | `user_id` de la sesión |
| `POST /api/orders/:ref/confirm-player`, `/pay` | con token | dueño | ✘ | — | — | estado + dueño en SQL |
| `/api/admin/*` | ✘ | ✘ | admin + MFA | — | — | rol en sesión |
| Webhook Mercado Pago | — | — | — | — | autenticidad `[A VERIFICAR]` | por referencia propia |
| Jobs | — | — | — | advisory lock | — | — |

### 6.3 Tokens de invitado (auditoría pedida)

Hoy no existe `access_token` ni `access_token_hash`. El frontend heredado: guarda `code` de la
orden y la referencia en `localStorage` (historial y `currentOrder`), lo envía en la **query
string** (`?code=`) — quedaría en logs del hosting, historial y `Referer` — y el "código" del
comprobante es un hash FNV calculado en el navegador, sin valor de seguridad. Diseño correcto
en `PLAN-ARQUITECTURA.md` §10.4 (fragmento → canje por cookie `HttpOnly`).

### 6.4 Inventario de PII

| Dato | Dónde está hoy | Por qué | Acceso | Retención | Borrado | En logs |
|---|---|---|---|---|---|---|
| Nombre del cliente | `localStorage` | comprobante | cualquier script de la página | indefinida | manual del usuario | no |
| Email | `localStorage` | comprobante | ídem | indefinida | ídem | no |
| UID / nickname / región | `localStorage` | destino de la recarga | ídem | indefinida | ídem | no |
| Historial de órdenes | `localStorage` (hasta 100) | historial | ídem | indefinida | ídem | no |
| IP | logs del servidor (`req.remoteAddress` de Fastify) | operación | operador del hosting | la del hosting `[A VERIFICAR]` | — | **sí** |
| Identidad Google | — | — | — | — | — | — |
| Datos de pago | — | — | — | — | — | — |
| Fuentes de Google | IP del visitante enviada a Google en cada visita | tipografía | Google | — | — | — |

Política de retención y borrado: `[POR DEFINIR]` por el propietario (requisito legal).

---

## 7. Matriz de integraciones

| Integración | Estado | Timeout | Errores | Reintento seguro | Reconciliación | Fallback / modo manual | Logs | Métricas |
|---|---|---|---|---|---|---|---|---|
| PostgreSQL | ✔ | ✔ conexión 5 s, readiness 2 s | ✔ | — | — | `/api/ready` 503 | ✔ | ✘ |
| Mercado Pago | B (red 403, sin credenciales) | ✘ | ✘ | ✘ | ✘ | checkout bloqueado por interruptor | ✘ | ✘ |
| Google OIDC | ✘ (sin cliente OAuth) | ✘ | ✘ | ✘ | — | invitado | ✘ | ✘ |
| Verificación de jugador | B (C1) | ✘ | ✘ | ✘ | — | manual (diseñado) | ✘ | ✘ |
| Proveedor de recargas | B (no existe) | ✘ | ✘ | ✘ | ✘ | manual (diseñado) | ✘ | ✘ |
| Correo transaccional | ✘ (proveedor por elegir) | — | — | — | — | sin recuperación por correo | — | — |
| Google Fonts | ✔ en producción (dependencia de terceros en runtime) | navegador | fuentes de sistema | — | — | ✔ (degrada) | — | — |
| WhatsApp / mailto | ◐ (enlaces; canales sin configurar) | — | — | — | — | ocultos | — | — |
| Render | ✘ (no desplegado) | — | — | — | — | — | — | — |
| GitHub Actions | ✔ | — | — | — | — | — | ✔ | — |

---

## 8. Matriz de tests

| Funcionalidad | Unit | Integr. | Seguridad | Concurr. | E2E | Visual | A11y | Fallo | Recup. |
|---|---|---|---|---|---|---|---|---|---|
| Configuración / interruptores | ✔ | — | ✔ (rechazo en prod.) | — | — | — | — | ✔ | — |
| Logging / requestId / redacción | ✔ | — | ✔ | — | — | — | — | — | — |
| Health / ready / errores / mantenimiento | — | ✔ (API) | ◐ | — | — | — | — | ✔ (BD caída) | — |
| Migraciones / `audit_events` | — | ✔ (PG 16) | — | — | — | — | — | — | — |
| Frontend heredado (entrada, carrito, búsqueda, comprobante, demo) | — | — | — | — | ✔ (21, 1 `test.fail`, 1 intermitente) | ✔ (local) | ✘ | ◐ (sin backend) | ✘ |
| Catálogo, checkout, órdenes, pagos, webhooks, auth, admin, fulfillment, antifraude | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |

Ejecución local en esta auditoría: lint ✔, typecheck ✔, unit+API 36/36 ✔, integración 4/4 ✔.
Cobertura de código: **no configurada** (no medible). axe-core: **no instalado** (las violaciones
conocidas vienen de la auditoría de la Fase 1). Viewports probados: 360/768/1280 (visual) y
1280 (comportamiento); **sin pruebas** en 390, 430, 1024, 1440, 1920.

### 8.1 Clasificación de reintento (diseño)

| Operación | Clasificación | Mecanismo previsto |
|---|---|---|
| Lecturas (catálogo, orden, health) | SAFE TO RETRY | — |
| Checkout | SAFE con la misma `checkout_key` | `UNIQUE` |
| Crear intento de pago | NOT SAFE sin clave; SAFE con intento abierto único | índice parcial + clave de idempotencia del proveedor `[A VERIFICAR]` |
| Procesar webhook | SAFE | deduplicación + CAS |
| Consultar pago | SAFE | — |
| Recarga con proveedor | UNKNOWN tras timeout | consulta de estado; nunca reintento ciego |
| Refund | UNKNOWN tras timeout | consulta + registro; decisión §10 |
| Claim / entrega manual | SAFE (CAS) | — |

---

## 9. Detección de huecos (búsqueda conceptual §43)

| Patrón | Coincidencias reales |
|---|---|
| UI sin API | 11 llamadas a rutas inexistentes (§4); botones de Facebook/Discord/VK; login/registro con contraseña; `refreshOrderBtn`, `copyRefBtn`, historial "Ver" operan sobre datos locales |
| API sin UI | `/api/config` (`maintenanceMode`, `checkoutEnabled`, `paymentsEnabled`) no se usa en la UI; mantenimiento sin pantalla |
| API sin autorización | Ninguna (las 3 rutas son públicas por diseño) |
| Campo de BD sin dueño | `audit_events`: ningún código escribe en ella |
| Estado sin transición / transición sin test | Todas las máquinas (§5): solo diseño |
| Llamada externa sin timeout | Frontend: `fetch` sin `AbortSignal`/timeout en `api.js` (todas las llamadas) |
| Reintento sin idempotencia | `app.js` sondea la orden cada 15 s **sin límite** mientras exista `currentOrder` no final (persistido en `localStorage`); `orders.js` sondea 15 min |
| Pago sin auditoría / acción admin sin auditoría | Todo (no existen) |
| Secreto sin estrategia de rotación | `ORDER_TOKEN_PEPPER`, `IP_HASH_PEPPER`, `MFA_ENCRYPTION_KEY`, OAuth, Mercado Pago, BD: diseño parcial en el plan, sin implementación; OAuth/MP/BD sin procedimiento |
| Error sin recuperación | `pollOrder`, `syncPurchaseHistory`, `bootstrapSession`, `bootstrapConfig` silencian errores (`catch {}`) |
| Loading sin timeout | Estados "Consultando jugador…", "Revalidando…" dependen de `fetch` sin timeout |
| Webhook sin idempotencia | No hay webhook |
| Funcionalidad crítica solo en frontend | Precios y total, promo, verificación (`state.verified`), referencia y código del comprobante, historial, estado de la orden en demo |
| Pago simulado accesible | `?demo=1` en el build de producción simula pago aprobado y recarga entregada y lo guarda en el historial |
| Precios inventados en producción | Catálogo de respaldo con precios fijos cuando `/api/catalog` falla, aunque el texto de la UI afirma "No se muestran precios inventados" |
| Proveedores inventados en el código | Mensajes de error que nombran un proveedor de recargas y un "servicio de usuario" no aprobados (`checkout.js`, `player.js`) |
| `overflow-x:hidden` ocultando bugs | `24-visual-evolution.css:13` (oculta el desborde de `.trust` ≤ 430 px) |

---

## 10. Contradicciones detectadas

| # | Contradicción | Propuesta | Estado |
|---|---|---|---|
| 1 | Fases: el plan v3 usa A–I; el prompt maestro define 0–11 | Adoptar 0–11 (decisión más reciente); 0–1 hechas; A se integra en 0 | Aplicar en el plan |
| 2 | Fulfillment: el prompt define `READY_FOR_FULFILLMENT → CLAIMED → DELIVERING → DELIVERED`; el plan lo modela en `orders.status` | Máquina propia en `fulfillments` (§5.3) sin cambiar los estados de la orden | **NEEDS_DECISION** (confirmar) |
| 3 | Pago incierto: el prompt usa `UNKNOWN`; `specs/pagos.md` y el plan mantienen `PENDING` | Añadir `UNKNOWN` como estado interno del intento (prevalece el propietario sobre `pagos.md`) | **NEEDS_DECISION** (confirmar) |
| 4 | Documentación: el prompt pide `specs/{checkout,fulfillment,seguridad}.md`, `docs/{runbook,incident-response,disaster-recovery}.md`; el plan v3 cita `docs/runbooks/*`, `variables-entorno.md`, `integraciones/mercadopago.md` | Adoptar los nombres del prompt dentro de `docs/` (`docs/specs/` ya existe; sin mover archivos) | Aplicar |
| 5 | Nombre de la abstracción de pagos: `pagos.md` usa `PaymentProvider`; el propietario `PaymentGateway` | `PaymentGateway` | Alinear `pagos.md` |
| 6 | Verificación: `verificacion-jugador.md` (entidad previa a la orden, proveedor automático) vs manual dentro de la orden | Manual en la orden | Reescribir el spec |
| 7 | Cancelación de orden por el cliente: pedida en el inventario; no existe estado | No inventar: decidir si se modela (p. ej. `CANCELLED` antes del pago) | **NEEDS_DECISION** |
| 8 | Reembolsos: ¿vía API de Mercado Pago o manuales en su panel y registrados? | Depende de la documentación oficial y del propietario | **NEEDS_DECISION** / B |
| 9 | Frontend con contraseña y OAuth de Facebook/Discord/VK vs decisión "solo Google + invitado" | Retirar | Fase 2/3 |
| 10 | Frontend verifica el jugador antes de crear la orden y envía el nickname vs verificación manual en la orden | Rehacer el flujo | Fase 2/4 |
| 11 | Estados de orden del frontend (`FULFILLED`, `DECLINED`, `VOIDED`, `ERROR`, `APPROVED`, `FULFILLING`) vs estados vigentes | Sustituir | Fase 2 |
| 12 | Límite de cantidad: `MAX_QTY = 99` en el frontend vs 5 del propietario | 5 (servidor manda) | Fase 2 |
| 13 | Contrato de error del frontend (`error` string) vs servidor (`error` objeto) | Frontend traduce por `error.code` | Fase 2 |
| 14 | `README.md`, `.env.example`, comentarios de `env.ts`, frontend y e2e aún nombran la pasarela retirada | Eliminar | Fase 2 (frontend) / docs inmediato |
| 15 | Alertas: el prompt añade "DB unavailable" y "auth failures" | Añadir al plan | Aplicar |

---

## 11. Deuda técnica

| Deuda | Impacto |
|---|---|
| Lógica de dominio simulada en el navegador (`config.js`, `storage.js`, `history.js`, `invoice.js`, `checkout.js`, `player.js`) | Debe reescribirse contra la API real |
| Modo demo / vista previa (`LOCAL_DEMO`, `PREVIEW_ONLY`) entrelazado con la lógica real | Riesgo de comportamiento falso en producción |
| `window.TGS` y `window.TGS_CONFIG` globales | Superficie innecesaria |
| `fetch` sin timeout ni cancelación | Cargas potencialmente indefinidas |
| `localStorage` como almacén de PII y órdenes | Privacidad, falsificación de estado |
| 4 intervalos permanentes (reloj cada 1 s, sondeo de orden, efectos) | Consumo innecesario; sin medir |
| IDs duplicados en efectos, confeti muerto, selector `.add` inexistente | Defectos decorativos |
| `.trust` desborda ≤ 430 px, oculto con `overflow-x:hidden` | Bug de layout oculto |
| Violaciones axe conocidas | Accesibilidad |
| Prueba e2e intermitente (run 4) | CI no fiable |
| Referencias visuales solo locales; e2e en un viewport | Cobertura de regresiones baja |
| Actions de GitHub en Node 20 forzadas a Node 24 (aviso de deprecación) | Mantenimiento |
| `esbuild` antiguo vía `drizzle-kit` (dev) | Riesgo aceptado |
| `audit_events.data jsonb` sin reglas de minimización en código | A definir al escribir eventos |

---

## 12. Riesgos P0 / P1 / P2

**P0 — impiden cualquier venta real o comprometen dinero/identidad (hoy mitigados solo por los
interruptores bloqueados):**

1. Mercado Pago no integrado (`BLOCKED`: red y credenciales).
2. Sin fuente legítima de verificación de jugador (C1, `BLOCKED`).
3. Dominio comercial inexistente en el servidor: catálogo, checkout, órdenes, auth, admin,
   fulfillment, antifraude.
4. Modo demo en el build de producción: `?demo=1` muestra "Pago demo aprobado" y "Recarga
   completada" y lo guarda como historial y comprobante (comprobantes falsos verosímiles).
5. Precios fijos del catálogo de respaldo visibles fuera del modo demo si la API falla.
6. Verificación y precio decididos en el navegador (`state.verified`, `nickname` enviado al
   checkout, tarifa promo elegida por el cliente).
7. Sin cabeceras de seguridad en el servidor; CSP `<meta>` permisiva (`'unsafe-inline'`,
   `connect-src https:`).
8. Sin despliegue, backups ni restauración probada.

**P1:**

1. Contrato de error roto entre frontend y servidor (`[object Object]`).
2. Token de orden en query string y en `localStorage`.
3. Sondeo de órdenes sin límite y errores silenciados.
4. `fetch` sin timeout.
5. UI de contraseña y OAuth no aprobados.
6. `Object.assign` desde `localStorage` (mass assignment / `__proto__`).
7. `window.TGS_CONFIG.playerLookupUrl` y `window.TGS`.
8. Prueba e2e intermitente sin causa raíz.
9. Sin rate limiting, CSRF, rotación de claves, gitleaks ni pruebas de seguridad/concurrencia.
10. Violaciones axe críticas y desborde de layout oculto.
11. Sin decisión sobre cancelación, reembolsos, `UNKNOWN` y fulfillment (§10).

**P2:**

1. Google Fonts como dependencia de terceros (privacidad y disponibilidad).
2. Referencias visuales fuera de CI; e2e en un solo viewport.
3. Defectos decorativos e IDs duplicados.
4. Deprecación de Node 20 en las actions.
5. `esbuild` de desarrollo.
6. Rendimiento sin medición sistemática (solo una muestra local).

---

## 13. Documentación vs código

| Afirmación documental | Código real | Veredicto |
|---|---|---|
| Plan v3 §2: servidor base, interruptores, `audit_events`, frontend modular, CI | Coincide | ✔ |
| Plan v3 §2: "el frontend llama a rutas que el servidor no implementa" | Coincide (11 rutas) | ✔ |
| Plan v3 §7: redacción de `x-order-token` | Existe la redacción; la cabecera aún no la usa nadie (el frontend usa `?code=`) | ◐ |
| Plan v3 §8.1: `audit_events` existe | Existe; no se escribe | ✔ (aclarar) |
| Plan v3 §14.1: CORS no registrado | Coincide | ✔ |
| README: "Fase 1", menciona la pasarela retirada | Desactualizado | ✘ |
| `.env.example`: pasarela retirada, `FULFILLMENT_ENABLED` ausente | Desactualizado | ✘ |
| `env.ts` comentarios con la pasarela retirada | Desactualizado | ✘ |
| `specs/pagos.md`: `PaymentProvider`, "se retiran en la Fase 2" | Desalineado con el propietario | ✘ |
| `specs/verificacion-jugador.md`: entidad separada | Desalineado con el propietario | ✘ |
| Comentarios del frontend: "Fase 2" (numeración antigua), "plan v2 §6.3" | Referencias obsoletas | ◐ |
| `index.html` FAQ: describe la pasarela retirada; "La confirmación… debe validarse en el backend" | Texto visible al cliente desactualizado | ✘ |
| `vite.config.ts`: comentario "Fase 0… modularización en la Fase 1" | Obsoleto | ◐ |

---

## 14. Schema vs migraciones

| Comprobación | Resultado |
|---|---|
| `drizzle-kit generate` contra `schema.ts` | "No schema changes, nothing to migrate" ✔ |
| `drizzle-kit check` | "Everything's fine" ✔ |
| Tablas en `schema.ts` | `audit_events` |
| Tablas en migraciones | `audit_events` (`0000_init.sql`) |
| Tablas documentadas como diseñadas | 9 más (`users`, `sessions`, `products`, `orders`, `order_items`, `payments`, `payment_events`, `fulfillments`, `blocklist`) — **no existen**, correctamente marcadas así en el plan v3 |
| Integración en PostgreSQL 16 | 4/4 ✔ (local y CI) |
| Migraciones destructivas | Ninguna |

---

## 15. CI vs documentación

| Paso exigido (§33) | En CI | Documentado | Estado real |
|---|---|---|---|
| install | ✔ `npm ci` | ✔ | Verde |
| lint · format · typecheck | ✔ | ✔ | Verde |
| unit | ✔ (`npm test`, incluye API) | ✔ | Verde |
| integration | ✔ PostgreSQL 16 | ✔ | Verde |
| build | ✔ | ✔ | Verde |
| audit | ✔ `--omit=dev --audit-level=high` | ✔ | Verde |
| e2e | ✔ comportamiento, 1280 px | ✔ | Run 4 rojo (intermitente), run 5 verde |
| security | ✘ | pendiente | — |
| concurrency | ✘ | pendiente | — |
| visual | ✘ (solo local) | ✔ (explicado) | — |
| accessibility | ✘ | pendiente | — |
| gitleaks | ✘ | pendiente | — |
| deploy / rollback | ✘ | pendiente | — |

Historial: runs 1–3 verdes, run 4 rojo (`b792605`), run 5 verde (`5a820f0`).

---

## 16. Cobertura por área

Sin herramienta de cobertura ni criterio cuantitativo acordado, los porcentajes **no son
medibles**; se indica el estado real.

| Área | Cobertura | Estado |
|---|---|---|
| Frontend | NOT MEASURABLE | Modular y probado como réplica del original; desconectado del dominio real |
| Backend | NOT MEASURABLE | Base técnica; 0 rutas de negocio |
| Database | NOT MEASURABLE | 1 tabla (auditoría) |
| Auth | NOT MEASURABLE | No implementada |
| Admin | NOT MEASURABLE | No implementado |
| Checkout | NOT MEASURABLE | No implementado |
| Payments | NOT MEASURABLE | No implementado |
| Mercado Pago | NOT MEASURABLE | BLOCKED |
| Player verification | NOT MEASURABLE | BLOCKED (C1); manual no implementada |
| Fulfillment | NOT MEASURABLE | No implementado |
| Security | NOT MEASURABLE | Controles base; faltan cabeceras, CSRF, rate limit, gitleaks |
| Antifraud | NOT MEASURABLE | No implementado |
| Resilience | NOT MEASURABLE | Readiness y cierre ordenado; nada más |
| Observability | NOT MEASURABLE | Logs estructurados; sin alertas ni métricas |
| Testing | NOT MEASURABLE | 61 tests ejecutados; sin cobertura configurada |
| Accessibility | NOT MEASURABLE | Violaciones conocidas sin corregir |
| Responsive | NOT MEASURABLE | 3 de 8 anchos probados; bug oculto |
| Deployment | NOT MEASURABLE | No desplegado |
| Recovery | NOT MEASURABLE | Sin backups ni runbooks |
| Documentation | NOT MEASURABLE | Plan v3 al día; specs y README desalineados |

---

## 17. Bloqueos externos

| Falta | Qué exactamente | Responsable |
|---|---|---|
| Mercado Pago | Dominios oficiales permitidos en la red del entorno; cuenta Colombia; credenciales de prueba como variables de entorno | Propietario |
| Verificación de jugador | Fuente oficial o legítima para el operador (C1) | Propietario |
| Proveedor de recargas | Solo si se quiere entrega automática | Propietario |
| Google OIDC | Cliente OAuth (client id/secret) y `ADMIN_EMAILS` | Propietario |
| Render | Cuenta/servicio y PostgreSQL gestionado (plan con backups/PITR `[A VERIFICAR]`) | Propietario |
| Correo | Proveedor transaccional | Propietario |
| Valores de negocio | TTLs, rate limits, catálogo y precios reales, horario, soporte, retención de datos | Propietario |
| Herramientas | gitleaks y axe-core no disponibles todavía en el entorno/CI (se pueden añadir en la Fase 2/6) | Equipo |

---

## 18. Siguiente fase propuesta

**Fase 2 — Core domain** (no iniciada, a la espera de las decisiones de §10 #2, #3, #7, #8):
esquema completo con migraciones, máquinas de estado de orden/pago/fulfillment con CAS y
auditoría, catálogo y checkout en servidor con límites, contrato de error en el frontend,
retirada del modo demo, del catálogo de respaldo, de la pasarela retirada y del dominio en
`localStorage`, cabeceras de seguridad y timeouts en el cliente. Mercado Pago sigue `BLOCKED`.
