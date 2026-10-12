# Recarga directa al ID con UniPin (sin PIN)

> **Descartado por el dueño el 2026-10-12** («no veo que sea confiable»). Queda apagado
> (`TOPUP_PROVIDER=none`): no se envía ningún pedido ni dato a UniPin. Alternativa en curso:
> distribuidor de PIN de Garena en Colombia ([`specs/contacto-proveedores.md`](specs/contacto-proveedores.md)).

UniPin es un distribuidor oficial de recargas de juegos con API para socios ("In Game Top Up").
Con esta integración la tienda funciona como LootBar o Pagostore: el cliente escribe su ID, paga
con Mercado Pago y los diamantes llegan a su cuenta **sin PIN y sin que tú hagas nada**.

```
Cliente paga ─► Mercado Pago aprueba ─► la tienda valida el ID en UniPin ─► pide la recarga
            ─► UniPin confirma (transaction_number) ─► pedido «Entregado» + correo al cliente
```

Está **apagada** (`TOPUP_PROVIDER=none`) hasta que UniPin te acepte como socio y la comprobación
`unipin:check` salga bien. Con la tienda apagada nada cambia.

## Lo que la tienda garantiza

| Situación | Qué hace la tienda |
|---|---|
| Pago aprobado y UniPin confirma | Pedido **Entregado**; el cliente recibe «Recarga completada». |
| UniPin no responde a tiempo | **No** lo da por entregado. Consulta a UniPin con la misma referencia (1, 2, 5, 10, 15, 30… min). |
| La referencia ya existe en UniPin (708) | Consulta su estado; **nunca** crea otra recarga. |
| El token de validación caducó (726) | Valida otra vez y repite **la misma** referencia. |
| UniPin rechaza (ID inválido, sin saldo, etc.) | Pedido a **revisión** + correo «Recarga por revisar». |
| Tras ~2 h sin confirmación | Pedido a **revisión** + correo; deja de consultar solo. |
| Entregas pausadas (`FULFILLMENT_ENABLED=false`) | No recarga nada. |
| Servidor o paquete fuera del catálogo de UniPin | Con «vender solo con stock», no deja comprar (mensaje claro). Sin esa opción, queda para entrega a mano. |

Cada unidad tiene una referencia única: `TGS-XXXXXXXXXX-<paquete><unidad>-<intento>`. Como UniPin
rechaza una referencia repetida, **una unidad nunca se recarga dos veces**. Un intento nuevo solo
nace de un error explícito de UniPin.

En revisión, desde tu panel: **«Reanudar la entrega»** reintenta solo las unidades que fallaron
(las que ya se recargaron no se tocan). Si no se puede entregar, reembolsa en Mercado Pago. Antes
de reanudar una recarga «sin confirmar», revisa la transacción en tu panel de UniPin.

## Qué está verificado y qué no

- **Verificado** en el SDK oficial de UniPin (`github.com/UniPinSDK/php`):
  - los servidores `dev-api.unipin.com` (pruebas) y `api.unipin.com` (real);
  - las rutas `in-game-topup/list`, `/detail`, `/user/validate`, `/order/create` y `/order/inquiry`;
  - la firma: HMAC-SHA256 de partnerid + timestamp + path.
- **Según la documentación pública** de UniPin (Postman «In Game Top Up V.2»):
  - los campos `game_code`, `validation_token`, `reference_no`, `denomination_id` y `transaction_number`;
  - los errores 708, 726 y 727.
- **NO VERIFICADO** (falta una cuenta de socio):
  - el nombre `fields` del cuerpo de validación;
  - el campo del ID de Free Fire (`userid`);
  - la forma exacta de las respuestas correctas;
  - si UniPin acepta a una persona natural de Colombia;
  - qué servidores de Free Fire cubre y a qué precio.

  `unipin:check` comprueba los cinco primeros puntos antes de activar.

## Pasos

### 1. Pedir la alianza a UniPin (tú)

En la web corporativa de UniPin (corp.unipin.com), solicita ser socio o merchant de
**In Game Top Up**. Pregunta **por escrito**:

1. ¿Aceptan a una **persona natural de Colombia**? ¿Qué documentos piden?
2. ¿Qué **servidores de Free Fire** cubren (Latinoamérica, Brasil, Norteamérica…)?
3. ¿Qué **precio o descuento** tienen sobre el precio público, y cómo se recarga el saldo?
4. Credenciales de **staging** (pruebas) además de las de producción.

Los datos que pida UniPin se los das **directamente a UniPin**, nunca en un chat.

### 2. Guardar las credenciales (tú, sin pegarlas en un chat)

UniPin te da un **Partner ID** y una **Secret Key**, con los **códigos de juego y denominación**
de su catálogo («Game List» y «Game Details»).

- **Para la comprobación**: en GitHub → Settings → Secrets and variables → Actions, crea
  `UNIPIN_PARTNER_ID`, `UNIPIN_SECRET_KEY` y `UNIPIN_CATALOG`.
- **Para la tienda**: en Render → Environment, las mismas tres, más `UNIPIN_ENV=production`.

`UNIPIN_CATALOG` dice qué paquete de la tienda corresponde a qué denominación y **cuánto te
cobra UniPin** por él (`costCop`, en pesos), por servidor:

```json
{"latam":{"game":"<game_code>","skus":{
  "ff-110":{"denomination":"<id>","costCop":3500},
  "ff-341":{"denomination":"<id>","costCop":9000}}}}
```

Con el costo, la tienda garantiza ganancia: ninguna promo baja del piso y un paquete que no deja
ganancia no se vende por UniPin (`docs/estrategia-promociones.md`). Sin `costCop` también
funciona, pero la ganancia de ese paquete no está garantizada.

Los servidores válidos son `latam`, `brasil`, `norteamerica`, `europa`, `oriente_medio`, `india`
y `asia`. Si UniPin pide el ID con otro nombre, agrega `"uidField":"<nombre>"` al servidor.

### 3. Comprobar (botón en GitHub)

En Actions → **Comprobar UniPin** → Run workflow:

1. `staging`, sin ID: comprueba la firma, los juegos, las denominaciones y el campo del ID.
2. `staging` con tu ID: valida tu cuenta de Free Fire. No cobra.
3. `staging` con tu ID y «Recarga de prueba»: hace una recarga de prueba y la consulta. Confirma
   la forma real de las respuestas.
4. `production`, sin compra: confirma las credenciales reales.

Si algo sale **FALLA**, el mensaje dice qué ajustar.

### 4. Revisar la ganancia (Panel → Catálogo → Rentabilidad)

Tus precios se quedan como están. La tabla muestra, por paquete:

- el **costo máximo** que puedes pagarle a UniPin;
- el costo real, una vez cargado;
- la ganancia por venta;
- si la promo se ajustó o el paquete no deja ganancia.

Ningún precio cambia sin tu autorización.

### 5. Activar (con tu autorización)

En Render: `TOPUP_PROVIDER=unipin`. Al arrancar, el registro muestra «recarga directa UniPin
configurada» con los servidores y paquetes, sin credenciales. `golive:check` lo confirma.

Para apagarla al instante: `TOPUP_PROVIDER=none`. Los pedidos ya pagados siguen en el panel.

## Para el equipo técnico

- Código:
  - `src/server/integrations/topup/unipin.ts` (cliente y clasificación de respuestas);
  - `src/server/services/topups.ts` (motor: inicio, envío, consulta, cierre);
  - `src/server/services/topup-coverage.ts` (cobertura por servidor).
- Base de datos: tabla `topups`, una fila por unidad e intento (migración `0014_topups.sql`).
- Tarea programada `topups` cada minuto, con lock de PostgreSQL. El pago aprobado arranca la
  recarga en el acto, sin bloquear el webhook.
- Pruebas:
  - `tests/unit/unipin.test.ts` (firma con vector independiente, clasificación, HTTP, configuración);
  - `tests/unit/unipin-check.test.ts`;
  - `tests/integration/topup.test.ts`: éxito, varias unidades, tiempo agotado, 708, 726,
    rechazo con reanudación parcial, ID inválido, sin confirmación, entregas pausadas, catálogo
    y checkout.
