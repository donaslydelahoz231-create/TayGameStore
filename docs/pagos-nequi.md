# Pagos por Nequi, independientes de Mercado Pago

**Decisión del dueño (2026-10-19):** Nequi es un método de pago propio, totalmente separado de
Mercado Pago. Los dos solo comparten la pantalla de pago (el selector) y los datos generales del
pedido (referencia, total, jugador). Ninguna API, credencial, webhook, configuración ni estado de un
proveedor sirve para el otro.

Estado: **publicado y apagado por defecto.** El código está en producción desde `445ba93`; «Al
elegir Nequi nunca se abre Mercado Pago» desde `40602a5` (2026-10-20). La casilla de Nequi aparece
cuando el dueño carga `NEQUI_MANUAL_*` en Render (ver «Activación»).

## Qué hay y qué no hay

| Módulo (nombre del requisito) | Dónde está | Estado |
| --- | --- | --- |
| NequiManualPayment | `src/server/services/nequi-manual.ts`, `nequi-view.ts`, `config/nequi.ts` | Listo, apagado por defecto |
| NequiPushPayment | `src/server/integrations/payments/nequi-push.ts` | **Deshabilitado**: no hay acceso oficial |
| MercadoPagoPayment | `src/server/services/payments.ts`, `integrations/payments/mercadopago.ts` | Sin cambios de comportamiento; solo guardas |
| PaymentMethodSelector | `src/server/services/payment-methods.ts`, `src/web/js/store/features/pay-means.js` | Muestra solo los métodos activos |
| OrderPaymentCoordinator | `src/server/services/order-payment.ts` | Fija el método, cambia de método y marca pagado |

- **Nequi por transferencia (`nequi_manual`):** el comprador transfiere desde su app Nequi al
  celular Nequi del dueño y pulsa «Ya transferí». El pedido sigue **pendiente** hasta que el dueño
  ve el movimiento en su app Nequi y lo confirma en el panel. Solo esa confirmación paga el pedido y
  autoriza la entrega.
- **Nequi Push (`nequi_push`):** existe como valor de método para el futuro, pero no se puede elegir
  y no hace ninguna llamada. No se inventó ninguna API (ver «Nequi Push»).

## Cómo se garantiza el aislamiento

Tres capas; cada una basta por sí sola para impedir una confirmación cruzada.

1. **Código** (`order-payment.ts`):
   - cada pedido guarda su método (`orders.payment_method`) la primera vez que se elige y no se
     cambia en silencio (`PAYMENT_METHOD_LOCKED`);
   - un pago de Mercado Pago (webhook, retorno o conciliación) solo tiene efecto en un pedido de
     Mercado Pago (`belongsToOrder`). Si Mercado Pago aprueba un pago para un pedido Nequi, el pago
     queda «para reembolso», se alerta y el pedido no cambia;
   - la confirmación Nequi solo acepta pedidos `nequi_manual`;
   - el vencimiento y la conciliación solo le preguntan a Mercado Pago por pedidos de Mercado Pago.
2. **Base de datos** (migración `0021_pagos_nequi_independiente.sql`):
   - `orders_payment_method_guard`: el método no cambia si ya hay un pago, si el pedido no está
     esperando pago, ni vuelve a quedar vacío;
   - `payments_provider_matches_order`: el pago que paga un pedido (`is_order_payment`) debe ser del
     mismo proveedor que el método del pedido (ni con SQL directo se cruza);
   - `nequi_transfers_reference_key`: una referencia de Nequi confirma un solo pedido;
   - `nequi_transfers`: sin borrados ni `TRUNCATE`, y una transferencia revisada ya no cambia.
3. **Configuración** (`config/nequi.ts`): variables `NEQUI_MANUAL_*` propias. Una variable de Nequi
   mal escrita apaga Nequi y lo informa en el arranque (sin repetir el valor); nunca impide
   arrancar, así que Mercado Pago sigue funcionando. Y al revés: sin Mercado Pago
   (`PAYMENTS_ENABLED=false`) la tienda puede vender solo con Nequi.

## Flujo del comprador

1. En «Elige cómo pagar» ve dos grupos: «Con Mercado Pago» (tarjeta, PSE, Efecty, saldo) y
   «Directo por Nequi». Cada grupo aparece solo si su método está activo.
2. Al elegir Nequi y pulsar «Pagar», el pedido queda con el método `nequi_manual` y se muestran:
   el total exacto, el celular Nequi (y el titular, si se configuró) y la referencia del pedido
   (`TGS-…`) para escribirla en el mensaje de la transferencia. Mercado Pago nunca se abre.
3. Transfiere y escribe los **4 últimos dígitos** de su Nequi (y, si quiere, la referencia de su
   comprobante). Pulsa «Ya transferí». El aviso **no es un pago**: el dueño recibe un correo
   «Transferencia Nequi por verificar» y el pedido se mantiene abierto `NEQUI_MANUAL_REVIEW_HOURS`
   horas (24 por defecto) para verificarlo. Si corrige su aviso, solo se actualizan los datos: no
   se te vuelve a escribir ni se alarga el plazo (así nadie puede inundar tu correo ni dejar un
   pedido abierto sin fin). Tras un rechazo tuyo, un aviso nuevo sí te escribe otra vez.
4. **Al elegir Nequi nunca se abre Mercado Pago** (decisión del dueño, 2026-10-19): el botón dice
   «Pagar por Nequi», y con el pedido en Nequi las opciones de Mercado Pago desaparecen y no hay
   ningún botón hacia Mercado Pago. El servidor también lo impide: un pedido de Nequi no pasa a
   Mercado Pago (`PAYMENT_METHOD_LOCKED`). Si el cliente prefiere Mercado Pago, empieza un pedido
   nuevo.
5. Al revés sí: si empezó con Mercado Pago y **no pagó**, puede elegir Nequi con confirmación. Se
   niega si ya hay un pago; la preferencia vieja de Mercado Pago se cierra y un pago tardío de ella
   va a reembolso, no a entrega.

El celular del dueño solo lo ve el comprador de **su propio** pedido Nequi y solo mientras espera
pago. No aparece en `/api/config`, en el código, en los correos ni en la hoja de Google.

## Verificación del dueño (cada aviso)

1. Abre **tu app Nequi** (nunca una captura que te envíen) y busca el movimiento recibido.
2. Comprueba:
   - el **monto exacto** del pedido (el panel no confirma otro monto: `NEQUI_AMOUNT_MISMATCH`);
   - que el celular de origen termine en los 4 dígitos del aviso;
   - si el mensaje trae la referencia `TGS-…` del pedido.
3. En el panel → Pedidos (filtro «Pago: Nequi por verificar») → el pedido → «Confirmar
   transferencia Nequi»: escribe la **referencia del movimiento** tal como la muestra tu app Nequi
   y el monto recibido. **NO VERIFICADO:** el formato exacto de esa referencia en la app Nequi; el
   panel acepta de 4 a 40 letras, números o guiones.
4. Resultado:
   - pedido esperando pago → «Pago confirmado», comprobante numerado, correo al cliente y pedido en
     la cola de entregas (o entrega automática con PIN, si está activa);
   - pedido ya vencido → **revisión** («transferencia tardía»): decides en «Resolver revisión»
     (reanudar la entrega) o devuelves el dinero;
   - la misma referencia de Nequi no puede confirmar otro pedido (`NEQUI_REFERENCE_USED`).
5. Si no llegó nada: «No llegó: rechazar aviso» con el motivo. El cliente lo ve y puede corregir
   su aviso.

## Devoluciones

1. Devuelve el dinero desde tu app Nequi a la cuenta del cliente.
2. En el panel → el pedido → «Devolución por Nequi»: referencia de la devolución y motivo.
3. El pago queda «reembolsado», el pedido «Reembolsado», se cancelan las entregas pendientes y el
   cliente recibe el aviso. Una recarga ya entregada no se puede retirar del juego: decide antes
   de devolver.

Los reembolsos de Mercado Pago no cambian: se hacen en el panel de Mercado Pago y se concilian.

## Activación (requiere autorización explícita del dueño)

Nada de esto lo hace un asistente sin tu autorización (CLAUDE.md, requisitos 13, 15 y 19 de
`docs/datos-del-propietario.md`):

1. ~~Publicar el código~~ **hecho** (`445ba93` y `40602a5`). La migración 0021 es aditiva y
   marcó como `mercadopago` los pedidos que ya tenían intentos o pagos.
2. **Decidir publicar tu celular Nequi.** Con Nequi activo, cada comprador que lo elige ve ese
   número. Si prefieres no exponer tu número personal, usa una cuenta Nequi dedicada a la tienda.
3. En Render → Environment, escribe tú (nunca en un chat ni en Git):
   - `NEQUI_MANUAL_PHONE`: 10 dígitos, empieza por 3 (ejemplo ficticio `3001234567`);
   - `NEQUI_MANUAL_HOLDER` (opcional): el nombre que verá el comprador;
   - `NEQUI_MANUAL_REVIEW_HOURS` (opcional, 1–72; por defecto 24);
   - `NEQUI_MANUAL_ENABLED=true` al final.
4. Para vender, `CHECKOUT_ENABLED=true` (también requiere tu autorización). En producción exige al
   menos un método activo: Mercado Pago (`PAYMENTS_ENABLED=true`) o Nequi.
5. Comprueba en el registro de arranque la línea «métodos de pago» (`nequiTransferencia: true`) y
   que no haya un aviso «Nequi por transferencia apagado».

Para apagar Nequi: `NEQUI_MANUAL_ENABLED=false`. Los pedidos Nequi abiertos dejan de mostrar el
celular, pero sus avisos siguen visibles y el dueño todavía puede confirmarlos o rechazarlos.

## Nequi Push (no implementado)

No hay documentación ni credenciales oficiales verificadas para que una tienda envíe cobros
«push» a la app Nequi del comprador y reciba la confirmación en su servidor. Por eso:

- `nequi_push` existe solo como valor reservado: `paymentMethodAvailability` lo devuelve siempre
  `false` y elegirlo responde `PAYMENT_METHOD_UNAVAILABLE`;
- no hay variables, URL, llamadas ni webhooks de Nequi en el código.

Para implementarlo hará falta, como mínimo, un acceso comercial oficial de Nequi (o de una pasarela
autorizada) con su documentación vigente, credenciales de prueba y producción guardadas solo en
Render, y un adaptador propio con firma verificada, consulta del estado al proveedor antes de
aplicarlo, idempotencia y pruebas de aislamiento iguales a las de `nequi_manual`.

## Pruebas

- `tests/integration/payment-isolation.test.ts` (24 casos): los 8 puntos de aislamiento, con datos
  ficticios — Nequi no llama a Mercado Pago; Mercado Pago no toca Nequi; webhook de Mercado Pago
  no confirma un pedido Nequi (ni con SQL directo); Nequi no confirma un pedido de Mercado Pago;
  sin variables (o mal escritas) Mercado Pago sigue; errores de Nequi no afectan a Mercado Pago y
  al revés (Mercado Pago caído o apagado); cada proveedor confirma solo lo suyo; aviso, duplicados,
  cambio de método, transferencias tardías, devoluciones y exposición del celular.
- `tests/unit/nequi-config.test.ts` (6 casos): variables propias y arranque.
- `e2e/behavior.spec.ts`: compra Nequi completa en el navegador sin pasar por Mercado Pago.
