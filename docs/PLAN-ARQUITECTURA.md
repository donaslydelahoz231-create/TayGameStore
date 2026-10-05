# TayGameStore — Plan de arquitectura

- **Versión:** 4
- **Fecha:** 2026-10-05
- **Cambios en v4 (implementación):** el dominio diseñado en v3 está **implementado y probado**
  (§2). Diferencias respecto al diseño v3, ya reflejadas en el código y en los specs:
  - Mercado Pago integrado con el SDK oficial 3.6.1 (`MercadoPagoPaymentGateway`): contratos
    verificados en el SDK y en la documentación oficial; **sin prueba en sandbox real**.
  - Estados internos del pago: `PENDING`, `APPROVED`, `DECLINED`, `REFUNDED`, `DISPUTED`,
    `NEEDS_REFUND`, `UNKNOWN` (mapeo en [`specs/pagos.md`](specs/pagos.md)); el vencimiento se
    gestiona en el intento (`payment_attempts`: `CREATING`, `OPEN`, `CLOSED`, `EXPIRED`, `FAILED`).
  - Entrega con máquina propia (`fulfillments`): `READY_FOR_FULFILLMENT → CLAIMED → DELIVERING →
    DELIVERED`, más `FAILED` y `CANCELLED`.
  - Pago tardío de una orden vencida ⇒ `NEEDS_REVIEW` (decisión del admin); `NEEDS_REVIEW`
    puede cerrarse como `REFUNDED` o `EXPIRED` solo sin cobros vigentes.
  - Al vencer la confirmación de pago la orden pasa a `EXPIRED` (no vuelve a verificación).
  - En producción `CHECKOUT_ENABLED=true` exige `PAYMENTS_ENABLED=true` con credenciales.
  - Documentos operativos: `deployment.md`, `runbook.md`, `incident-response.md`.
- **v3:** documento regenerado; pasarela anterior eliminada; estados de orden y pago separados.

**Marcas usadas en todo el documento**

| Marca | Significado |
|---|---|
| `IMPLEMENTADO` | Existe código **y** pruebas o evidencia (CI, ejecución) |
| `DISEÑADO` | Arquitectura decidida y documentada; sin implementación |
| `PENDIENTE` | Necesidad identificada; falta diseño detallado e implementación |
| `BLOCKED` | No puede implementarse hasta resolver una dependencia externa |
| `NO VERIFICADO` | Existe diseño o código, pero falta evidencia suficiente |
| `NEEDS_IMPLEMENTATION` | Requisito de seguridad u operación sin mecanismo implementado |
| `[A VERIFICAR]` | Dato de Mercado Pago u otro proveedor no contrastado con documentación oficial: **no se usa** hasta verificarlo |
| `[POR DEFINIR]` | Valor de negocio que fija el propietario; el sistema lo deja configurable |

---

## 1. Propósito

TayGameStore es una tienda de recargas gamer (alcance inicial: Free Fire) con un frontend
cinematográfico. Este documento define la **arquitectura vigente** y deja explícito, para
cada parte: qué existe, qué falta, qué está bloqueado, qué está verificado, qué depende de
Mercado Pago o de otro proveedor externo y qué **no debe inventarse**.

**Jerarquía de fuentes de verdad** (ante una contradicción, prevalece la de mayor nivel y la
contradicción se documenta en §4.2):

1. Seguridad e integridad financiera.
2. Decisiones explícitas del propietario.
3. [`specs/pagos.md`](specs/pagos.md) para Mercado Pago.
4. [`specs/verificacion-jugador.md`](specs/verificacion-jugador.md) para la verificación de jugador.
5. Código existente.
6. Tests y evidencia.
7. Arquitectura propuesta (este documento).
8. Documentación histórica.

---

## 2. Estado actual

Tienda funcional de punta a punta. Las ventas reales dependen de configurar Mercado Pago
(credenciales + prueba en sandbox) y de que el propietario confirme la fuente de verificación.

| Área | Estado | Evidencia |
|---|---|---|
| Servidor base, configuración validada, errores, logs con redacción, health/ready | `IMPLEMENTADO` | `tests/unit`, `tests/api` |
| Esquema completo (13 tablas, CHECK/UNIQUE/índices parciales) + auditoría append-only (trigger) | `IMPLEMENTADO` | `migrations/0001_commerce.sql`, `0002_audit_append_only.sql`; `tests/integration` |
| Catálogo, checkout idempotente, límites antifraude, blocklist, órdenes de invitado y cliente | `IMPLEMENTADO` | `tests/integration/commerce.test.ts` |
| Verificación manual del jugador + confirmación explícita del cliente | `IMPLEMENTADO` | ídem; `e2e/behavior.spec.ts` |
| Pagos Mercado Pago (preferencia, webhook firmado, consulta, conciliación, duplicados, tardíos, reembolsos) | `IMPLEMENTADO` · `NO VERIFICADO` en sandbox | `services/payments.ts`; pruebas con doble de Mercado Pago |
| Entrega manual (reclamo atómico, evidencia, liberación, fallo → revisión) | `IMPLEMENTADO` | integración + e2e del panel |
| Google OIDC + PKCE/state/nonce, sesiones opacas, admin con allowlist + TOTP + códigos de recuperación | `IMPLEMENTADO` · login real `NO VERIFICADO` (sin cliente OAuth) | `tests/integration/auth.test.ts` |
| CSP/HSTS/anti-clickjacking, CSRF, rate limiting (una instancia), llaveros rotables | `IMPLEMENTADO` | `tests/api/errors.test.ts`, `tests/unit` |
| Scheduler con advisory locks (expiración, conciliación, reintentos, reclamos, limpieza) | `IMPLEMENTADO` | integración |
| Frontend conectado (sin modo demo, sin precios fijos, sin datos personales en `localStorage`) + panel `/admin.html` | `IMPLEMENTADO` | 20 e2e; CSS de la tienda idéntico byte a byte |
| CI: calidad, integración, e2e con PostgreSQL, audit, gitleaks | `IMPLEMENTADO` | `.github/workflows/ci.yml` |
| Accesibilidad (axe-core WCAG 2.1 AA sin violaciones críticas/graves), diálogos con foco, carrito `inert`, responsive sin desbordes en 360–1920 px (sin `overflow-x:hidden`) | `IMPLEMENTADO` | `e2e/quality.spec.ts` |
| Revisión con lector de pantalla, métricas externas | `PENDIENTE` | — |
| Fuente legítima de verificación (C1), proveedor de recargas automático | `BLOCKED` (externo) | — |

## 3. Principios

1. **El cliente muestra; el servidor decide**: precios, promociones, descuentos, totales,
   estados, roles, permisos, identidad del jugador, aprobación de pagos y entrega.
2. **PostgreSQL es la fuente de verdad.** `localStorage` solo guarda preferencias y favoritos.
3. **El navegador nunca declara una compra pagada.** La fuente de verdad financiera es el
   servidor más la verificación oficial con Mercado Pago, nunca el frontend ni el redirect de pago.
4. **Ante incertidumbre financiera no se adivina:** se consulta, se reconcilia y, si sigue sin
   resolverse, `NEEDS_REVIEW` + alerta.
5. **Nunca se repite automáticamente una operación financiera o de recarga cuyo resultado
   anterior es desconocido.**
6. **Nada se inventa:** APIs, proveedores, credenciales, estados, precios, tiempos, métodos de
   pago. Sin documentación oficial ⇒ `BLOCKED`. Dobles de prueba solo en `tests/`.
7. **Una caída externa no tumba la tienda:** la lectura sigue disponible cuando es seguro;
   pagar o entregar se bloquea con un mensaje claro.
8. **Identidad visual intacta:** solo se toca lo visual por funcionalidad, seguridad,
   responsive o accesibilidad. `legacy/index-cinematic-v4.html` es la referencia congelada.
9. **Simplicidad operativa:** un solo proceso Node, mismo origen, sin microservicios, Redis,
   colas externas ni workers separados mientras no se demuestre la necesidad.

---

## 4. Decisiones confirmadas

### 4.1 Decisiones del propietario

| Tema | Decisión |
|---|---|
| Pasarela de pago | **Mercado Pago, única pasarela.** Sin alternativa ni fallback. `BLOCKED` hasta acceder a su documentación oficial y sandbox |
| Verificación de jugador | **Manual por operador** dentro del ciclo de vida de la orden mientras no exista fuente legítima; interfaz `PlayerVerifier` para un proveedor futuro |
| Recargas | **Entrega manual** (`FULFILLMENT_MODE=manual`); interfaz `TopUpProvider` para un proveedor futuro |
| Autenticación | Google OAuth/OIDC + checkout como invitado. **Sin contraseñas** mientras no haya proveedor de correo adecuado |
| Administración | Un solo rol `admin`: Google + allowlist (`ADMIN_EMAILS`) + TOTP obligatorio |
| Hosting | Render (servicio web + PostgreSQL gestionado) |
| Antifraude | Máx. **5 unidades por producto** y **1.000.000 COP por orden**; sin CAPTCHA inicialmente |
| Reembolsos | Manuales, registrados y auditados |
| Documento de compra | Se llama **"Comprobante"**; no se afirma facturación electrónica |
| Frontend | HTML/CSS/JS modular con Vite. **No** se migra a React/Next |
| Ventas reales | Prohibidas mientras C1 y Mercado Pago estén `BLOCKED` |

### 4.2 Contradicciones detectadas y resolución

| # | Contradicción | Resolución (nivel de la jerarquía §1) |
|---|---|---|
| 1 | Nombre de la abstracción de pagos: `specs/pagos.md` usa `PaymentProvider`/`MercadoPagoProvider`; el propietario fija `PaymentGateway`/`MercadoPagoPaymentGateway` | Prevalece la decisión del propietario (2). `specs/pagos.md` debe alinearse (`PENDIENTE`, Fase A) |
| 2 | Verificación: `specs/verificacion-jugador.md` describe una entidad previa a la orden con proveedor automático; el propietario fija verificación **manual dentro de la orden** e interfaz `PlayerVerifier` | Prevalece el propietario (2). Se conservan las reglas de seguridad del spec (confirmación explícita, anti-enumeración, sin scraping, revalidación). El spec debe reescribirse (`PENDIENTE`, Fase A) |
| 3 | Versiones anteriores mezclaban estados de pago y de orden | Dos máquinas separadas (§10.3 y §11.3). Los estados de Mercado Pago nunca son estados internos |
| 4 | Versiones anteriores hablaban de "centavos de COP" | El dinero se guarda como **entero en pesos colombianos** (unidad mínima que usa el sistema) con moneda explícita (§8.2) |
| 5 | Versiones anteriores y código describían otra pasarela | Eliminada de la arquitectura. Restos en código: Anexo `HISTÓRICO` |

---

## 5. Arquitectura

```
Navegador ──HTTPS──▶ Render ──▶ un proceso Node 24 (Fastify)
                                 ├─ frontend compilado (Vite) — mismo origen, sin CORS
                                 ├─ API /api/*, /auth/*
                                 ├─ scheduler interno (pg_try_advisory_lock)
                                 └─ puertos hacia el exterior:
                                     PaymentGateway ─▶ MercadoPagoPaymentGateway   (BLOCKED)
                                     PlayerVerifier ─▶ verificación manual         (DISEÑADO)
                                     TopUpProvider  ─▶ entrega manual              (DISEÑADO)
                                 ▼
                           PostgreSQL ≥ 16 (fuente de verdad)
```

- **Mismo origen:** el servidor sirve el build del frontend (`SERVE_WEB`, `IMPLEMENTADO`); no se
  habilita CORS.
- **Puertos y adaptadores:** el dominio (órdenes, pagos, entrega) depende de interfaces; los
  adaptadores externos se sustituyen sin cambiar las máquinas de estado. Hasta tener
  documentación oficial, el único adaptador de pagos es uno "no disponible" que siempre
  responde "no configurado".
- **Stack:** Node 24 LTS · TypeScript 6 · Fastify 5 · Zod 4 · PostgreSQL ≥ 16 ·
  Drizzle ORM + drizzle-kit · Vite 8 · Vitest · Playwright · axe-core (`PENDIENTE` de
  incorporar) · ESLint · Prettier · GitHub Actions.

---

## 6. Frontend

**Estado:** `IMPLEMENTADO` como modularización fiel del HTML original (Fase 1); **no** está
conectado a una API real de compra.

- Estructura: `src/web/index.html` (solo marcado), `main.js`, `styles/main.css` + 28 capas
  `styles/layers/NN-*.css` (el prefijo es el orden de cascada), `js/store/*` (estado, API, UI,
  render), `js/store/features/*` (17 módulos), `js/effects/*` (decorativos).
- Datos variables insertados con `innerHTML` pasan por `esc()` (`js/store/dom.js`).
- **Defectos conocidos** (documentados, sin corregir): desborde horizontal de `.trust` en
  ≤ 430 px oculto por `body{overflow-x:hidden}`; cajón del carrito cerrado enfocable;
  violaciones axe (`aria-allowed-attr`, `aria-required-children`, `button-name`); la primera
  "Nueva factura" repite `TGS-0001`; IDs duplicados de efectos con movimiento activado.
- **Objetivo** (`DISEÑADO`): cada operación con estados explícitos `cargando → éxito / fallo
  conocido / fallo reintentable / desconocido`; nunca spinner infinito; ante incertidumbre
  financiera "Consultar estado", nunca "Pagar de nuevo"; tolera refresh, atrás/adelante, varias
  pestañas y pérdida de red recuperando el estado del servidor; sin `onclick` inline (CSP).
- Responsive objetivo: 360, 390, 768, 1024, 1280, 1440 y 1920 px. Compatibilidad declarada solo
  con evidencia (hoy: Chromium de Playwright).

---

## 7. Backend

**Estado:** base `IMPLEMENTADO`; módulos de negocio `DISEÑADO`.

- **Implementado:** `buildApp()` con inyección de dependencias (configuración, chequeo de BD);
  límite de cuerpo 64 KiB; `x-request-id` reutilizado solo si tiene formato seguro; redacción
  en logs de `authorization`, `cookie`, `x-order-token` y `set-cookie`; errores
  `{ error: { code, message, requestId } }` sin detalles internos; `TRUST_PROXY` acotado; las
  migraciones son un paso de despliegue, nunca automáticas al arrancar.
- **Organización objetivo** por módulos: `routes` (Fastify + Zod) → `services` (dominio,
  máquinas de estado, transacciones) → `repositories` (Drizzle, SQL parametrizado) → puertos
  (`PaymentGateway`, `PlayerVerifier`, `TopUpProvider`, `Clock`).
- **Transiciones de estado:** solo las permitidas explícitamente, dentro de una transacción,
  con CAS (`UPDATE … WHERE status = <esperado>`) o `SELECT … FOR UPDATE`, y con evento de auditoría.

---

## 8. Base de datos

### 8.1 Entidades existentes (migraciones)

| Tabla | Estado | Contenido |
|---|---|---|
| `audit_events` | `IMPLEMENTADO` (migración `0000_init`) | `id` identity, `entity_type`, `entity_id`, `action`, `from_status`, `to_status`, `actor_type` (`CHECK`: `system`/`customer`/`admin`/`webhook`), `actor_id`, `data jsonb`, `ip_hash`, `created_at`; índice por entidad y fecha |

**Ninguna otra tabla existe todavía.**

### 8.2 Convenciones (`DISEÑADO`)

- UUID como clave; `timestamptz` en UTC; `CHECK`, `FOREIGN KEY`, `UNIQUE` e índices parciales.
- **Dinero:** enteros (`bigint`) en **pesos colombianos**, la unidad mínima que usa el sistema,
  con columna de moneda explícita (`currency = 'COP'`). Nunca coma flotante. El formato que
  exija Mercado Pago para el importe es `[A VERIFICAR]` y se convierte solo en el adaptador.
- `audit_events` es append-only: el rol de la aplicación sin permisos de `UPDATE`/`DELETE`
  (`DISEÑADO`).

### 8.3 Entidades diseñadas (no existen)

| Tabla | Propósito y garantías clave |
|---|---|
| `users` | `google_sub UNIQUE`, `email`, `role` (`customer`/`admin`), `status`, secreto TOTP cifrado con versión de clave, códigos de recuperación con hash |
| `sessions` | Hash del token opaco (`UNIQUE`), expiración absoluta y por inactividad, revocación, `mfa_verified_at` |
| `products` | Juego, SKU `UNIQUE`, precio y precio promocional con vigencia, estado |
| `orders` | `public_ref UNIQUE`, `checkout_key UNIQUE`, hash del token de invitado + versión de clave, totales con `CHECK`, `currency`, `status`, UID/región, resultado de verificación y operador, confirmación del cliente, `claimed_by`/`claimed_at`, versión de términos aceptada, `expires_at` |
| `order_items` | Snapshot de nombre, unidades y precio; cantidad `CHECK (1..5)` |
| `payments` | Intentos de pago: referencia propia `UNIQUE`, id de transacción del proveedor `UNIQUE` (nullable), estado interno, último estado nativo del proveedor, importe, moneda; **índice único parcial: un solo intento abierto por orden** |
| `payment_events` | Registro de notificaciones y consultas al proveedor: clave de deduplicación `UNIQUE` (`[A VERIFICAR]` qué identificador ofrece Mercado Pago), tipo, id de pago, resultado del procesamiento, campos mínimos (§14.5). Necesaria para idempotencia, auditoría y reproceso |
| `fulfillments` | Por ítem: `method` (`manual`/`provider`), estado, evidencia, `completed_by`, clave de idempotencia `UNIQUE` |
| `blocklist` | `kind` (email, UID, hash de IP, `google_sub`) + valor normalizado `UNIQUE`, motivo, expiración |

---

## 9. Autenticación y autorización (`DISEÑADO`)

- **Clientes:** Google OIDC, Authorization Code + **PKCE**, `state` (anti-CSRF del flujo) y
  `nonce` (anti-replay del ID token) ligados a una cookie temporal; validación del ID token
  (firma, `iss`, `aud`, `exp`). El correo cuenta como verificado solo si Google lo indica.
- **Sin autenticación por contraseña** mientras no exista proveedor de correo (recuperación de
  cuenta imposible de hacer de forma segura). El formulario heredado se retira.
- **Sesiones opacas:** token aleatorio de 256 bits; en BD solo su hash; cookie
  `__Host-` con `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`; rotación al iniciar sesión y al
  completar MFA; expiración absoluta e inactividad `[POR DEFINIR]`; revocación en logout.
- **Invitados:** sin cuenta; acceso a su orden con token (§10.4).
- **Admin:** Google + correo en `ADMIN_EMAILS` + rol asignado por CLI + **TOTP obligatorio** en
  cada sesión; **códigos de recuperación** de un solo uso guardados con hash; sesión corta;
  toda acción auditada.
- **Autorización siempre en servidor:** usuario, rol y permisos salen de la sesión. La
  propiedad de una orden se comprueba **en la consulta SQL**; orden inexistente y orden ajena
  responden igual (`404`) para evitar IDOR/enumeración.

---

## 10. Checkout

### 10.1 Creación de la orden (`DISEÑADO`) — `POST /api/checkout`

Validar con Zod → interruptores (`CHECKOUT_ENABLED`, mantenimiento) → límites antifraude →
blocklist → productos y precios **desde la BD** → promociones vigentes → total → términos →
crear la orden en `AWAITING_VERIFICATION` con snapshot de precios → devolver referencia y token
de acceso. El servidor **recalcula todo**; un precio o total enviado por el cliente nunca se
acepta (si el total que vio difiere: `409 PRICE_CHANGED`). Idempotente por `checkout_key`
(§14.2).

### 10.2 "Confirmar y pagar" (`DISEÑADO`)

Pantalla final antes de iniciar el pago, construida con datos del servidor: productos,
cantidades, precio unitario, descuentos, total, moneda, UID, nickname verificado (cuando
aplique), región, método de pago (Mercado Pago, solo si `PAYMENTS_ENABLED`) y términos. Botón
**"Confirmar y pagar"**: deshabilitado tras el primer clic, sin envío por Enter accidental; el
servidor revalida todo y el inicio del intento de pago es idempotente (doble clic, refresh,
atrás o varias pestañas devuelven el mismo intento abierto).

### 10.3 Ciclo de vida de la orden

Estados: `AWAITING_VERIFICATION`, `REJECTED`, `AWAITING_PAYMENT`, `PAID`, `DELIVERING`,
`DELIVERED`, `NEEDS_REVIEW`, `EXPIRED`, `REFUNDED`. La creación es un evento
(`ORDER_CREATED`), no un estado.

| Desde | Hacia | Disparador |
|---|---|---|
| — | `AWAITING_VERIFICATION` | Checkout válido |
| `AWAITING_VERIFICATION` | `AWAITING_PAYMENT` | Operador registra verificación positiva **y** el cliente confirma "Sí, es mi cuenta" |
| `AWAITING_VERIFICATION` | `REJECTED` | Verificación negativa o el cliente indica que no es su cuenta |
| `AWAITING_PAYMENT` | `AWAITING_VERIFICATION` | La verificación caducó y no hay intento de pago abierto |
| `AWAITING_VERIFICATION`, `AWAITING_PAYMENT` | `EXPIRED` | Vencimiento sin intento de pago abierto |
| `AWAITING_PAYMENT` | `PAID` | Intento `APPROVED` y validado (referencia, importe, moneda, orden) |
| `EXPIRED` | `PAID` o `NEEDS_REVIEW` | Pago aprobado tardío y válido: el pago gana; si ya no puede entregarse → `NEEDS_REVIEW` |
| `PAID` | `DELIVERING` | Reclamo atómico del admin |
| `DELIVERING` | `PAID` | El admin libera el reclamo |
| `DELIVERING` | `DELIVERED` | Todos los ítems entregados con evidencia |
| `AWAITING_PAYMENT`, `PAID`, `DELIVERING` | `NEEDS_REVIEW` | Discrepancia de importe/moneda/referencia, entrega parcial o resultado incierto |
| `NEEDS_REVIEW` | `DELIVERING` / `REFUNDED` | Decisión del admin |
| `PAID`, `DELIVERED` | `REFUNDED` | Reembolso registrado por el admin |

### 10.4 Acceso de invitados a su orden (`DISEÑADO`)

- Token aleatorio de 256 bits, mostrado una sola vez; en BD solo `HMAC(ORDER_TOKEN_PEPPER, token)`
  con versión de clave.
- Se envía en la cabecera `x-order-token` (ya redactada en logs), **nunca** en la query string
  (quedaría en logs, historial y `Referer`). El frontend heredado usa `?code=` y se corrige.
- Enlace de acceso con fragmento `#t=…`: el fragmento no llega al servidor ni al `Referer`, pero
  **es legible por cualquier JavaScript de la página (XSS) y queda en el historial**. Mitigación:
  al cargar, el frontend lee el fragmento, lo elimina con `history.replaceState` y lo canjea en
  una petición `POST` por una cookie `__Host-` `HttpOnly` limitada a esa orden; a partir de ahí el
  token no vive en JavaScript. CSP estricta como defensa adicional.
- `localStorage` **no es seguro por sí mismo** (cualquier XSS lo lee); no se guarda en él el token.
- Sin proveedor de correo, el token no se puede reenviar: se advierte al cliente que guarde el
  enlace. Recuperación por correo: `PENDIENTE` (proveedor de correo por elegir).

---

## 11. Pagos — Mercado Pago

**Estado: `IMPLEMENTADO` con el SDK oficial; `NO VERIFICADO` en sandbox** (dominios de Mercado
Pago bloqueados en el entorno de desarrollo). Detalle y checklist de salida:
[`specs/pagos.md`](specs/pagos.md) (prevalece en todo lo específico de Mercado Pago).

### 11.1 Arquitectura

- Interfaz `PaymentGateway`; implementación objetivo `MercadoPagoPaymentGateway`. Hasta el
  desbloqueo solo existe un adaptador "no disponible".
- El checkout **no muestra Mercado Pago como disponible** mientras `PAYMENTS_ENABLED=false`
  (hoy obligatorio en todos los entornos).
- Nunca se simula un pago aprobado fuera de las pruebas.

### 11.2 Qué se fija solo con documentación oficial

Todo lo siguiente es `[A VERIFICAR]` y **no se implementa por suposición**: tipo de checkout,
endpoints, SDK, autenticación, preferencias, consulta de pagos, webhooks (formato, firma,
cabeceras, reintentos, respuesta esperada), estados nativos, reembolsos, expiración, sandbox,
producción, URLs de retorno y callbacks, dominios de CSP y formato del importe.

### 11.3 Ciclo de vida del intento de pago (estados internos)

`PENDING` · `APPROVED` · `DECLINED` · `EXPIRED` · `REFUNDED` · `NEEDS_REFUND`
(definidos en `specs/pagos.md`). El estado nativo de Mercado Pago se guarda aparte, solo como
dato informativo; su **mapeo** a estos estados se define en `specs/pagos.md` tras verificar la
documentación oficial.

| Desde | Hacia | Disparador |
|---|---|---|
| — | `PENDING` | Intento creado (máx. uno abierto por orden) |
| `PENDING` | `APPROVED` | Consulta oficial confirma aprobación y coinciden referencia, importe, moneda y orden |
| `PENDING` | `DECLINED` / `EXPIRED` | Consulta oficial o vencimiento |
| `APPROVED` | `NEEDS_REFUND` | Pago aprobado que no debe conservarse (segundo pago de la misma orden, orden ya no entregable) |
| `APPROVED`, `NEEDS_REFUND` | `REFUNDED` | Reembolso confirmado por el proveedor y registrado |

Un resultado **desconocido** (timeout, error de red) no cambia el estado: el intento sigue
`PENDING` y lo resuelve la reconciliación (§16).

**Relación con la orden:** `APPROVED` válido ⇒ orden `PAID`; `DECLINED`/`EXPIRED` ⇒ la orden
sigue `AWAITING_PAYMENT` y puede abrirse un nuevo intento; discrepancia ⇒ orden `NEEDS_REVIEW`;
`NEEDS_REFUND` no altera una orden ya pagada (nunca se entrega dos veces).

### 11.4 Para desbloquear

1. Permitir en la red del entorno los dominios oficiales de Mercado Pago (lista exacta `[A VERIFICAR]`).
2. Cuenta de Mercado Pago Colombia y credenciales **de prueba** como variables de entorno,
   nunca en código ni en Git.

---

## 12. Verificación de jugador

**Estado:** flujo manual `IMPLEMENTADO`; la fuente legítima que usa el operador la define el
propietario (C1). Spec: [`specs/verificacion-jugador.md`](specs/verificacion-jugador.md).

- Flujo: `ORDER_CREATED` → `AWAITING_VERIFICATION` → el operador verifica y registra nickname,
  región y resultado → el cliente ve "Vas a recargar a: [nickname] — ID: [UID] — Región:
  [región]" y confirma "Sí, es mi cuenta" → `AWAITING_PAYMENT`.
- El navegador nunca aporta el nickname; el destino de la recarga es el UID/región guardados en la orden.
- Resultado inexistente, ambiguo, bloqueado o inconsistente ⇒ no se paga. Mensajes genéricos
  para no facilitar la enumeración; rate limiting por IP/UID.
- La verificación caduca (`[POR DEFINIR]`); caducada antes del pago ⇒ vuelve a
  `AWAITING_VERIFICATION`.
- Futuro proveedor automático: interfaz `PlayerVerifier`, sin cambiar la máquina de estados.
  **Sin API oficial: ni scraping, ni endpoints inventados, ni "API temporal".**
- Nunca se solicitan contraseñas del juego.

---

## 13. Fulfillment / recargas

- **Manual** (`FULFILLMENT_MODE=manual`, `IMPLEMENTADO`): `READY_FOR_FULFILLMENT → CLAIMED →
  DELIVERING → DELIVERED` (o `FAILED` → revisión), reclamo atómico con CAS, evidencia por
  orden, liberación manual o por tiempo, nunca sin pago aprobado y correcto, auditoría.
  Interruptor `FULFILLMENT_ENABLED` (`IMPLEMENTADO`).
- **Proveedor automático** (`TopUpProvider`, `BLOCKED`): solo con documentación oficial; clave
  de idempotencia por ítem, creación, consulta de estado, timeout. Respuesta ambigua ⇒ consulta
  de estado → si sigue sin resolverse, `NEEDS_REVIEW`. **Nunca reintento ciego.** No se inventa proveedor.

---

## 14. Seguridad

### 14.1 Controles

| Control | Estado |
|---|---|
| Validación de entrada con Zod, límite de cuerpo, errores sin detalles internos | `IMPLEMENTADO` (base); por endpoint `DISEÑADO` |
| Logs con redacción de credenciales; la configuración inválida muestra el nombre de la variable, nunca su valor | `IMPLEMENTADO` (`tests/unit/logging.test.ts`, `env.test.ts`) |
| Secretos solo en variables de entorno; `.env` y claves en `.gitignore` | `IMPLEMENTADO` |
| CSP por cabecera (sin `unsafe-eval`; retirada de `unsafe-inline`), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'` | `DISEÑADO`. Hoy solo hay una CSP `<meta>` heredada con `'unsafe-inline'` |
| CSRF: cabecera personalizada obligatoria + `Origin`/`Sec-Fetch-Site` + solo JSON; webhooks autenticados según la documentación del proveedor | `DISEÑADO` |
| CORS: no se habilita (mismo origen) | `IMPLEMENTADO` (no hay CORS registrado) |
| Rate limiting (§15) | `DISEÑADO` |
| SQL parametrizado (Drizzle) | `IMPLEMENTADO` en lo existente |
| IDOR: propiedad comprobada en SQL, `404` uniforme | `DISEÑADO` |
| XSS: `esc()` en `innerHTML`, CSP estricta | Parcial (`esc()` `IMPLEMENTADO`) |
| SSRF: el servidor nunca llama a URLs aportadas por el usuario; destinos externos fijos | `DISEÑADO` |
| Auditoría de acciones sensibles | Tabla `IMPLEMENTADO`; escritura `DISEÑADO` |
| gitleaks en CI | `PENDIENTE` |
| `npm audit --omit=dev --audit-level=high` en CI | `IMPLEMENTADO` |

### 14.2 Idempotencia y doble pago (`DISEÑADO`)

- `checkout_key UNIQUE`: el mismo envío devuelve la misma orden; no depende de IP + User-Agent.
- Transacciones PostgreSQL en toda operación que cambie estado; CAS o `FOR UPDATE` sobre la
  orden y el intento.
- **Máximo un intento de pago abierto por orden** (índice único parcial sobre `payments`).
- **Id de transacción del proveedor `UNIQUE`**: el mismo pago no se aplica dos veces.
- **Webhook duplicado:** clave de deduplicación `UNIQUE` en `payment_events`; además los
  estados solo avanzan (CAS), así que reprocesar no tiene efecto.
- **Doble pago:** un segundo pago aprobado de la misma orden ⇒ `NEEDS_REFUND` + alerta; la
  orden se entrega una sola vez.

### 14.3 Secretos

Nunca en frontend, Git ni logs. En el repositorio solo `.env.example` sin valores.
Credenciales de Mercado Pago: variables de entorno, nombres `[A VERIFICAR]`.

### 14.4 Rotación de claves (`NEEDS_IMPLEMENTATION`)

Hoy **no existe** ninguna de estas claves en el código ni versionado de claves.

| Clave | Uso | Rotación sin invalidar todo |
|---|---|---|
| `ORDER_TOKEN_PEPPER` | HMAC de los tokens de invitado | Llavero versionado (activa + anteriores); cada hash guarda su versión; se verifica con la versión registrada y se re-hashea con la activa en el siguiente acceso válido; la anterior se retira cuando no queden órdenes abiertas que la usen |
| `IP_HASH_PEPPER` | Hash de IP para rate limiting, blocklist y auditoría | Versionado igual; rotar rompe la correlación con hashes antiguos (aceptado: retención corta). Las entradas de blocklist por IP guardan la versión y se recalculan o expiran |
| `MFA_ENCRYPTION_KEY` | Cifrado autenticado de secretos TOTP | Identificador de clave en cada texto cifrado; descifrar con la clave indicada y re-cifrar con la activa (al iniciar sesión o con un script); retirar la antigua al terminar |

Los tokens de sesión se guardan con un hash sin pepper: no dependen de estas claves.

### 14.5 Datos sensibles

- **Minimización:** de las respuestas y notificaciones del proveedor se guardan solo los campos
  necesarios (ids, estado nativo, importe, moneda, fechas, referencia) más un hash del cuerpo
  para auditoría. **No** se guarda la respuesta completa en un `jsonb` sin filtrar: puede
  contener PII del pagador o datos de pago.
- `audit_events.data` sigue la misma regla: metadatos mínimos, sin tokens, cookies, secretos ni
  datos de pago.
- PII tratada: email, nombre opcional, UID/nickname, hash de IP. Retención `[POR DEFINIR]`
  (requisito legal pendiente de revisión por el propietario).
- Nunca se registran cookies, tokens, secretos ni credenciales.

---

## 15. Antifraude

Siempre en servidor (`DISEÑADO`):

- Máx. 5 unidades por producto (`CHECK` + Zod) y máx. 1.000.000 COP por orden.
- Órdenes abiertas por email y por UID: límite `[POR DEFINIR]`.
- Blocklist por email, UID, hash de IP y `google_sub`.
- **Rate limiting:** por IP, email y UID con valores `[POR DEFINIR]`. Diseño inicial **en
  memoria del proceso**: correcto **solo con una instancia**; no es una solución distribuida.
  Mientras sea así, el despliegue se limita a **una instancia**; escalar horizontalmente exige
  antes un mecanismo compartido (por ejemplo, contadores en PostgreSQL).
- Sin CAPTCHA inicialmente (decisión del propietario).

---

## 16. Resiliencia

Reglas: timeout en toda llamada externa; reintentos solo en operaciones seguras, acotados, con
backoff y jitter; **una operación financiera o de recarga con resultado desconocido nunca se
repite automáticamente**: se consulta su estado y se reconcilia.

| Situación | Comportamiento |
|---|---|
| PostgreSQL caído | `/api/ready` = 503 (`IMPLEMENTADO`); escrituras fallan sin estado parcial (transacciones) |
| Reinicio de Node | Estado en PostgreSQL; cierre ordenado ante `SIGTERM` (`IMPLEMENTADO`); al arrancar, el scheduler reconcilia lo pendiente |
| Pérdida de red / timeout hacia Mercado Pago | El intento queda `PENDING`; reconciliación posterior; el cliente ve "Consultar estado" |
| Mercado Pago no disponible | No se inician pagos nuevos; el catálogo y el estado de órdenes siguen disponibles |
| Webhook retrasado, fuera de orden o reintentado | Se consulta el estado oficial antes de aplicar nada; los estados solo avanzan |
| Webhook duplicado | Deduplicación en `payment_events` + CAS |
| Retorno del navegador simultáneo al webhook | El retorno solo dispara una consulta en servidor; ambos caminos convergen con CAS y `FOR UPDATE` |
| Resultado financiero desconocido | `PENDING` → reconciliación → si no se resuelve en el plazo `[POR DEFINIR]`, `NEEDS_REVIEW` + alerta |
| Proveedor de recargas caído | Entrega manual; con proveedor automático, la orden queda `PAID` y se alerta |
| Refresh, doble clic, varias pestañas | Idempotencia (`checkout_key`, intento abierto único); la UI recupera el estado del servidor |
| `MAINTENANCE_MODE` | Solo lecturas; las rutas `/api/webhooks/*` siguen aceptándose (`IMPLEMENTADO`) |

---

## 17. Observabilidad

- **Implementado:** logs JSON (pino vía Fastify) con `requestId` en cada línea y en la cabecera
  `x-request-id`; redacción de credenciales; `/api/health` sin log por petición.
- **Diseñado:** campos `orderId`, `paymentId`, `providerTransactionId` e id de evento cuando
  existan; auditoría de login, logout, MFA, transiciones de orden y pago, verificación,
  confirmación, reclamo, entrega, reembolsos, blocklist, catálogo y acciones de admin.
- **Alertas** (`DISEÑADO`, canal inicial: panel admin): 5xx, pagos `PENDING` demasiado tiempo,
  `NEEDS_REVIEW`, `NEEDS_REFUND`, webhook inválido, fallos repetidos del proveedor, órdenes
  `PAID` sin entrega. Métricas externas: `PENDIENTE`.

---

## 18. API

| Ruta | Estado |
|---|---|
| `GET /api/health`, `GET /api/ready`, `GET /api/config` | `IMPLEMENTADO` |
| `GET /api/catalog`, `POST /api/checkout`, `GET /api/orders`, `GET /api/orders/:ref`, `POST /api/orders/:ref/confirm-player`, `POST /api/orders/:ref/pay` | `DISEÑADO` |
| `GET /auth/google`, `GET /auth/google/callback`, `GET /api/auth/me`, `POST /api/auth/logout` | `DISEÑADO` |
| `/api/admin/*` (verificación, reclamo, entrega, revisión, reembolsos, catálogo, blocklist, auditoría, alertas, MFA) | `DISEÑADO` |
| Webhook (`/api/webhooks/…`) y retorno de Mercado Pago | `BLOCKED` |

Contrato de error estable `{ error: { code, message, requestId } }`; el frontend traduce por
`code` (`src/shared/errors.ts`).

---

## 19. Scheduler (`DISEÑADO`)

Tareas dentro del mismo proceso Node; cada una toma `pg_try_advisory_lock` y, si no lo obtiene,
no se ejecuta (seguro con varias instancias o reinicios). Todas son idempotentes.

| Tarea | Función |
|---|---|
| Expiración | Pasa a `EXPIRED` órdenes vencidas sin intento abierto; vence intentos `PENDING` según el proveedor `[A VERIFICAR]` |
| Reconciliación de pagos | Consulta a Mercado Pago los intentos `PENDING` y aplica el resultado oficial |
| Recuperación | Al arrancar: reclamos de entrega abandonados, intentos inciertos, alertas pendientes |
| Limpieza | Sesiones expiradas y retención de `payment_events` `[POR DEFINIR]` |

Intervalos `[POR DEFINIR]`. No se introduce worker externo ni cola sin necesidad demostrada.

---

## 20. CI/CD

Workflow `.github/workflows/ci.yml` (en `push` y `pull_request`, permisos `contents: read`):

| Job | Pasos | Estado |
|---|---|---|
| `quality` | `npm ci`, lint, `format:check`, typecheck, unitarias + API, build, `npm audit --omit=dev --audit-level=high` | Configurado; verde en todos los runs |
| `integration` | Pruebas de integración con servicio `postgres:16` | Configurado; verde en todos los runs |
| `e2e` | Chromium de Playwright + `npm run test:e2e` (comportamiento, 1280 px) | Configurado; **falló en el run 4** |

Historial en la rama de desarrollo: runs 1–3 verdes; **run 4 (commit `b792605`, solo
documentación) en rojo**: el test de modo demo falló al cerrar el acceso como invitado
(`#loginModal` siguió visible) con el mismo código que pasó en el run 3 ⇒ fallo
**intermitente** en el frontend o en la prueba. No se reprodujo en 15 repeticiones locales;
causa raíz `NO VERIFICADO`. Pendiente de diagnóstico y corrección (no se oculta ni se
desactiva la prueba).

**Pendiente:** gitleaks, pruebas de seguridad, axe-core, referencias visuales en CI (hoy solo
locales: dependen del motor de render), e2e en más viewports, actualización de las actions
afectadas por la retirada de Node 20 en los runners, despliegue continuo.

---

## 21. Testing

| Suite | Contenido | Estado |
|---|---|---|
| `tests/unit` | Configuración, logging, utilidades de tiempo (16) | `IMPLEMENTADO` |
| `tests/api` | Health, errores, mantenimiento (20) | `IMPLEMENTADO` |
| `tests/integration` | PostgreSQL real, migraciones (4); exige una base `*_test` | `IMPLEMENTADO` |
| `e2e/behavior.spec.ts` | Caracterización del frontend sin backend (21; uno marcado `test.fail` por un defecto conocido) | `IMPLEMENTADO`; un test intermitente (§20) |
| `e2e/visual.spec.ts` | Referencias del HTML original en 360/768/1280 px | `IMPLEMENTADO`, solo local |

Por fase se añaden: seguridad (IDOR, CSRF, XSS, manipulación de precio y rol, tokens, rate
limiting), concurrencia (doble checkout, webhooks duplicados, webhook + consulta, dos admins
reclamando, doble pago, pago tardío), accesibilidad (axe-core). **Pruebas de pagos solo con
datos tomados de la documentación oficial**; dobles de prueba solo en `tests/`.

---

## 22. Deployment

- **Objetivo** (`DISEÑADO`): Render, un servicio web Node + PostgreSQL gestionado con backups;
  **una sola instancia** mientras el rate limiting sea en memoria. Los detalles de la
  plataforma (comando previo al despliegue, health check, backups/PITR del plan contratado)
  son `[A VERIFICAR]` con la documentación de Render.
- Secuencia: `npm ci` → `npm run build` → `npm run db:migrate:prod` (paso de despliegue) →
  `npm start`. Readiness: `/api/ready`.
- En producción el servidor exige `PUBLIC_BASE_URL` con `https` y `DATABASE_URL`
  (`IMPLEMENTADO`).
- Entorno de staging, Dockerfile, guía `docs/deployment.md` y referencia de variables
  `docs/variables-entorno.md`: `PENDIENTE`. Variables actuales: `.env.example`.

---

## 23. Runbooks

`PENDIENTE` (ninguno existe todavía): `docs/runbooks/pagos.md` (pago pendiente, doble pago,
`NEEDS_REFUND`, discrepancias), `docs/runbooks/recuperacion.md` (restauración de BD, reinicio,
reconciliación manual), `docs/runbooks/incidentes.md` (activar `MAINTENANCE_MODE`, desactivar
checkout/pagos/entrega, comunicación). Cada uno debe distinguir lo implementado de lo que aún no existe.

---

## 24. Riesgos

| Riesgo | Mitigación |
|---|---|
| Habilitar ventas sin verificación ni pagos reales | El servidor se niega a arrancar con `CHECKOUT_ENABLED`/`PAYMENTS_ENABLED` activados donde está prohibido |
| Implementar Mercado Pago por suposición | Todo detalle del proveedor `[A VERIFICAR]`; integración `BLOCKED` |
| Código heredado del frontend (modo demo con pago simulado, `localStorage`, pasarela retirada) llega a producción | Retirada en la Fase B; las ventas siguen bloqueadas |
| Prueba e2e intermitente oculta regresiones | Diagnosticar la causa raíz antes de seguir (§20) |
| Rate limiting en memoria con varias instancias | Una sola instancia hasta tener mecanismo compartido |
| Rotación de claves sin versionado | Llavero versionado `NEEDS_IMPLEMENTATION` antes de usar las claves |
| Guardar respuestas completas del proveedor | Minimización (§14.5) |
| CSP con `'unsafe-inline'` | CSP por cabecera y retirada progresiva |
| `esbuild` antiguo vía `drizzle-kit` (solo desarrollo, moderada) | Riesgo aceptado; revisar en cada actualización de `drizzle-kit` |

---

## 25. Bloqueos

| Bloqueo | Afecta a | Desbloqueo (responsable: propietario) |
|---|---|---|
| Red y credenciales de Mercado Pago | Fase F, ventas | Permitir los dominios oficiales en el entorno + credenciales de prueba como variables de entorno |
| C1: fuente legítima de verificación | Uso real de la Fase E, ventas | Confirmar una fuente oficial o legítima para el operador |
| Proveedor de recargas | Entrega automática (no la manual) | Proveedor legítimo con documentación oficial |
| Cliente OAuth de Google y `ADMIN_EMAILS` | Pruebas reales de la Fase C | Crear el cliente OAuth |
| Valores `[POR DEFINIR]` | Configuración | Horario, tiempos de entrega, TTLs, rate limits, catálogo y precios reales, soporte, retención de datos |
| Dominio, proveedor de correo, textos legales, revisión fiscal | Lanzamiento (Fase I) | Decisión y contratación |

---

## 26. Roadmap por fases

No se avanza a una fase que dependa de un bloqueo externo.

| Fase | Contenido | Depende de | Estado |
|---|---|---|---|
| 0–1 (previas) | Infraestructura base; modularización del frontend | — | Hechas |
| **A** | Auditoría y corrección de arquitectura y documentación (este documento, specs, runbooks, deployment, variables) | — | En curso |
| **B** | Core backend + DB: esquema completo, máquinas de estado, auditoría, scheduler, cabeceras de seguridad, CSRF, rate limiting, retirada del código heredado (modo demo, pasarela retirada, `localStorage` como fuente de verdad) | A | Pendiente |
| **C** | Google OIDC, sesiones, admin + TOTP + códigos de recuperación | B; cliente OAuth | Pendiente |
| **D** | Catálogo, checkout, órdenes, "Confirmar y pagar" en el frontend | B | Pendiente |
| **E** | Verificación manual y entrega manual (panel admin) | B, C; uso real `BLOCKED` (C1) | Pendiente |
| **F** | Mercado Pago oficial + sandbox | **`BLOCKED`** | Bloqueada |
| **G** | Resiliencia, reconciliación, antifraude, alertas | B–E (pagos: F) | Pendiente |
| **H** | Responsive, accesibilidad, rendimiento | D, E | Pendiente |
| **I** | Staging, auditoría de seguridad, producción | Todas | Pendiente |

---

## 27. Evidencia / estado de implementación

| Elemento | Evidencia | Verificado |
|---|---|---|
| Configuración y rechazo de interruptores prohibidos | `tests/unit/env.test.ts` | Sí (CI) |
| Redacción de logs y `requestId` | `tests/unit/logging.test.ts` | Sí (CI) |
| Health, readiness, formato de error, mantenimiento | `tests/api/*` | Sí (CI) |
| Migraciones y `audit_events` en PostgreSQL 16 | `tests/integration/database.test.ts` | Sí (CI) |
| Build de frontend y servidor | `npm run build` | Sí (CI) |
| Comportamiento del frontend heredado | `e2e/behavior.spec.ts` | Parcial: un test intermitente (§20) |
| Fidelidad visual tras la modularización | `e2e/visual.spec.ts` | Sí, solo local |
| Dependencias de producción sin vulnerabilidades altas | `npm audit` en CI | Sí (CI) |
| Todo lo marcado `DISEÑADO`, `PENDIENTE` o `BLOCKED` | — | No |

---

## Anexo — Historial (`HISTÓRICO`, no es arquitectura vigente)

- v1 y v2 de este plan usaban otra pasarela (Wompi). El propietario la eliminó el 2026-10-05
  sin alternativa ni fallback. Todos sus restos (código, CSP, textos, pruebas, configuración)
  se eliminaron del repositorio en la implementación v4.
