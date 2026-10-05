# Especificación — Pagos (decisión definitiva)

> Decisión del propietario (2026-10-05). Sustituye todo lo relativo a Wompi en
> `docs/PLAN-ARQUITECTURA.md`.
> Estado: **BLOCKED** — la documentación oficial y el sandbox de Mercado Pago no son
> accesibles desde el entorno de desarrollo (la política de red bloquea sus dominios).

## Decisión
- **Mercado Pago es la única pasarela de pago** y la única autoridad externa sobre el estado de un pago.
- **Wompi queda eliminado**: sin fallback, alternativa, demo ni código paralelo. Sus referencias,
  configuración, widget, CSP y textos se retiran (Fase 2).
- El navegador **nunca** declara que una compra está pagada. Un redirect de retorno solo dispara
  una verificación en servidor.
- Nunca se simula un pago aprobado en producción.
- El checkout **no muestra Mercado Pago como disponible** hasta que la integración real esté
  configurada y validada (`PAYMENTS_ENABLED`, que hoy el servidor obliga a `false`).

## Arquitectura
`PaymentProvider` (interfaz) → implementación objetivo `MercadoPagoProvider`.
Hasta tener documentación y sandbox, la única implementación es `UnavailablePaymentProvider`
(siempre "no configurado"). Ningún contrato de Mercado Pago (endpoints, SDK, estados,
firmas de webhook, formato de importes) se escribe por suposición.

Estados de pago del proyecto (independientes del proveedor):
`PENDING` · `APPROVED` · `DECLINED` · `EXPIRED` · `REFUNDED` · `NEEDS_REFUND`.
El mapeo desde los estados nativos de Mercado Pago se define **solo** con la documentación oficial.

## Al desbloquearse (documentación oficial + credenciales sandbox)
- Creación segura del pago/preferencia según el flujo oficial.
- Retorno/redirect tratado como señal, nunca como autoridad.
- Webhooks con validación de autenticidad según la documentación.
- Validación server-side consultando a Mercado Pago.
- Idempotencia (`checkout_key`, `UNIQUE` sobre el id de transacción del proveedor, transacciones,
  `FOR UPDATE`, CAS de estados).
- Reconciliación periódica con advisory lock.
- Pagos duplicados, rechazados, pendientes y aprobados tardíamente; `NEEDS_REFUND`.
- Timeouts, reintentos acotados con backoff y jitter; nunca repetir una operación financiera
  incierta sin consultar antes su estado.
- Auditoría con `requestId`, `orderId`, `paymentId` y `providerTransactionId`.

## Para desbloquear
1. Permitir en la configuración de red del entorno los dominios de Mercado Pago necesarios
   (como mínimo `www.mercadopago.com.co`, `www.mercadopago.com` y `api.mercadopago.com`; la
   lista exacta se confirmará con la documentación).
2. Cuenta de Mercado Pago (Colombia) y credenciales de **prueba**, entregadas como variables de
   entorno, nunca en el código ni en Git.
