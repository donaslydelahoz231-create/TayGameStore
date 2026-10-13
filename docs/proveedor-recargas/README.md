# Proveedor de recargas, TAY RADAR y rentabilidad: informe de la misión

Fecha: 2026-10-13. Alcance: auditoría del repositorio, investigación pública, modelo financiero,
mejoras locales y pruebas. **Sin despliegue, sin contactar proveedores, sin pagos reales y sin
cambios en producción.**

| Documento | Contenido |
|---|---|
| Este archivo | Auditoría de la tienda (A) y cambios técnicos (E) |
| [PROVEEDORES.md](PROVEEDORES.md) | Investigación y selección de proveedores (B) |
| [COMPETENCIA.md](COMPETENCIA.md) | Precios de la competencia en Colombia (C) |
| [FINANZAS.md](FINANZAS.md) | Rentabilidad de los 6 paquetes (D) |
| [PLAN-ACTIVACION.md](PLAN-ACTIVACION.md) | Qué falta y en qué orden activar (F) |
| [SOLICITUD-COTIZACION.md](SOLICITUD-COTIZACION.md) | Mensajes listos para pedir cotización a los proveedores |

## Resumen en cinco puntos

1. **TAY RADAR funciona en el servidor y estaba bien hecha.**
   - El precio lo decide el servidor, con UTC−5 fijo, y queda fijo al crear el pedido.
   - Producción tiene exactamente la tabla oficial.
   - Se corrigieron tres brechas: pantalla vencida al cambiar la promo, regla de precio sin
     registrar y comisión de pago mal modelada.
2. **Mercado Pago cobra un cargo fijo** ($800 + IVA según su página oficial). Eso se lleva
   alrededor del 29 % del paquete de 110 💎 en TAY RADAR.
3. **Ningún proveedor verificable cumple todo** lo pedido. Todos los que publican condiciones
   exigen saldo prepago, y la red de este entorno bloquea las páginas de los 14 candidatos.
4. **El margen exige proveedores 21–40 % más baratos que el precio público.** Con un distribuidor
   autorizado de descuento pequeño, la tienda perdería dinero. Ese rango tan alto obliga a
   verificar el origen de los diamantes.
5. **Siguiente paso:** pedir cotizaciones por escrito con tu autorización, pasarlas por
   `npm run finanzas:margenes` e integrar solo el proveedor que demuestre margen.

## A. Auditoría de TayGameStore

### Arquitectura real

| Capa | Detalle |
|---|---|
| Servidor | Node 24, Fastify 5, TypeScript, Zod |
| Base de datos | PostgreSQL 18 en Neon, con Drizzle y migraciones SQL |
| Frontend | Módulos ES sin framework, empaquetados con Vite y servidos por Fastify |
| Despliegue | Render, plan gratuito, una instancia; migra en la compilación (`render.yaml`) |
| Pagos | Mercado Pago Checkout Pro, SDK `mercadopago` 3.6.1 |
| Pruebas | Vitest (unitarias e integración con PostgreSQL), Playwright (e2e en 3 navegadores), CodeQL, gitleaks |

### Catálogo

- Producción, consultada en solo lectura el 13-oct, tiene los 6 paquetes con los precios normales
  y TAY RADAR de la tabla oficial. `CATALOG_LOCKED=true`: nadie los cambia desde el panel.
- Todos los importes son pesos enteros.
- La base impide un precio cobrado mayor que el de lista y cambiar montos de pedidos ya creados
  (trigger de la migración 0015).

### TAY RADAR

| Punto auditado | Resultado |
|---|---|
| Dónde se calcula | `src/server/domain/pricing.ts` (`weekendWindow`, `effectivePrice`) |
| Hora | Desplazamiento fijo UTC−5 (Colombia no tiene horario de verano) sobre el instante absoluto. No depende de la zona del servidor ni del navegador (prueba nueva) |
| Ventana | Sábado 00:00:00 a lunes 00:00:00, fin exclusivo (= domingo 23:59:59) |
| ¿El backend aplica el precio? | Sí. El catálogo y el checkout usan `effectivePrice`; el navegador solo muestra |
| Manipulación | El esquema es estricto: un campo `priceCop` inventado da 400. Si el total que espera el navegador no coincide, da 409 `PRICE_CHANGED`. El servidor nunca usa el total del cliente |
| ¿Se acumula con otros descuentos? | No: hay una sola regla (promo o normal) y no existen cupones |
| ¿Cuándo se fija el precio? | Al crear el pedido. El pago debe coincidir exactamente con ese total (si no, `NEEDS_REVIEW`) |
| Creado en promo, pagado después | Conserva el precio de la promo. Ventana máxima: `PAYMENT_TTL_MINUTES` (60 min) con verificación por el cliente, que es la de producción; hasta 12 h + 60 min con verificación por operador. Es un riesgo aceptado y acotado; ahora queda registrado (prueba nueva) |
| Cambios posteriores del catálogo | No alteran pedidos: guardan precio de lista, precio cobrado, descuento y total; los montos son inmutables en la base |
| Reintentos, webhooks y pedidos duplicados | Cubiertos por pruebas existentes: clave de checkout idempotente, webhook duplicado sin efectos, segundo pago → `NEEDS_REFUND` |

**Brechas encontradas y corregidas:**

1. **La tienda abierta no se enteraba del cambio de promo.**
   - El navegador mostraba precios y el aviso «LIVE» vencidos hasta recargar.
   - El cobro siempre fue correcto: un total vencido da `PRICE_CHANGED` y recarga el catálogo.
   - Ahora `watchPromoChanges` vuelve a pedir la configuración y el catálogo al llegar el sábado
     00:00 o el lunes 00:00, y al volver a la pestaña. Reintenta si el reloj del equipo va
     adelantado.
2. **No quedaba registrada la regla promocional del pedido.**
   - El evento `order.created`, sellado en la cadena de integridad, ahora guarda:
     - `priceRule` (`tay-radar`, `promo` o `normal`);
     - `subtotalCop` y `discountCop`;
     - `promoEndsAt`.
   - No requiere migración.
3. **La comisión de pago no incluía el cargo fijo ni el IVA.** El piso de ganancia y el panel
   Rentabilidad subestimaban unos $950 por pedido pequeño. Ahora existen `PAYMENT_FEE_FIXED_COP`
   y `PAYMENT_FEE_TAX_PCT`; en 0 conservan el comportamiento anterior.

### Mercado Pago y pedidos

| Punto | Estado |
|---|---|
| Creación del pedido | En el servidor, con clave de idempotencia, límite de pedidos abiertos y límites por IP |
| Precio | Solo el servidor (ver arriba) |
| Preferencia | Una por pedido, con la referencia pública como `external_reference`; un timeout reintenta con la misma clave |
| Autenticidad del aviso | Firma `x-signature` validada con el SDK oficial (comparación en tiempo constante). Desde el 13-oct se registra la antigüedad del `ts` (H-04) |
| Estado del pago | Siempre se consulta a la API de Mercado Pago; el cuerpo del aviso no se cree |
| Duplicados | `payment_events` con clave única; el aviso repetido no tiene efecto |
| Pendiente o rechazado | No hay entrega; el pedido sigue esperando pago |
| Importe o moneda distintos | `NEEDS_REVIEW`, nunca `PAID` |
| Página de éxito | No marca nada como pagado (prueba existente) |
| Pagado pero el proveedor falla | La recarga queda en revisión, con aviso al dueño y reanudación solo de lo fallido; no hay doble recarga (pruebas de `topup.test.ts`) |
| Entregado por el proveedor pero falla la actualización local | La consulta por la misma referencia confirma sin recargar otra vez (`inquiry`, prueba de timeout) |
| Conciliación | La tarea `reconcilePayments` consulta pagos pendientes; `expireOrders`; el panel muestra cada pago y si su importe coincide |

### Integración con proveedores (estado)

Ya existe una arquitectura modular:
- un puerto `TopupProvider` (validar jugador, crear orden, consultar);
- un servicio de recargas idempotente: una referencia por unidad, consulta ante la duda, nunca
  reenvío con otra referencia;
- estados de revisión, aviso al dueño e interruptor de pausa.

La única implementación es UniPin, descartado por el dueño, y producción tiene
`TOPUP_PROVIDER=none`. **No se escribió un adaptador nuevo:** ningún proveedor tiene
documentación verificable desde este entorno, y la regla es no inventar endpoints.

### Riesgos principales

1. Sin proveedor con margen demostrado ([FINANZAS.md](FINANZAS.md)).
2. Paquete de 110 💎: el cargo fijo de Mercado Pago lo hace casi inviable con cualquier proveedor
   realista.
3. Proveedores baratos con riesgo de origen y saldo prepago ([PROVEEDORES.md](PROVEEDORES.md)).
4. Pendientes de seguridad ya registrados: rol mínimo de base de datos (H-01), `CRON_SECRET`
   (H-03) y repositorio público (H-09) ([docs/seguridad/](../seguridad/BACKLOG.md)).

## E. Cambios técnicos de esta misión

| Archivo | Cambio |
|---|---|
| `src/server/domain/margin.ts` | Comisión con % + cargo fijo + IVA (`paymentFee`, `netOfFee`); piso y costo máximo corregidos; compatible con la configuración anterior |
| `src/server/config/env.ts`, `.env.example` | `PAYMENT_FEE_FIXED_COP` y `PAYMENT_FEE_TAX_PCT` (por defecto 0) |
| `src/web/admin.js` | Panel Rentabilidad: muestra el cargo fijo y el IVA de la política |
| `src/server/domain/profitability.ts` | Fórmulas del informe: beneficio, margen sobre el precio, C máximo, base con recargo, equilibrio y conversión de dólares |
| `src/server/cli/finanzas.ts`, `finanzas-main.ts`, `package.json` | `npm run finanzas:margenes` (solo calcula; acepta un JSON de cotización) |
| `src/server/services/orders.ts` | `order.created` sella `priceRule`, `subtotalCop`, `discountCop` y `promoEndsAt` |
| `src/web/js/store/features/promo-timing.js` (+ `.d.ts`), `promo.js`, `app.js` | Actualización automática de precios al cambiar TAY RADAR |
| `tests/unit/profitability.test.ts` | 10 pruebas: comisión, costos máximos, equilibrio, ejemplo de $3.230 y $3.076, informe y validación de cotizaciones |
| `tests/unit/promo-timing.test.ts` | 7 pruebas: cambio de año (31-dic-2033 → 1-ene-2034), febrero bisiesto, independencia de la zona horaria y temporizador del navegador |
| `tests/integration/tay-radar.test.ts` | 4 pruebas: domingo 23:59 sellado, creado en promo y pagado el lunes, precio manipulado fuera de promo, cambio de mes (31-oct → 1-nov) |
| `tests/unit/margin.test.ts`, `tests/integration/margin.test.ts` | Esperan la nueva forma de la política; las cifras no cambian |
| `docs/proveedor-recargas/*` | Estos informes y la cotización indicativa de ejemplo |

Resultados locales del 13-oct:

| Comprobación | Resultado |
|---|---|
| Formato y lint | Verde |
| Tipos | Verde |
| Unitarias | 259 |
| Integración con rol mínimo | 214 |
| Integración sin rol mínimo | 212 y 2 omitidas |
| Build | Verde |
| e2e (comportamiento, calidad, manipulación, movimiento) y visuales en escritorio | 67 de 67 |

**Pruebas solo con dobles:** el proveedor (`FakeTopupProvider`) y Mercado Pago
(`FakePaymentGateway`) están simulados. **Nada de esto prueba un proveedor real.** Lo único real
consultado fue la base de producción, en solo lectura.
