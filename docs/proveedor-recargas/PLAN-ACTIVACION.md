# Plan de activación controlada

Nada de este plan se ejecutó en producción. Cada paso marcado **[AUTORIZACIÓN]** espera la orden
expresa del dueño.

## 1. Qué está listo localmente

- **TAY RADAR:**
  - precio en el servidor;
  - regla sellada en cada pedido;
  - actualización automática de la tienda abierta;
  - 11 pruebas nuevas con reloj simulado.
- **Política de ganancia** con el cargo fijo y el IVA de Mercado Pago (variables nuevas, en 0 por
  defecto).
- **Informe de rentabilidad** reproducible: `npm run finanzas:margenes`, con o sin archivo de
  cotización.
- **Arquitectura de recarga por ID** (puerto `TopupProvider`, servicio idempotente, revisión,
  pausa, avisos). Falta un adaptador para el proveedor que se elija.

Todo esto está en un commit local. **Subirlo despliega en Render** → [AUTORIZACIÓN].

## 2. Qué depende del proveedor

1. **Cotización por escrito** de los 6 paquetes en LATAM:
   - moneda;
   - recargo;
   - cuota mensual o de alta;
   - depósito mínimo y forma de fondeo;
   - reembolso de fallidas.

   Contactar → [AUTORIZACIÓN] (orden sugerida en [PROVEEDORES.md](PROVEEDORES.md)).
2. **Pasar la cotización por el informe:**
   `npm run finanzas:margenes -- --costos cotizacion.json`. Solo sigue si deja ≥ 5 % neto en los
   paquetes a automatizar.
3. **Documentación técnica oficial:**
   - autenticación y firma;
   - validación de ID y región;
   - creación con referencia única;
   - consulta de estado;
   - webhooks y su firma;
   - errores y reintentos;
   - entorno de pruebas (sandbox).

   Sin esto no se escribe el adaptador.
4. **Términos:** marca propia, dominio propio, venta a terceros permitida y tratamiento de datos.

## 3. Implementación del adaptador

Local, sin riesgo externo, una vez existan 2 y 3:

1. `src/server/integrations/topup/<proveedor>.ts`: implementa `validateUser`, `createOrder` e
   `inquiry` con los endpoints confirmados. Timeouts cortos. Solo `success` cuenta como
   entregado.
2. Configuración en `env.ts`:
   - `TOPUP_PROVIDER=<proveedor>`;
   - credenciales, solo como variables protegidas;
   - mapa paquete → producto del proveedor con su costo, como hoy `UNIPIN_CATALOG`.
3. Webhook del proveedor, si existe: ruta firmada, deduplicada y que consulte el estado antes de
   marcar nada.
4. Doble de pruebas y suite como `tests/integration/topup.test.ts`. Debe cubrir:
   - éxito;
   - timeout, con consulta sin recargar otra vez;
   - referencia duplicada;
   - error explícito;
   - ID inválido o de otra región;
   - producto no disponible;
   - costo mayor que el máximo (no se vende por el proveedor).
5. Comando de verificación de credenciales, como `unipin:check`, que no recargue nada.

## 4. Qué necesita credenciales

- Llave de API del proveedor, de sandbox y de producción. La crea el dueño en el panel del
  proveedor y la escribe solo en Render; nunca en un chat ni en el repositorio.
- Mercado Pago ya está configurado en producción. No se toca.

## 5. Qué probar en sandbox (si el proveedor lo ofrece)

- Validación de un ID LATAM real del dueño y de un ID inválido.
- Recarga de prueba con su referencia, consulta de estado, webhook firmado y reintento con la
  misma referencia.
- Si no hay sandbox: una sola recarga real del paquete más pequeño a la cuenta del dueño, con
  saldo mínimo → [AUTORIZACIÓN] (dinero real).

## 6. Pasos exactos de producción

Todos **[AUTORIZACIÓN]**, en este orden:

1. Subir el commit de esta misión, que despliega en Render. Comprobar CI, CodeQL y la prueba de
   producción en verde.
2. En Render, ajustar la política de ganancia con los valores del panel de Mercado Pago:
   `PAYMENT_FEE_PCT=3.29`, `PAYMENT_FEE_FIXED_COP=800`, `PAYMENT_FEE_TAX_PCT=19`. Revisar Panel →
   Rentabilidad.
3. Con el adaptador desplegado: cargar credenciales y el mapa de paquetes con costos, con las
   entregas pausadas (`FULFILLMENT_ENABLED=false`): los pagos se guardan, pero no se recarga.
4. Comando de verificación de credenciales. Luego `FULFILLMENT_ENABLED=true` y un pedido real
   pequeño del dueño.
5. Activar `TOPUP_PROVIDER`. Vigilar 48 h:
   - recargas en revisión;
   - saldo del proveedor;
   - margen real (Panel → Rentabilidad y pedidos).
6. **Vuelta atrás:** `TOPUP_PROVIDER=none`. Los pedidos pagados quedan para entrega manual o con
   PIN y no se pierde ningún pago.

## 7. Variables de entorno (sin valores)

| Variable | Para qué | Estado |
|---|---|---|
| `PAYMENT_FEE_PCT`, `PAYMENT_FEE_FIXED_COP`, `PAYMENT_FEE_TAX_PCT`, `MIN_MARGIN_PCT` | Piso de ganancia y panel Rentabilidad | Las dos de cargo fijo e IVA son nuevas (0 = como antes) |
| `PROMO_SCHEDULE` | TAY RADAR (`weekends`) | Sin cambios |
| `TOPUP_PROVIDER` | Proveedor de recarga (`none` hoy) | Sin cambios hasta elegir proveedor |
| Credenciales y mapa del proveedor | Adaptador nuevo | Por definir según su documentación |

## 8. Bloqueos registrados

- **Red del entorno:** sin acceso a las páginas de los proveedores ni a la tienda pública. Se
  habilita en el acceso a red del entorno (Allowed domains).
- **Sin cotizaciones:** el margen real no se puede demostrar todavía.
- **Sin saldo prepago y sin cuota:** ningún proveedor con información pública lo cumple.
