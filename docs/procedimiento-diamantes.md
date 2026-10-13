# Procedimiento: quién tiene los diamantes y cómo llegan al cliente

TayGameStore **no fabrica diamantes**. Los diamantes solo los emite Garena; la tienda los
revende. Quien los tiene es **el dueño**, que los compra antes (o en el momento) a un canal
autorizado y los entrega al ID del cliente. El catálogo de la tienda es lo que se ofrece; el
**inventario** es lo que el dueño ya compró y tiene listo para entregar.

## Cómo opera la tienda hoy (desde el 13-oct-2026)

Entrega **manual por el dueño** (forma 2 de abajo):

- `SELL_ONLY_WITH_STOCK=false`: los 6 paquetes se venden aunque no haya PIN cargados.
- `TOPUP_PROVIDER=none`: no hay recarga automática por proveedor.
- El cliente confirma su ID dos veces (`PLAYER_VERIFICATION=customer`) y paga al instante.

### Catálogo y lo que te queda de cada venta

Mercado Pago cobra 3,29 % + $800 + IVA (configurado en Render el 13-oct). La última columna es
lo máximo que puedes pagar por la recarga sin perder dinero.

| Paquete | Precio normal | TAY RADAR (sáb. y dom., hora Colombia) | Te queda (normal / TAY RADAR) |
|---|---:|---:|---:|
| 100 + 10 💎 | $4.000 | $3.800 | $2.891 / $2.699 |
| 310 + 31 💎 | $11.000 | $10.500 | $9.617 / $9.136 |
| 520 + 52 💎 | $18.000 | $17.000 | $16.343 / $15.382 |
| 1.060 + 106 💎 | $33.000 | $31.000 | $30.756 / $28.834 |
| 2.180 + 218 💎 | $65.000 | $60.000 | $61.503 / $56.698 |
| 5.600 + 560 💎 | $150.000 | $138.000 | $143.175 / $131.645 |

El precio lo fija el servidor al crear el pedido y queda en el comprobante. Cifras de
`npm run finanzas:margenes -- --escenario mp-instante`.

### Lista del dueño por cada pedido pagado

1. **Aviso:** con el panel abierto suena y sale «(N) Pagados por entregar» en la pestaña.
   - Con correo (`SMTP_*`) o Telegram configurados, también te llega el aviso.
   - El registro de Render «avisos y automatización» dice cuáles están activos.
2. **Panel → Pedidos → el pedido → Reclamar → Empezar.** Revisa:
   - el **ID**;
   - el **servidor** que eligió el cliente;
   - los **paquetes** y las cantidades.
3. **Recarga** los diamantes al ID del cliente en un canal oficial (por ejemplo, Recargas Free
   Fire por ID en pagostore.com), con tu medio de pago.
4. **Entregar**, con la evidencia: canal, hora y número de la transacción. El cliente recibe
   «Recarga completada» y en «Seguimiento» le aparece el formulario de reseña.
5. **Si no puedes entregar** (ID de otro servidor, canal caído):
   - pasa el pedido a revisión y escríbele al cliente por el correo del pedido;
   - si no se puede, reembolsa por Mercado Pago (términos, sección 7).
6. **Plazo:** el que publica la tienda (`LEGAL_DELIVERY_TIME`). Si vas a estar fuera, actívalo en
   `MAINTENANCE_MODE` o ajusta el plazo antes de recibir pagos que no podrás atender.

### Reseñas

**Panel → Reseñas** («Por revisar»):

- **Publicar** la muestra en la tienda con nombre de pila e inicial.
- **Ocultar** la retira.
- El texto del cliente no se puede editar ni borrar: lo impide la base de datos.
- La alerta «Reseñas por revisar» te avisa cuando hay nuevas.
- Publica también las críticas honestas: es lo que hace creíble la tienda.

## Las tres formas de surtir un pedido

| Forma | Cómo se consiguen los diamantes | Cuándo usarla | En la tienda |
|---|---|---|---|
| **1. Inventario de PIN** (recomendada para empezar) | El dueño compra PIN de Free Fire por paquete a una red autorizada (MOViiRED, Practi, Refácil, RedCo, PTM, Full Carga, Multipagas; ver `docs/specs/contacto-proveedores.md`) y los carga en **Panel → Inventario** | Ventas diarias; entrega en minutos | Al empezar la entrega se reserva un PIN por unidad; el dueño lo canjea al ID del cliente en el canal oficial y marca «Entregar» |
| **1b. Entrega automática de PIN** (`PIN_AUTO_DELIVERY=true`) | Los mismos PIN del inventario | Para vender las 24 horas sin intervenir | Al aprobarse el pago, si hay PIN para todas las unidades, el pedido queda **entregado solo**: el cliente ve «Ver mi PIN» en su pedido, lo recibe por correo y lo canjea en **pagostore.com** (oficial de Garena) → Free Fire → su ID → «Tarjetas de Regalo y Pines Digitales». Sin PIN suficientes, pasa a la forma 1 o 2 |
| **2. Recarga manual por ID** | Por cada pedido pagado, el dueño compra la recarga al ID del cliente en un canal oficial con su propio medio de pago | Sin stock de PIN o paquete agotado | Igual que hoy: «Reclamar → Empezar → Entregar» con la evidencia |
| **3. API de un proveedor** (fase 2) | Contrato de revendedor con API: valida el ID y recarga automáticamente | Cuando haya contrato y documentación oficial | Se conecta al código ya preparado (`docs/specs/proveedores-recargas.md`) |

Nunca: cuentas de terceros, «diamantes al por mayor» de vendedores sin contrato, generadores ni
páginas que piden la contraseña del juego. Eso es fraude o robo de cuentas y Garena puede
anular las recargas y bloquear al cliente.

## Modo 100 % automático (sin entregas a mano)

Con `PIN_AUTO_DELIVERY=true` y `SELL_ONLY_WITH_STOCK=true` la tienda **solo vende lo que puede
entregar sola**: cada paquete muestra «Agotado» si no tiene PIN libre en **Panel → Inventario**,
el PIN queda apartado mientras el cliente paga y, al aprobarse el pago, se entrega solo (en el
pedido y por correo). El dueño solo tiene que **mantener PIN cargados**; la tienda le avisa por los
pedidos y el inventario muestra cuántos quedan de cada paquete.

> **2026-10-12:** el dueño descartó UniPin. La integración sigue apagada (`TOPUP_PROVIDER=none`).
> El camino elegido es un distribuidor de PIN de Garena en Colombia, con compra automática por API
> si la ofrece: [`specs/contacto-proveedores.md`](specs/contacto-proveedores.md).

**Sin PIN, directo al ID:** con un contrato de socio con UniPin (distribuidor oficial) y
`TOPUP_PROVIDER=unipin`, la tienda recarga sola al ID del jugador y solo marca «Entregado» cuando
UniPin lo confirma. Si hay PIN en el inventario, se usan primero. Guía y pasos:
[`recarga-directa-unipin.md`](recarga-directa-unipin.md).

## El ciclo de un pedido (inventario de PIN)

1. **Cliente:** elige el paquete, escribe su ID, **lo repite y lo confirma** («Sí, es mi ID») y
   paga al instante en Mercado Pago (tarjeta, Nequi por PSE, PSE, Efecty o saldo), sin esperar a
   que el dueño verifique nada (`PLAYER_VERIFICATION=customer`). La promo de fin de semana aplica
   sola.
2. **Tienda:** Mercado Pago confirma el pago → el pedido queda «Pagado (entregar)», el cliente
   recibe su **comprobante de pago** por correo y al dueño le llega el aviso (panel, Telegram,
   correo o n8n, según lo configurado).
3. **Dueño, en el panel:** abre el pedido → **Reclamar** → **Empezar**. La tienda reserva del
   inventario el PIN más antiguo del paquete. Si no hay suficientes, avisa y el resto se
   entrega de forma manual (forma 2).
4. **Dueño, en el canal oficial de canje:** escribe el **ID del cliente** que aparece en el
   pedido y el PIN reservado (botón «Copiar»).
5. **Dueño, en el panel:** **Entregar** con la evidencia (p. ej. «PIN canjeado al ID 123…»).
   El PIN queda «usado», el cliente recibe «Recarga completada» y el pedido se cierra.
6. Si un PIN no sirve (ya canjeado, ilegible): **Anular** y repetir el paso 3 con otro. Si se
   reservó pero no se usó (p. ej. el pedido pasó a revisión): **Liberar** y vuelve al stock.

## Dinero y márgenes

- El cliente paga a **Mercado Pago**, que deposita en la cuenta del dueño (Checkout Pro).
- El dueño paga sus PIN a la red con su propio medio. El campo «Costo por PIN» del inventario
  sirve para calcular el margen: `precio de venta − costo del PIN − comisión de Mercado Pago`.
- Reponer cuando el panel muestre «reponer» (menos de 3 disponibles en un paquete con
  inventario). La alerta «Inventario bajo» aparece en la pestaña Pedidos.

## Seguridad del inventario

- Los PIN se guardan **cifrados** (AES-256-GCM); un PIN repetido no se puede cargar dos veces.
- Solo el dueño (con doble factor) los ve, y solo en el pedido al que se reservaron. Con la
  entrega automática, el **comprador** ve los PIN de su propio pedido (misma autorización que
  ver el pedido) y los recibe en su correo: es lo que compró.
- Nunca salen en la auditoría (solo la cantidad), en los registros del servidor ni en n8n, ni en
  los avisos al dueño.
- Dos entregas a la vez nunca reciben el mismo PIN (bloqueo de filas en la base de datos).

## Antes de vender con dinero real

Ver `docs/salir-a-produccion.md`: credenciales de producción de Mercado Pago, textos legales
(`LEGAL_*`), correo de la tienda (`SMTP_*`) y acceso del dueño al panel (Google). El inventario
no necesita configuración extra: usa la misma clave de cifrado que el doble factor del panel.
