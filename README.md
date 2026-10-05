# TayGameStore

Tienda de recargas gamer (Free Fire): frontend cinematográfico + API Node/Fastify +
PostgreSQL + pagos con **Mercado Pago** (Checkout Pro).

> **Estado:** tienda funcional de punta a punta (catálogo → pedido → verificación del jugador →
> confirmación → pago con Mercado Pago → entrega manual → comprobante e historial) con panel de
> administración. Mercado Pago está integrado con el **SDK oficial**, pero **no se ha probado
> contra su sandbox real** (dominios bloqueados en el entorno de desarrollo): antes de vender,
> completa el checklist de [`docs/specs/pagos.md`](docs/specs/pagos.md).
> La verificación del jugador es **manual por el operador**. La consulta instantánea estilo
> LootBar (ID → nickname y región al momento) está lista en el código, pero **bloqueada** hasta
> contratar un proveedor autorizado (no existe API oficial pública de Garena; sin scraping).

## Requisitos

- **Node 24 LTS** (`.nvmrc`; `engine-strict` impide instalar con otra versión mayor).
- **PostgreSQL ≥ 16**.

## Puesta en marcha (desarrollo)

```bash
nvm use
npm ci
cp .env.example .env        # completa DATABASE_URL; nunca subas .env a Git
npm run db:migrate          # aplica las migraciones
npm run db:seed:dev         # catálogo de EJEMPLO (precios del HTML original; nunca en producción)
npm run dev                 # API en http://127.0.0.1:3000
npm run dev:web             # frontend en http://127.0.0.1:5173 (proxy /api y /auth → 3000)
```

Para crear pedidos en local: `CHECKOUT_ENABLED=true`. Para pagar: `PAYMENTS_ENABLED=true` con
credenciales **de prueba** de Mercado Pago y un `PUBLIC_BASE_URL` público (Mercado Pago debe
poder enviar el webhook; p. ej. un túnel https).

Producción: [`docs/deployment.md`](docs/deployment.md) — Blueprint [`render.yaml`](render.yaml)
(Render + PostgreSQL), dominio, Google OAuth, catálogo, textos legales y orden de activación.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/donaslydelahoz231-create/TayGameStore)

El botón crea en tu cuenta de Render el servicio web y la base de datos de `render.yaml` y te pide
las variables secretas (Mercado Pago, Google, `ADMIN_EMAILS`…); ninguna está en el repositorio.
Render debe tener acceso a este repositorio privado (conecta tu cuenta de GitHub en Render).
Después configura la vigilancia: [`docs/autorreparacion.md`](docs/autorreparacion.md).

## Probar la tienda sin servidor (entorno de prueba)

```bash
npm run build:preview   # genera dist/preview/
python3 -m http.server 8080 -d dist/preview   # o cualquier servidor estático
```

`tools/preview/shim.js` responde a las rutas `/api/*` dentro del navegador con las mismas reglas
del servidor (precios, estados del pedido, verificación, entrega) y guarda los datos en el
navegador. El pago es una **pasarela de prueba** (no es Mercado Pago; nada se cobra) y el acceso
con Google/Discord/Facebook crea una sesión de prueba. Un aviso fijo lo indica en todo momento.
**Nunca se despliega**: el servidor solo sirve `dist/web`.

## Flujo de compra

1. El cliente elige paquetes (precios del servidor; máx. 5 unidades por paquete y
   1.000.000 COP por pedido), escribe el UID y sus datos y pulsa **Crear pedido**.
2. El operador verifica nickname y región desde `/admin.html`.
3. El cliente ve "Vas a recargar a: …" y confirma **Sí, es mi cuenta**.
4. **Confirmar y pagar** muestra el resumen completo y redirige a Mercado Pago.
5. El servidor confirma el pago (webhook firmado + consulta a la API) — nunca el navegador.
6. El operador reclama y entrega la recarga con evidencia; el cliente ve el estado en tiempo real.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run lint` / `format:check` / `typecheck` | ESLint (tipado), Prettier, TypeScript |
| `npm test` | Unitarias + API (sin base de datos) |
| `npm run test:integration` | PostgreSQL real (`TEST_DATABASE_URL`, base terminada en `_test`: **se borra su esquema**) |
| `npm run test:e2e` | Playwright contra el servidor real + PostgreSQL (`E2E_DATABASE_URL`) con Mercado Pago simulado; incluye accesibilidad (axe-core, WCAG 2.1 AA) y responsive sin desbordes en 360–1920 px |
| `npm run test:visual` | Referencias visuales (360/768/1280 px) |
| `npm run build` | Build de frontend (tienda + admin) y servidor |
| `npm run db:generate` | Genera una migración desde `src/server/db/schema.ts` (revísala) |
| `npm run mp:sandbox -- …` | Prueba Mercado Pago con **tu cuenta de prueba** (se niega si `MP_MODE` no es `sandbox`): [`docs/sandbox-mercadopago.md`](docs/sandbox-mercadopago.md) |
| `npm run perf:orders` / `perf:api` | Mediciones de rendimiento reproducibles (base `_test`) |
| `npm run check` | lint + formato + typecheck + tests + build |

## API

| Ruta | Acceso |
|---|---|
| `GET /api/health`, `/api/ready`, `/api/config` | Público |
| `GET /api/catalog` | Público |
| `POST /api/player/lookup` | Invitado o cliente (CSRF, 20/10 min); 503 si no hay proveedor |
| `POST /api/checkout` | Invitado o cliente (CSRF, rate limit, idempotente) |
| `GET /api/orders`, `GET /api/orders/:ref` | Dueño (cookie de invitado, sesión o `x-order-token`) |
| `POST /api/orders/:ref/confirm-player`, `/pay`, `/sync` | Dueño |
| `POST /api/webhooks/mercadopago` | Mercado Pago (firma `x-signature`) |
| `GET /auth/google`, `/auth/google/callback`, `GET /api/auth/me`, `POST /api/auth/logout` | Google OIDC + PKCE |
| `GET /auth/discord`, `/auth/facebook` (+ `/callback`, `?vincular=1`) | Clientes: Discord (PKCE) y Facebook; vinculación explícita |
| `/api/admin/*` | Admin (Google + `ADMIN_EMAILS` + TOTP) |

Errores: `{ "error": { "code", "message", "requestId" } }`; cada respuesta lleva `x-request-id`.

## Seguridad (resumen)

CSP estricta por cabecera (`script-src 'self'`), HSTS con https, anti-clickjacking, CSRF
(cabecera + Origin/Sec-Fetch-Site), cookies `__Host-` HttpOnly/SameSite, sesiones opacas con
hash, TOTP + códigos de recuperación para admin, rate limiting (en memoria: **una instancia**),
validación Zod estricta, SQL parametrizado, IDOR con 404 uniforme, auditoría append-only,
secretos solo por variables de entorno con llaveros rotables, gitleaks y `npm audit` en CI.
Pagos: `MP_MODE` declarado y contrastado con `live_mode` de cada pago (un pago de prueba nunca
se entrega en producción). Detalle: [`docs/PLAN-ARQUITECTURA.md`](docs/PLAN-ARQUITECTURA.md).

## Documentación

- [`CHANGELOG.md`](CHANGELOG.md) — versión 1.0.0-rc.1 y pasos antes de la 1.0.0
- [`docs/PLAN-ARQUITECTURA.md`](docs/PLAN-ARQUITECTURA.md) — arquitectura y estado
- [`docs/specs/pagos.md`](docs/specs/pagos.md) — Mercado Pago
- [`docs/specs/verificacion-jugador.md`](docs/specs/verificacion-jugador.md) — verificación
- [`docs/sandbox-mercadopago.md`](docs/sandbox-mercadopago.md) — sandbox paso a paso
- [`docs/dinero-y-acceso.md`](docs/dinero-y-acceso.md) — a dónde va el dinero y cómo solo tú administras
- [`docs/deployment.md`](docs/deployment.md) · [`docs/runbook.md`](docs/runbook.md) ·
  [`docs/incident-response.md`](docs/incident-response.md)
- [`docs/autorreparacion.md`](docs/autorreparacion.md) — vigilancia con reinicio automático y
  mantenimiento semanal con GitHub Actions

## Pendiente (no se inventa)

- Probar Mercado Pago en sandbox con tu cuenta de prueba (`npm run mp:sandbox` y la guía
  `docs/sandbox-mercadopago.md`) y después en producción.
- Fuente legítima para que el operador verifique UID/nickname y proveedor autorizado para la
  consulta instantánea (`docs/specs/verificacion-jugador.md`).
- Proveedor de recargas automático (hoy entrega manual).
- Cuentas y datos del propietario: Render (aplicar `render.yaml`), dominio, cliente OAuth de
  Google, catálogo y precios reales desde el panel, y completar/revisar con un abogado los
  borradores `terminos.html` y `privacidad.html` (el servidor no deja vender en producción con
  campos `[COMPLETAR` pendientes).
- Revisión manual con lector de pantalla y contraste de los textos decorativos (la suite
  automática de axe-core ya pasa sin violaciones críticas ni graves).

`legacy/index-cinematic-v4.html` es el HTML original congelado (referencia visual).
