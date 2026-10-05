# TayGameStore

Tienda de recargas gamer: frontend cinematográfico + API Node/Fastify + PostgreSQL.

> **Estado: Fase 1 (frontend modularizado).** No hay ventas reales: la verificación de jugadores
> (C1) y los pagos con Wompi están **BLOQUEADOS** hasta contar con una fuente legítima de
> verificación y con la documentación oficial y las credenciales de Wompi.
> Plan completo: [`docs/PLAN-ARQUITECTURA.md`](docs/PLAN-ARQUITECTURA.md).

## Requisitos

- **Node 24 LTS** (ver `.nvmrc`; `engine-strict` impide instalar con otra versión mayor).
- **PostgreSQL ≥ 16** (local o gestionado) para `/api/ready`, migraciones y pruebas de integración.

## Puesta en marcha

```bash
nvm use                     # o instala Node 24
npm ci
cp .env.example .env        # completa DATABASE_URL; nunca subas .env a Git
npm run db:migrate          # aplica migraciones (requiere DATABASE_URL)
npm run dev                 # API en http://127.0.0.1:3000 (recarga al guardar)
npm run dev:web             # frontend en http://127.0.0.1:5173 (proxy /api → 3000)
```

Producción (compilado):

```bash
npm run build               # dist/web (Vite) + dist/server (tsc)
npm run db:migrate:prod     # paso de despliegue, nunca al arrancar
npm start                   # sirve API + frontend
```

## Scripts

| Script | Qué hace |
|---|---|
| `npm run lint` / `format:check` / `typecheck` | ESLint (tipado), Prettier, TypeScript |
| `npm test` | Unitarias + API (sin base de datos) |
| `npm run test:integration` | PostgreSQL real. Requiere `TEST_DATABASE_URL` con una base cuyo nombre termine en `_test` (**se borra su esquema**) |
| `npm run test:e2e` | Pruebas de comportamiento del frontend (Playwright, sin backend) |
| `npm run test:visual` | Referencias visuales del frontend original (Playwright) |
| `npm run build` | Build de frontend y servidor |
| `npm run db:generate` | Genera una migración a partir de `src/server/db/schema.ts` (revísala antes de aplicarla) |
| `npm run check` | lint + formato + typecheck + tests + build |

## Endpoints actuales

| Ruta | Descripción |
|---|---|
| `GET /api/health` | Liveness: el proceso responde |
| `GET /api/ready` | Readiness: la base de datos responde (503 si no está configurada o no responde) |
| `GET /api/config` | Interruptores públicos: `maintenanceMode`, `checkoutEnabled`, `paymentsEnabled` |

Errores con formato estable: `{ "error": { "code", "message", "requestId" } }`. Cada respuesta
lleva `x-request-id`.

## Interruptores

- `MAINTENANCE_MODE=true`: solo lecturas; las escrituras responden `503 MAINTENANCE_MODE`
  (los webhooks siguen aceptándose).
- `CHECKOUT_ENABLED`: por defecto `false`. En producción **no puede activarse** mientras
  las ventas reales estén bloqueadas (el servidor no arranca).
- `PAYMENTS_ENABLED`: debe ser `false` (pagos no implementados).

## Referencias visuales

`e2e/__screenshots__/` guarda la línea base del HTML original (entrada, acceso y tienda
completa en 360, 768 y 1280 px), capturada **antes** de modificar el frontend. Sirve para
detectar regresiones en las fases de modularización.

- Se generaron con Chromium de `@playwright/test` 1.56.1 en Linux; otro sistema o versión
  produce diferencias de renderizado. Por eso no se ejecutan en la CI (las de
  comportamiento, `test:e2e`, sí).
- Se generan desde el HTML **original**: para regenerarlas, copia temporalmente
  `legacy/index-cinematic-v4.html` sobre `src/web/index.html`, ejecuta
  `npm run test:visual:update` y restaura el frontend; después el código actual debe pasar
  `npm run test:visual` sin cambios.
- Las fuentes de Google se sirven desde `e2e/fixtures/google-fonts/` (SIL OFL), descargadas
  con `e2e/fixtures/fetch-google-fonts.sh`, para no depender de la red.
- Si un cambio visual es intencionado, la referencia se actualiza en ese mismo cambio y se
  revisa la diferencia.

## Frontend

El HTML original (un solo archivo con CSS y JS inline) está separado en:

```
src/web/
├─ index.html                 solo marcado (sin <style>, <script> ni onclick inline)
├─ main.js                    entrada: compat → tienda → capa visual → capa cinematográfica
├─ styles/main.css            importa las capas en el orden de cascada original
├─ styles/layers/NN-*.css     28 capas; el prefijo numérico ES el orden de la cascada
└─ js/
   ├─ compat.js
   ├─ store/                  config, state, dom, format, cart-model, api, ui, storage,
   │                          render (registro), bindings (eventos), app (arranque)
   ├─ store/features/         account, cart, catalog, checkout, entry, favorites, history,
   │                          invoice, invoice-export, nav, order-status, orders, player,
   │                          search, service, support, tracking
   └─ effects/                visual.js y cinematic.js (decorativos)
```

- `renderAll()` es un registro que `app.js` llena en el orden original; así los módulos no
  dependen unos de otros en ciclo.
- Todo dato variable que se inserta con `innerHTML` pasa por `esc()` (`js/store/dom.js`).
- Comportamiento heredado que se retira en la Fase 2 (no es de producción): modo demo
  (`?demo=1`), catálogo de respaldo con precios fijos, órdenes e historial en `localStorage`,
  código de comprobante calculado en el navegador.

### Defectos conocidos del original (pendientes)

| Defecto | Estado |
|---|---|
| La primera "Nueva factura" repite `TGS-0001` | Documentado con `test.fail`; la numeración pasa al servidor |
| El confeti de recarga completada nunca se dispara (lee `window.state`, que no existe) | Decorativo; a decidir en la revisión visual |
| La animación de "orbe" al agregar usa el selector `.add`, que ningún elemento tiene | Decorativo; a decidir en la revisión visual |
| La inclinación/entrada cinematográfica de tarjetas se enlaza antes de que existan los productos | Decorativo; a decidir en la revisión visual |
| Con movimiento activado, las capas visual y cinematográfica crean ambas `#tgsCursorGlow` y `#tgsParticleCanvas` (IDs duplicados) | A unificar en la revisión visual |

Corregido en la Fase 1: `.header{contain:paint}` dejaba invisibles el panel de búsqueda y
el menú de cuenta.

## Estructura

```
legacy/                     HTML original congelado (no se edita)
src/web/                    frontend modularizado (ver "Frontend")
src/server/                 API Fastify: config, plugins, módulos, db (Drizzle + migraciones)
src/shared/                 código compartido (códigos de error)
tests/{unit,api,integration}/
e2e/                        pruebas de comportamiento y visuales (Playwright) y fixtures
docs/                       plan de arquitectura
```

## Seguridad

- Ningún secreto en el código ni en Git: solo variables de entorno (`.env` está en `.gitignore`).
- Los errores de configuración muestran el nombre de la variable, nunca su valor.
- Los logs redactan `authorization`, `cookie`, `x-order-token` y `set-cookie`.
- `npm audit --omit=dev`: 0 vulnerabilidades. En desarrollo, `drizzle-kit` arrastra un
  `esbuild` antiguo (GHSA-67mh-4wv8-2f99, moderada, afecta al servidor de desarrollo de esbuild,
  que drizzle-kit no usa). El "fix" de npm degradaría drizzle-kit a 0.18; riesgo aceptado y
  a revisar en cada actualización de drizzle-kit.
- npm 11 no ejecuta scripts de instalación no aprobados; los de `esbuild` no son necesarios
  (el binario llega como dependencia opcional) y se dejan sin aprobar.
