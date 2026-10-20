# Registro auxiliar en Google Sheets (opcional)

**Estado:** implementado y probado con una hoja simulada. La hoja del dueño («TayGameStore ·
Registro de pedidos», en su Drive) ya existe con las pestañas preparadas y compartida solo con la
cuenta de servicio. Se activa cuando las tres variables están en Render (el arranque dice
`hojaGoogle: true`).

## Qué hace y qué no

- Escribe en **dos pestañas** de la misma hoja:
  - «Pedidos»: **una fila por evento** (pago confirmado, recarga entregada y reembolso), como
    historial;
  - «Entregas»: **una fila por pedido** que se reescribe con cada cambio de estado.
- **«Pedidos»** (`GOOGLE_SHEETS_TAB`), sin datos personales:
  - Fecha (Colombia)
  - Referencia
  - Evento
  - Paquete
  - Total
  - Moneda
  - Estado del pago
  - Estado de la recarga
  - Comprobante
  - Id del registro
- **«Entregas»** (`GOOGLE_SHEETS_DELIVERY_TAB`): lo que hace falta para recargar, en tiempo real.
  Pedido del dueño (2026-10-19):
  - la fila del pedido aparece al confirmarse el pago y se **actualiza** (misma fila, buscada por
    la referencia de la columna A) al tomarla, empezar, entregar, fallar, pasar a revisión o
    reembolsar. Solo pedidos que llegaron a pagados;
  - columna «Estado»: «⏳ Por entregar», «🔄 En proceso», «✅ Entregado con éxito», «⚠️ Requiere
    revisión», «↩️ Reembolsado» o «✖️ Cancelado»;
  - 19 columnas, en este orden:
    1. Referencia
    2. Estado
    3. Pagado (Colombia)
    4. Entregado (Colombia)
    5. Minutos hasta la entrega
    6. ID del jugador (como texto: conserva los ceros a la izquierda)
    7. Nickname confirmado (el de la búsqueda de ID o el que verificó el dueño)
    8. Confirmación del jugador: «Confirmado con la búsqueda de ID», «Confirmado por el cliente
       (escribió su ID dos veces)» o «Verificado por el dueño y aceptado por el cliente». La nota
       libre del operador nunca se copia.
    9. Servidor elegido (el que declaró el cliente)
    10. Región detectada (la que devolvió la búsqueda de ID o anotó el dueño)
    11. Paquete
    12. Total
    13. Estado del pago
    14. Estado de la recarga
    15. Comprobante
    16. Código de verificación (del comprobante)
    17. Operación de pago: proveedor y número, p. ej. «Mercado Pago · 123…» o «Nequi
        (transferencia) · referencia del movimiento»
    18. Evidencia o motivo (de la entrega, el fallo o la revisión)
    19. Actualizado (Colombia)
- **Nunca** escribe correo, nombre del cliente ni PIN. «Pedidos» tampoco lleva UID ni nickname.
- Las dos pestañas deben llamarse distinto: si coinciden, el servidor no arranca (así los datos
  del jugador nunca caen en «Pedidos»).
- Cada pestaña va por su propio aviso de la cola (`sheets` y `sheets_delivery`): si una falla, la
  otra no se repite.
- **No es la base de datos ni la autoridad de nada.** Editar o borrar una celda no cambia ningún
  pedido. De la hoja la tienda solo lee la columna A de «Entregas», para encontrar la fila del
  pedido que reescribe; si la borras, la siguiente actualización la vuelve a crear al final.
- Escribe con `valueInputOption=RAW`: ningún texto se interpreta como fórmula.
- Va por la cola de avisos:
  - si Google falla, el pedido y el pago siguen igual;
  - la fila se reintenta (1, 5, 15 y 60 min);
  - tras 5 intentos queda como «Aviso sin enviar» en el panel.
- La compra **no depende** de Google: la fila se escribe después de confirmar el pago.
- **Duplicados:** en «Pedidos», cada evento se escribe una vez por pedido; si Google tardara en
  responder y se reintentara, la columna «Id del registro» permite detectar la fila repetida. En
  «Entregas» hay una sola fila por pedido: la cola nunca envía dos actualizaciones del mismo
  pedido a la vez y la última siempre lleva el estado más reciente (`order_sheet_sync`,
  migración 0020).

## Pestaña «Compras_LootBar» (la llena el dueño)

Pedido del dueño (2026-10-20): registrar en la misma hoja lo que compra en LootBar para cumplir
los pedidos, separado de las ventas. La tienda **no** escribe ni lee esta pestaña, y tampoco
automatiza LootBar (está descartado en `proveedor-recargas/PROVEEDORES.md`).

- Una fila por compra en LootBar. Columnas que escribe el dueño: fecha, ID de la orden en
  LootBar, referencia del pedido `TGS-…` (vacía si la compra fue para tener saldo), paquete,
  diamantes, costo, moneda (COP o USD), tasa USD→COP, medio de pago, estado de la compra
  («Completada», «Pendiente», «Fallida» o «Reembolsada») y notas.
- Columnas automáticas (grises, con aviso al editarlas): costo en COP; paquete vendido, venta y
  estado de la recarga, que se traen de «Entregas» por la referencia; ganancia del pedido (venta
  menos las compras completadas de ese pedido, contada una sola vez aunque haya varias compras),
  margen y «Control».
- De «Entregas» solo se traen paquete, total y estado de la recarga: **nunca** el ID ni el
  nickname del jugador.
- Sin duplicados: el ID de LootBar no se puede repetir (validación estricta) y «Control» marca
  «⚠️ ID de LootBar repetido». También marca falta de costo o de tasa, una referencia que no está
  en «Entregas» y los pedidos con pérdida.
- El resumen de compras va arriba en la misma pestaña (filas 2–3): «Resumen» sigue siendo solo de
  ventas y no se tocó.
- Historial: no se borran filas; una compra caída cambia de estado.
- Copias: antes de crear la pestaña se hizo una copia completa del archivo en el mismo Drive
  (solo con acceso del dueño). Además, Google guarda el historial de versiones del archivo
  (Archivo → Historial de versiones).

## Cómo activarlo (dueño)

1. En Google Cloud Console, crea un proyecto (o usa uno existente) y activa **Google Sheets API**.
2. En «IAM y administración → Cuentas de servicio», crea una cuenta de servicio sin roles.
3. Crea una **llave JSON**. El archivo descargado contiene `client_email` y `private_key`.
   **Guárdalo fuera del repositorio** y bórralo cuando termines.
4. Crea una hoja de cálculo privada con las pestañas **Pedidos** y **Entregas**. En la fila 1 de
   cada una escribe los encabezados de su lista de columnas de arriba (la fila 1 nunca se
   reescribe).
5. Comparte la hoja **solo** con el `client_email` de la cuenta de servicio, como **Editor**.
   No la publiques ni la compartas con enlace.
6. En Render → Environment (variables protegidas), carga:
   - `GOOGLE_SHEETS_SPREADSHEET_ID`: el id de la URL de la hoja (`/d/<id>/edit`);
   - `GOOGLE_SHEETS_CLIENT_EMAIL`: el `client_email`;
   - `GOOGLE_SHEETS_PRIVATE_KEY`: el `private_key` completo. Los saltos de línea pueden ir escritos
     como `\n`;
   - opcional: `GOOGLE_SHEETS_TAB` y `GOOGLE_SHEETS_DELIVERY_TAB` si las pestañas no se llaman
     «Pedidos» y «Entregas».

   Las tres primeras van juntas. Si falta una o la llave no se puede leer, el servidor no arranca y
   dice cuál es.
7. Al reiniciar, el registro de arranque «avisos y automatización» debe decir `hojaGoogle: true`.

Cambiar variables de Render es un cambio en producción: requiere la autorización del dueño.

## Riesgos

- Quien tenga acceso a la hoja ve referencias, paquetes y totales y, en «Entregas», el ID,
  nickname, servidor y región de cada jugador (datos personales de tus clientes). Compártela
  solo con la cuenta de servicio y contigo; nunca con enlace. La política de privacidad
  (`privacidad.html`, punto 4) lo informa.
- La llave de la cuenta de servicio solo puede editar las hojas compartidas con su correo.
  Si se filtra, bórrala en Google Cloud y crea otra.
- Apagarlo: borra las variables en Render. Los pedidos no se ven afectados.
