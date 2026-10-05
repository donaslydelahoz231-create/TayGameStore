# TayGameStore

Tienda de recargas gamer: frontend cinematográfico + API Node/Fastify + PostgreSQL.

> **Estado: Fase 0 (infraestructura).** No hay ventas reales: la verificación de jugadores
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
  produce diferencias de renderizado. Por eso no se ejecutan en la CI básica.
- Las fuentes de Google se sirven desde `e2e/fixtures/google-fonts/` (SIL OFL), descargadas
  con `e2e/fixtures/fetch-google-fonts.sh`, para no depender de la red.
- Regenerar solo si un cambio visual es intencionado: `npm run test:visual:update`.

## Estructura

```
legacy/                     HTML original congelado (no se edita)
src/web/index.html          copia de trabajo del frontend (idéntica al original en la Fase 0)
src/server/                 API Fastify: config, plugins, módulos, db (Drizzle + migraciones)
src/shared/                 código compartido (códigos de error)
tests/{unit,api,integration}/
e2e/                        pruebas visuales (Playwright) y fixtures
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
