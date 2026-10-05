# Especificación — Pagos con Mercado Pago

> Mercado Pago es la **única pasarela**. Estado: **IMPLEMENTADO** con el SDK oficial y
> probado con un doble de pruebas; **NO VERIFICADO contra el sandbox real** (los dominios de
> Mercado Pago están bloqueados en el entorno de desarrollo). Antes de vender: checklist del
> final de este documento.

## Fuentes verificadas (2026-10-05)

- SDK oficial `mercadopago` **3.6.1** (npm, publicado por Mercado Pago, sin dependencias):
  `Preference.create` → `POST /checkout/preferences`; `Payment.get` → `GET /v1/payments/{id}`;
  `Payment.search` → `GET /v1/payments/search` (`external_reference`); opción
  `idempotencyKey`; `WebhookSignatureValidator` (HMAC-SHA256 de `x-signature`).
- Documentación oficial de Mercado Pago (vía búsqueda web):
  - Estados de pago: `pending`, `approved`, `authorized`, `in_process`, `in_mediation`,
    `rejected`, `cancelled`, `refunded`, `charged_back`.
  - Preferencias: `items` (`unit_price`, `currency_id`), `back_urls`, `auto_return:
    "approved"`, `notification_url`, `external_reference`, `expires`, `expiration_date_*`.
  - Webhooks: `POST <notification_url>?data.id=<id>&type=payment`, cabeceras `x-signature`
    (`ts=…,v1=…`) y `x-request-id`; manifest `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`;
    responder `200`/`201`; después consultar `GET /v1/payments/{id}`.

## Arquitectura

`PaymentGateway` (puerto, `src/server/integrations/payments/gateway.ts`) →
`MercadoPagoPaymentGateway` (`mercadopago.ts`). El dominio no conoce el SDK. El doble de
pruebas vive solo en `tests/support/fake-gateway.ts`.

## Flujo (Checkout Pro, redirección)

1. Orden `AWAITING_PAYMENT` (jugador verificado y confirmado por el cliente).
2. "Confirmar y pagar" → `POST /api/orders/:ref/pay`: dentro de una transacción con la orden
   bloqueada se reserva **el único intento abierto** (`payment_attempts`, índice único parcial)
   con una clave de idempotencia; fuera de la transacción se crea la preferencia con
   `idempotencyKey` = esa clave, `external_reference` = referencia de la orden, `expires` =
   vencimiento del pago, `back_urls` = `<PUBLIC_BASE_URL>/?pedido=<ref>#seguimiento`,
   `notification_url` = `<PUBLIC_BASE_URL>/api/webhooks/mercadopago`.
3. El navegador va a `init_point`. Al volver, el frontend llama a `POST /api/orders/:ref/sync`:
   el servidor busca los pagos por `external_reference` en Mercado Pago. **El retorno nunca marca
   nada como pagado por sí mismo.**
4. Webhook: firma validada con el validador oficial → deduplicado (`payment_events`, `UNIQUE`)
   → `GET /v1/payments/{id}` → se aplica el resultado.

## Estados internos del pago (`payments.status`)

| Mercado Pago | Interno | Efecto en la orden |
|---|---|---|
| `approved` (importe = total y `COP`) | `APPROVED` | `AWAITING_PAYMENT` → `PAID` + entrega `READY_FOR_FULFILLMENT` |
| `approved` con importe/moneda distintos | `APPROVED` (no cuenta) | → `NEEDS_REVIEW` |
| `approved` cuando la orden ya tiene un pago | `NEEDS_REFUND` | Sin cambio (alerta; nunca se entrega dos veces) |
| `approved` de orden vencida/rechazada | `APPROVED` | → `NEEDS_REVIEW` (el admin decide) |
| `pending`, `in_process`, `authorized` | `PENDING` | Sin cambio; la orden no expira mientras haya un pago pendiente |
| `rejected`, `cancelled` | `DECLINED` | Sin cambio; el cliente puede reintentar |
| `refunded` | `REFUNDED` | Orden pagada → `REFUNDED`; entrega no realizada → `CANCELLED` |
| `in_mediation`, `charged_back` | `DISPUTED` | → `NEEDS_REVIEW` |
| cualquier otro | `UNKNOWN` | → `NEEDS_REVIEW` |

## Garantías

- **Dinero**: enteros en pesos (COP); `unit_price` se envía como entero.
- **Idempotencia**: `checkout_key UNIQUE`; un intento abierto por orden; misma
  `idempotencyKey` al reintentar; `UNIQUE (provider, provider_payment_id)`; deduplicación de
  webhooks; CAS en todas las transiciones; `FOR UPDATE` de la orden al aplicar un pago.
- **Incertidumbre**: timeout al crear la preferencia ⇒ el intento queda `CREATING` y el
  siguiente "Confirmar y pagar" reutiliza la misma clave (Mercado Pago no duplica). Error al
  consultar un pago ⇒ el evento queda `FAILED` y el scheduler lo reintenta; los intentos
  abiertos y pagos pendientes se concilian cada 2 minutos. **Nunca se cobra dos veces.**
- **Reembolsos**: se hacen en el panel de Mercado Pago; la conciliación (o "Conciliar" en el
  panel de TayGameStore) registra el estado `refunded`.
- **Datos guardados**: solo id, estado, detalle de estado, importe, moneda y fechas. Nunca la
  respuesta completa (puede contener datos del pagador).

## Sandbox seguro (`MP_MODE`)

- `MP_MODE=sandbox|production` es obligatoria con `PAYMENTS_ENABLED=true`. Las credenciales de la
  cuenta vendedora de prueba también empiezan por `APP_USR`, así que el modo se **declara**.
- Cada pago se contrasta con su `live_mode` (dato de Mercado Pago, `true` = pago real): en
  `production` un pago de prueba, y en `sandbox` uno real, envían el pedido a `NEEDS_REVIEW`.
  Sin `live_mode` también. Nunca se entrega una recarga por un pago del modo equivocado.
- Con `sandbox`, la tienda dice "Modo prueba · Mercado Pago sandbox", el resumen de pago dice
  "MODO PRUEBA (sin cobro real)" y el panel muestra "Mercado Pago: MODO PRUEBA".
- Guía paso a paso y comando `npm run mp:sandbox`: [`../sandbox-mercadopago.md`](../sandbox-mercadopago.md).

## Checklist antes de vender (NO VERIFICADO aún)

1. Permitir los dominios de Mercado Pago en la red del entorno o probar desde una máquina
   propia.
2. Crear la aplicación en Mercado Pago Colombia; configurar Webhooks (evento "Pagos") con
   `https://<dominio>/api/webhooks/mercadopago` y copiar la clave secreta a `MP_WEBHOOK_SECRET`.
3. Con **credenciales de prueba** y usuarios de prueba: pago aprobado, rechazado, pendiente
   (efectivo), reembolso desde el panel y webhook simulado desde "Tus integraciones".
4. Confirmar en sandbox: que `init_point` abre el entorno de prueba con la cuenta vendedora de
   prueba (así lo indica la documentación de cuentas de prueba), parámetros que Mercado
   Pago añade a `back_urls` y la unidad de `ts` de la firma (el SDK la trata en segundos; la
   tolerancia de tiempo no se usa: la deduplicación y la consulta a la API protegen contra
   repeticiones).
5. Solo entonces credenciales de producción y `CHECKOUT_ENABLED=true` + `PAYMENTS_ENABLED=true`.
