# Política de seguridad

## Versiones con soporte

TayGameStore se despliega de forma continua: solo recibe correcciones de seguridad la versión
desplegada desde la rama principal. No hay versiones antiguas mantenidas.

## Cómo reportar una vulnerabilidad

- **No abras un issue público** con detalles de una vulnerabilidad.
- Usa **"Report a vulnerability"** en la pestaña **Security** de este repositorio (reporte
  privado de GitHub). Si no aparece, el propietario debe activarlo en _Settings → Code security
  → Private vulnerability reporting_.
- Incluye: qué componente (tienda, API, panel de administración, pagos, webhooks), pasos para
  reproducirlo y el impacto que observaste.
- **Nunca** pruebes con datos o pagos de otras personas ni contra la cuenta de producción de
  Mercado Pago: usa tu propio entorno o el sandbox (`docs/sandbox-mercadopago.md`).

## Qué esperar

- Acuse de recibo y evaluación inicial: `[COMPLETAR por el propietario: plazo, p. ej. 3 días hábiles]`.
- Si se confirma, se corrige, se despliega y se te informa. Si no aplica, se explica el motivo.

## Alcance

Incluido: código de este repositorio (frontend, API Fastify, base de datos, integración con
Mercado Pago y Google OAuth, CI).
Fuera de alcance: servicios de terceros (Mercado Pago, Google, Render) — repórtalos a cada
proveedor.

Procedimiento interno de respuesta: [`docs/incident-response.md`](docs/incident-response.md).
