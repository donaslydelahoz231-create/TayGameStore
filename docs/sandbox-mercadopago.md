# Probar Mercado Pago en sandbox (paso a paso)

> Estado: herramientas **IMPLEMENTADAS y probadas con un doble de pruebas**. La prueba contra
> el sandbox real **la hace el propietario** desde su máquina o desde staging: el entorno de
> desarrollo de Claude no puede llegar a los dominios de Mercado Pago y nunca recibe
> credenciales.

## Por qué es seguro

| Riesgo | Protección |
|---|---|
| Usar credenciales reales creyendo que son de prueba | `MP_MODE` declarado + contraste con `live_mode` de cada pago: un pago real en `sandbox` va a revisión, nunca a entrega |
| Entregar una recarga por un pago de prueba en producción | Igual, en sentido contrario (`live_mode=false` con `MP_MODE=production` → revisión) |
| Clientes confundidos en staging | Avisos "Modo prueba" en la tienda, en el resumen de pago y en el panel |
| Secretos en Git | Solo variables de entorno (`.env` está en `.gitignore`; gitleaks en CI) |
| Probar con la cuenta de producción | `npm run mp:sandbox` se niega si `MP_MODE` no es `sandbox` |
| Cobros dobles o pedidos fantasma en pruebas | Las mismas garantías de producción: idempotencia, firma del webhook, consulta a la API |

## 1. Cuentas de prueba (panel de Mercado Pago Developers)

1. Entra a **Tus integraciones**, elige (o crea) tu aplicación de **Checkout Pro**.
2. En **Cuentas de prueba** crea una cuenta **vendedora** y una **compradora** (Colombia).
   Según la documentación, las credenciales de la cuenta vendedora de prueba son tus
   credenciales de prueba y su access token empieza por `APP_USR`.
3. Con la cuenta **vendedora de prueba**: copia su *Access Token*.
4. **Webhooks**: URL `https://<tu-staging>/api/webhooks/mercadopago`, evento **Pagos**; copia la
   *clave secreta*.

Fuentes: [Cuentas de prueba](https://www.mercadopago.cl/developers/en/docs/checkout-pro/test-accounts) ·
[Compras de prueba](https://www.mercadopago.com.pe/developers/en/docs/checkout-pro-preferences/integration-test/test-purchases).

## 2. Variables (nunca en Git)

En tu `.env` local o en las variables de entorno de staging:

```bash
PUBLIC_BASE_URL=https://<url-publica>   # túnel https en local o el dominio de staging
PAYMENTS_ENABLED=true
CHECKOUT_ENABLED=true
MP_MODE=sandbox
MP_ACCESS_TOKEN=<access token de la cuenta VENDEDORA DE PRUEBA>
MP_WEBHOOK_SECRET=<clave secreta del webhook>
```

## 3. Prueba rápida de la integración (sin la tienda)

```bash
npm run mp:sandbox -- preferencia --monto 3800
```

Imprime la referencia `SANDBOX-…` y la URL del checkout. Ábrela en una ventana privada con la
**cuenta compradora de prueba** y paga con una tarjeta de prueba. Después:

```bash
npm run mp:sandbox -- buscar SANDBOX-XXXXXXXXXX   # o: npm run mp:sandbox -- pago <id>
```

Debe mostrar `live_mode: false`. Si aparece **¡ATENCIÓN!**, las credenciales no son de prueba:
detente y revísalas.

## 4. Prueba completa en la tienda (staging)

Tarjetas de prueba de Colombia (documentación de Mercado Pago, comprobar que siguen vigentes en
[Tarjetas de prueba](https://www.mercadopago.com.co/developers/es/docs/checkout-bricks/integration-test/test-cards)):

| Tarjeta | Número | CVV | Vencimiento |
|---|---|---|---|
| Mastercard | 5254 1336 7440 3564 | 123 | 11/30 |
| Visa | 4013 5406 8274 6260 | 123 | 11/30 |

El **nombre del titular** decide el resultado: `APRO` (aprobado), `OTHE` (rechazado),
`CONT` (pendiente). Documento: el que indique la página de tarjetas de prueba.

| Caso | Cómo | Resultado esperado en TayGameStore |
|---|---|---|
| Aprobado | Titular `APRO` | Pedido `PAID` → aparece en "Entregas" del panel |
| Rechazado | Titular `OTHE` | Sigue "Pago pendiente"; se puede reintentar sin duplicar |
| Pendiente | Titular `CONT` | "Pago en proceso"; la conciliación lo actualiza solo |
| Webhook repetido | "Simular notificación" en Tus integraciones | Sin efectos dobles |
| Firma inválida | Cambiar `MP_WEBHOOK_SECRET` y repetir | 401, sin cambios en el pedido |
| Reembolso | Reembolsar en el panel de Mercado Pago → "Conciliar" | Pedido `REFUNDED` |
| Doble clic en pagar | Pulsar "Confirmar y pagar" dos veces | Una sola preferencia |
| Volver sin pagar | Cerrar el checkout | Nada se marca como pagado |

Anota en `docs/specs/pagos.md` (checklist) fecha, versión y resultado de cada caso.

## 5. Paso a producción

1. Credenciales de **producción** de la cuenta real + `MP_MODE=production` + webhook del dominio
   real con su clave.
2. Una compra real de bajo importe y su reembolso.
3. Verifica en el panel: "Mercado Pago: PRODUCCIÓN".
