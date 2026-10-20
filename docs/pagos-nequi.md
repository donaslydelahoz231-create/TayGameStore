# Pagos por Nequi, independientes de Mercado Pago

**Decisión del dueño (2026-10-19):** Nequi es un método de pago propio, totalmente separado de
Mercado Pago. Los dos solo comparten la pantalla de pago (el selector) y los datos generales del
pedido (referencia, total, jugador). Ninguna API, credencial, webhook, configuración ni estado de un
proveedor sirve para el otro.

Estado: **publicado y apagado por defecto.** El código está en producción desde `445ba93`; «Al
elegir Nequi nunca se abre Mercado Pago» desde `40602a5` (2026-10-20). La casilla de Nequi aparece
cuando el dueño carga `NEQUI_MANUAL_*` en Render (ver «Activación»).

**Configuración real (pedido del dueño, 2026-10-20), sin publicar todavía:** llave Bre-B
(`NEQUI_MANUAL_BREB_KEY`) con botón «Copiar», titular, total exacto e ID del pedido en la caja de
Nequi; «Seguimiento» con mensajes propios de Nequi (nunca menciona Mercado Pago); el estado
entregado se llama **ENVIADO** en el panel y el cliente ve **«¡Envío exitoso!»**. Sin QR por ahora
(decisión del dueño). Los valores reales los escribe el dueño en Render: ni el código, ni las
pruebas, ni los commits tienen su llave, su celular ni su nombre.

## Qué hay y qué no hay

| Módulo (nombre del requisito) | Dónde está | Estado |
| --- | --- | --- |
| NequiManualPayment | `src/server/services/nequi-manual.ts`, `nequi-view.ts`, `config/nequi.ts` | Listo, apagado por defecto |
| NequiPushPayment | `src/server/integrations/payments/nequi-push.ts` | **Deshabilitado**: no hay acceso oficial |
| MercadoPagoPayment | `src/server/services/payments.ts`, `integrations/payments/mercadopago.ts` | Sin cambios de comportamiento; solo guardas |
| PaymentMethodSelector | `src/server/services/payment-methods.ts`, `src/web/js/store/features/pay-means.js` | Muestra solo los métodos activos |
| OrderPaymentCoordinator | `src/server/services/order-payment.ts` | Fija el método, cambia de método y marca pagado |

- **Nequi por transferencia (`nequi_manual`):** el comprador transfiere desde su app Nequi (o la
  de su banco, por Bre-B) a la llave Bre-B o al celular Nequi del dueño y pulsa «Ya transferí». El pedido sigue **pendiente** hasta que el dueño
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
   el **total exacto**, la **llave Bre-B** (con botón «Copiar») y/o el celular Nequi, el
   **titular** (para que lo compare en su app antes de enviar) y el **ID del pedido** (`TGS-…`)
   para escribirlo en el mensaje de la transferencia. Debajo: «Tu pedido queda **pendiente** hasta
   que veamos el dinero en nuestra cuenta: solo entonces lo confirmamos. Consulta su estado en
   «Seguimiento»». Mercado Pago nunca se abre.
3. Transfiere y escribe los **4 últimos dígitos de la cuenta desde la que pagó** (y, si quiere, la
   referencia de su comprobante). Pulsa «Ya transferí». La referencia del cliente se guarda como
   dato **sin verificar** (el panel la muestra así); no es prueba de pago. El aviso **no es un
   pago**: el dueño recibe un correo
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
6. En «Seguimiento» (o con su enlace privado) ve el estado real del servidor, con textos de Nequi:
   - esperando pago: «Falta tu transferencia por Nequi: el pedido sigue pendiente hasta que veamos
     el dinero en nuestra cuenta»;
   - tras «Ya transferí»: «Recibimos tu aviso de pago. Sigue pendiente…»;
   - confirmado por el dueño: «Pago verificado en nuestra cuenta Nequi. Preparando tu recarga»;
   - marcado ENVIADO: **«¡Envío exitoso!»** (también en el estado del comprobante, el historial y
     el asunto del correo «¡Envío exitoso! · Pedido TGS-…»).

La llave y el celular del dueño solo los ve el comprador de **su propio** pedido Nequi y solo
mientras espera pago. No aparecen en `/api/config`, en el código, en los correos ni en la hoja de
Google. La llave se valida al arrancar: alfanumérica con `@`. Una llave hecha solo de números se
rechaza porque podría ser un número de documento (`docs/datos-del-propietario.md`), salvo `@` más
un celular (10 dígitos que empiezan por 3): ninguna cédula colombiana tiene esa forma.

## Verificación del dueño (cada aviso)

1. Abre **tu app Nequi** (nunca una captura que te envíen) y busca el movimiento recibido.
2. Comprueba:
   - el **monto exacto** del pedido (el panel no confirma otro monto: `NEQUI_AMOUNT_MISMATCH`);
   - que la cuenta de origen termine en los 4 dígitos del aviso (**NO VERIFICADO:** qué datos del
     remitente muestra tu app en un pago recibido por Bre-B desde otro banco);
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

**En la hoja (pestaña «Pagos pendientes»):** si la hoja de Google está conectada, cada pedido
Nequi tiene su fila desde que el cliente elige Nequi: total a recibir, hasta cuándo, y lo que
avisó al transferir (4 últimos dígitos de su cuenta y referencia de su comprobante). La fila se
actualiza sola al avisar, confirmar, rechazar, devolver o vencer. Sirve para buscar el movimiento
en tu app Nequi; **confirmar sigue siendo en el panel** (la hoja no cambia ningún pedido). Columnas
y estados: `docs/google-sheets.md`.

## Recarga manual y estado ENVIADO

1. Con el pago confirmado, el pedido aparece en el panel (alerta «Pagados por entregar») y, si la
   hoja de Google está conectada, en «Pedidos» (fila «Pago confirmado») y en «Entregas».
2. Haz la recarga de Free Fire a mano al ID y servidor del pedido.
3. En el panel → el pedido: «Reclamar entrega» → «Iniciar entrega» → escribe la evidencia (p. ej.
   el ID de la transacción) → **«Marcar como ENVIADO»**. El panel muestra el pedido como
   **ENVIADO**.
4. Sincronización (sin pasos manuales): la tienda le muestra al cliente «¡Envío exitoso!», le envía
   el correo, agrega en «Pedidos» la fila «Recarga entregada» y actualiza la fila del pedido en
   «Entregas» a «✅ Entregado con éxito». Esas dos etiquetas de la hoja **no cambian** porque las
   fórmulas de «Por entregar», «Reporte diario» y los KPI las usan. La escritura es idempotente:
   «Entregas» actualiza la misma fila por referencia y los eventos de «Pedidos» salen de una cola
   que reintenta sin duplicar (`tests/integration/sheets.test.ts`). **NO VERIFICADO en
   producción:** la hoja sigue sin conectar hasta que el dueño cargue las variables
   `GOOGLE_SHEETS_*`.

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
2. **Decidir qué publicar.** Con Nequi activo, cada comprador que lo elige ve tu llave Bre-B
   (y el celular, si lo configuras) y el titular. Con la llave basta: el celular es opcional y no
   hace falta exponerlo.
3. En Render → Environment, escribe tú (nunca en un chat ni en Git):
   - `NEQUI_MANUAL_BREB_KEY`: tu llave Bre-B tal como la muestra tu app, empieza por `@`
     (ejemplo ficticio `@tiendaprueba`);
   - `NEQUI_MANUAL_HOLDER` (recomendado): el nombre del titular, tal como lo verá el comprador en
     su app al pagar;
   - `NEQUI_MANUAL_PHONE` (opcional): 10 dígitos, empieza por 3 (ejemplo ficticio `3001234567`);
   - `NEQUI_MANUAL_REVIEW_HOURS` (opcional, 1–72; por defecto 24);
   - `NEQUI_MANUAL_ENABLED=true` al final.
4. Para vender, `CHECKOUT_ENABLED=true` (también requiere tu autorización). En producción exige al
   menos un método activo: Mercado Pago (`PAYMENTS_ENABLED=true`) o Nequi.
5. Comprueba en el registro de arranque la línea «métodos de pago» (`nequiTransferencia: true`) y
   que no haya un aviso «Nequi por transferencia apagado».

Si la llave no tiene el formato esperado, Nequi queda apagado y el arranque lo dice sin repetir
el valor; Mercado Pago no se ve afectado.

Para apagar Nequi: `NEQUI_MANUAL_ENABLED=false`. Los pedidos Nequi abiertos dejan de mostrar la
llave y el celular, pero sus avisos siguen visibles y el dueño todavía puede confirmarlos o
rechazarlos.

**QR:** no se muestra (decisión del dueño, «Sin QR por ahora»). Si más adelante lo quieres, la
imagen original de tu QR se guardaría como archivo estático propio de la tienda, nunca en un chat.

## Nequi Push (no implementado)

No hay documentación ni credenciales oficiales verificadas para que una tienda envíe cobros
«push» a la app Nequi del comprador y reciba la confirmación en su servidor.

Revisión del 2026-10-20: la prensa describe una API de Nequi para comercios («Nequi Conecta»:
cobros push, QR, suscripciones) y pasarelas integradas con ella (p. ej. Wompi y Ebanx), con
registro del comercio y credenciales propias. El portal oficial (`conecta.nequi.com.co`) no se
pudo abrir desde el entorno de trabajo: **NO VERIFICADO** su acceso, requisitos, costos ni
documentación vigente. Por eso se mantiene el flujo manual y:

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
  También: la llave y el celular solo aparecen en el propio pedido Nequi mientras espera pago.
- `tests/unit/nequi-config.test.ts` (8 casos): variables propias, solo llave o solo celular, llave
  `@` + celular, llaves inválidas (sin `@`, solo números con forma de documento, con espacios o
  marcado) y arranque.
- `e2e/behavior.spec.ts`, con datos ficticios:
  - compra Nequi en el navegador sin pasar por Mercado Pago: llave, titular, total, ID, aviso
    pendiente, «Seguimiento» sin Mercado Pago, confirmación y «¡Envío exitoso!»;
  - desde el panel: el aviso del cliente se ve sin verificar, un monto distinto no se confirma,
    el dueño confirma, «Marcar como ENVIADO» y el cliente ve «¡Envío exitoso!».
