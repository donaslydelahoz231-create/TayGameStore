# Procedimiento: quién tiene los diamantes y cómo llegan al cliente

TayGameStore **no fabrica diamantes**. Los diamantes solo los emite Garena; la tienda los
revende. Quien los tiene es **el dueño**, que los compra antes (o en el momento) a un canal
autorizado y los entrega al ID del cliente. El catálogo de la tienda es lo que se ofrece; el
**inventario** es lo que el dueño ya compró y tiene listo para entregar.

## Las tres formas de surtir un pedido

| Forma | Cómo se consiguen los diamantes | Cuándo usarla | En la tienda |
|---|---|---|---|
| **1. Inventario de PIN** (recomendada para empezar) | El dueño compra PIN de Free Fire por paquete a una red autorizada (MOViiRED, Practi, Refácil, RedCo, PTM, Full Carga, Multipagas; ver `docs/specs/contacto-proveedores.md`) y los carga en **Panel → Inventario** | Ventas diarias; entrega en minutos | Al empezar la entrega se reserva un PIN por unidad; el dueño lo canjea al ID del cliente en el canal oficial y marca «Entregar» |
| **2. Recarga manual por ID** | Por cada pedido pagado, el dueño compra la recarga al ID del cliente en un canal oficial con su propio medio de pago | Sin stock de PIN o paquete agotado | Igual que hoy: «Reclamar → Empezar → Entregar» con la evidencia |
| **3. API de un proveedor** (fase 2) | Contrato de revendedor con API: valida el ID y recarga automáticamente | Cuando haya contrato y documentación oficial | Se conecta al código ya preparado (`docs/specs/proveedores-recargas.md`) |

Nunca: cuentas de terceros, «diamantes al por mayor» de vendedores sin contrato, generadores ni
páginas que piden la contraseña del juego. Eso es fraude o robo de cuentas y Garena puede
anular las recargas y bloquear al cliente.

## El ciclo de un pedido (inventario de PIN)

1. **Cliente:** elige el paquete, escribe su ID y paga en Mercado Pago (tarjeta, PSE, Efecty o
   saldo). La promo de fin de semana aplica sola.
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
- Solo el dueño (Google + doble factor) los ve, y solo en el pedido al que se reservaron.
- Nunca salen en la auditoría, en los registros del servidor, en n8n ni en correos.
- Dos entregas a la vez nunca reciben el mismo PIN (bloqueo de filas en la base de datos).

## Antes de vender con dinero real

Ver `docs/salir-a-produccion.md`: credenciales de producción de Mercado Pago, textos legales
(`LEGAL_*`), correo de la tienda (`SMTP_*`) y acceso del dueño al panel (Google). El inventario
no necesita configuración extra: usa la misma clave de cifrado que el doble factor del panel.
