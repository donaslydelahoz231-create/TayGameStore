# Mapa del proyecto TayGameStore

Para retomar la tienda sin depender de ningún chat: qué es lo original, cómo funciona, dónde está
cada pieza y cómo se publica. Todo lo que se describe está en este repositorio. Actualizado el
2026-11-12.

## 1. Lo original y sus duplicados

| Pieza                | Original (la que se usa)                                                                                                    | Duplicado o copia                                                                                                      | Decisión                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Repositorio          | `donaslydelahoz231-create/TayGameStore`                                                                                     | Ninguno (sin forks)                                                                                                    | —                                                                   |
| Rama de producción   | `claude/taygamestore-production-pfctbn`: predeterminada, protegida por la regla «TayGamerStore» (no se borra ni se fuerza) | 24 ramas viejas (`fix/…`, `mantenimiento/…`, `ops/…`, `security/…`, `dependabot/…`, `claude/pedidos-whatsapp-demo`) | Las borra el dueño en GitHub; copia entregada el 2026-11-12         |
| Servicio de Render   | `taygamestore` (`srv-db2ifivlot8c7399m8eg`) → **https://taygamestore.onrender.com**, en la cuenta con la que se creó       | «TayGameStore» `taygamestore-xfkd` (`srv-dbhli1m1egvs73fsrjt0`), creado a mano el 29-10 en otra cuenta; nunca arrancó  | Lo borra el dueño; el enlace de la tienda no cambia                 |
| Base de datos (Neon) | Proyecto `TayGamerStore` (`cool-pond-15596593`), rama `production`                                                          | Proyecto `red-hat-15298321`, creado un minuto antes y nunca usado                                                      | Lo borra el dueño. Las ramas `respaldo-…` son copias de seguridad   |
| GitHub Pages         | Publica el `README` desde la rama de producción (no es la tienda)                                                           | —                                                                                                                      | —                                                                   |
| Chat de desarrollo   | La sesión que hizo 204 de los 213 commits fue eliminada                                                                     | —                                                                                                                      | Su trabajo completo está aquí: código, documentos y el registro     |

## 2. Cómo funciona una compra

1. **Catálogo** (`GET /api/catalog`): paquetes y precios del servidor; promociones según
   `PROMO_SCHEDULE`.
2. **Jugador**: el cliente escribe su ID de Free Fire. Lo verifica el equipo (modo `operator`) o lo
   confirma el propio cliente (modo `customer`). La consulta automática está lista en el código,
   pero bloqueada hasta contratar un proveedor autorizado.
3. **Pedido** (`POST /api/checkout`): el servidor recalcula precios y total; es idempotente por
   `checkoutKey`.
4. **Pago**: Mercado Pago Checkout Pro (`POST /api/orders/:ref/pay` crea la preferencia) o Nequi
   manual (el cliente avisa de la transferencia y el dueño la confirma en el panel). **El navegador
   nunca decide un pago**: Mercado Pago es la única autoridad.
5. **Confirmación** (`POST /api/webhooks/mercadopago`): el pedido pasa a `PAID` y recibe su
   comprobante (número consecutivo y código HMAC; `services/receipts.ts`).
6. **Entrega**: manual desde el panel, con PIN del inventario o con recarga automática si hay
   proveedor. Termina en `DELIVERED` («¡Envío exitoso!»).
7. **Después**: historial (`GET /api/orders`), comprobante en JPG o PDF y verificación pública en
   Soporte (`POST /api/receipts/verify`).

Estados: `AWAITING_VERIFICATION` → `AWAITING_PAYMENT` → `PAID` → `DELIVERING` → `DELIVERED`; o
`NEEDS_REVIEW`, `REJECTED`, `EXPIRED` y `REFUNDED`.

## 3. Organización del código

- **Servidor** (`src/server/`, Node 24, Fastify 5, TypeScript):
  - `app.ts` arma el servidor; `config/` valida las variables con Zod.
  - `db/`: esquema en `schema.ts` (24 tablas) y 26 migraciones.
  - `modules/`: las rutas HTTP (`shop`, `admin`, `auth`, `config`, `health`, `jobs` y `webhooks`).
  - `services/`: la lógica de negocio (pedidos, pagos, comprobantes, avisos, inventario, recargas,
    Nequi, escudo, integridad, márgenes…).
  - `integrations/`: Mercado Pago, Google Sheets y OAuth, avisos, jugador y recargas.
  - `cli/`: herramientas como `golive:check` y `mp:sandbox`.
- **Tienda** (`src/web/`, Vite y JavaScript sin framework):
  - `index.html` y `main.js`; los módulos de la tienda están en `js/store/features/`.
  - Panel de administración: `admin.html` y `admin.js`.
  - Estilos: capas numeradas `styles/layers/NN-*.css`, que se aplican en orden.
  - Páginas legales.
- **Tablas por grupo**:
  - Cuentas y sesiones: `users`, `sessions`, `passkeys`, `customer_profiles`…
  - Catálogo: `products` e `inventory_codes`.
  - Pedidos: `orders`, `order_items` y `player_lookups`.
  - Pagos: `payment_attempts`, `payments`, `payment_events` y `nequi_transfers`.
  - Entrega: `fulfillments` y `topups`.
  - Confianza: `blocklist` y `reviews`.
  - Auditoría: `audit_events` y `audit_seals`.
  - Avisos: `notifications`.
- **Pruebas**: `tests/unit` (Vitest), `tests/integration` (PostgreSQL real) y `e2e/` (Playwright:
  comportamiento, calidad, manipulación, movimiento y dispositivos; las capturas visuales van
  aparte).
- **Operación**:
  - `.github/workflows/`: CI, CodeQL, chequeo de producción, diagnóstico diario, vigilancia,
    mantener activa, tareas, mantenimiento y UniPin.
  - `render.yaml`: compila con `npm ci --include=dev && npm run build && npm run db:migrate:prod`,
    arranca con `npm start` y comprueba la salud en `/api/ready`.
  - `scripts/` (escáner y guardia), `tools/` (diagnóstico, carga y marca) e `infra/n8n`
    (histórico).
- **Reglas para asistentes**: `CLAUDE.md`, `.claude/skills/` (`auditoria-segura` y
  `despliegue-seguro`) y la guardia `.claude/hooks/guardia-datos.sh`.
- **Historia**: `CHANGELOG.md` y `docs/auditoria/registro.md` (cada cambio con su evidencia y su
  autorización).

## 4. Cómo se publica

- Un push a la rama de producción despliega solo en Render y lanza el CI. Se hace **solo con la
  autorización explícita del dueño** para un diff exacto (skill `despliegue-seguro`).
- Los secretos y variables viven solo en Render; nunca en el repositorio.
- Los commits se firman como TayGameStore (`CLAUDE.md`).
- Copias de seguridad: ramas `respaldo-…` en Neon y bundles de Git en manos del dueño.

## 5. Estado y pendientes (2026-11-12)

- **Tienda**: en línea, versión `9c023cc` (08-11). Auditoría del 12-11 en `docs/auditoria/registro.md`.
- **Pendientes del dueño**:
  1. Borrar el servicio duplicado de Render.
  2. Borrar las ramas viejas de GitHub.
  3. Borrar el proyecto duplicado de Neon.
  4. Activar un monitor externo que pida `/api/health` cada 5 minutos: GitHub ejecuta «Mantener la
     tienda activa» con una mediana de 303 minutos, y Render duerme la tienda a los 15.
  5. Permitir que GitHub Actions cree PR, para que funcione «Mantenimiento automático».
  6. Guardar `CRON_SECRET` en GitHub, con el mismo valor que en Render, para el testigo de
     integridad.
  7. Reconectar el conector de Render con la cuenta de la tienda original.
