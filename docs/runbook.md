# Runbook de operación

Panel: `https://<dominio>/admin.html` (Google + allowlist + TOTP). Toda acción queda en
Auditoría.

## Día a día

1. **Alertas** (parte superior de Pedidos, se refresca cada minuto): por verificar, pagados sin
   entregar (+30 min), en revisión, pagos por reembolsar, pagos pendientes (+1 h), webhooks
   inválidos (24 h).
2. **Verificar jugador** (estado *Verificar jugador*): consultar el UID en una fuente legítima;
   registrar nickname y región, o el resultado negativo. Nunca inventar un nickname.
3. **Entregar** (estado *Pagado*): *Reclamar* → *Iniciar entrega* → recargar al UID de la orden
   → escribir la evidencia (id de transacción del proveedor) → *Marcar entregado*.
   Un reclamo sin iniciar se libera solo a los `CLAIM_TIMEOUT_MINUTES`. Si la recarga falla:
   *Marcar fallida* (la orden pasa a revisión).

## Pagos

| Situación | Qué hacer |
|---|---|
| Pedido pagado pero sigue "Esperando pago" | *Conciliar con Mercado Pago*. Si sigue igual, revisar en Mercado Pago la referencia (`external_reference` = referencia TGS) |
| `NEEDS_REFUND` (pago duplicado) | Reembolsar ese pago en el panel de Mercado Pago → *Conciliar* |
| Revisión por importe distinto | No entregar. Reembolsar en Mercado Pago → *Conciliar* → *Cerrar* |
| Revisión por pago tardío (pedido vencido) | Si el jugador sigue siendo correcto: *Reanudar entrega*. Si no: reembolsar y *Cerrar* |
| Disputa / contracargo | Responder en Mercado Pago; no entregar hasta resolverla |
| Webhooks inválidos | Revisar `MP_WEBHOOK_SECRET`; si no coincide con Mercado Pago, actualizar y redesplegar. La conciliación periódica cubre los pagos mientras tanto |

**Nunca** pedir al cliente que pague otra vez sin conciliar antes.

## Interruptores

| Variable | Uso |
|---|---|
| `CHECKOUT_ENABLED=false` | Pausar ventas nuevas |
| `PAYMENTS_ENABLED=false` | Mercado Pago caído o en revisión: los pedidos esperan, nadie paga |
| `FULFILLMENT_ENABLED=false` | Pausar entregas (proveedor de recargas caído) |
| `MAINTENANCE_MODE=true` | Solo lectura (los webhooks siguen entrando) |

## Fraude

Bloqueos (panel → Bloqueos) por correo, UID, hash de IP o cuenta de Google. Los límites por
pedido (5 unidades/paquete, 1.000.000 COP) y de pedidos abiertos los aplica el servidor.

Ver también: [`incident-response.md`](incident-response.md), [`deployment.md`](deployment.md).
