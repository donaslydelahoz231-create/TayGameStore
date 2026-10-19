# Registro auxiliar en Google Sheets (opcional)

**Estado:** implementado y probado con una hoja simulada. La hoja del dueño («TayGameStore ·
Registro de pedidos», en su Drive) ya existe con las pestañas preparadas y compartida solo con la
cuenta de servicio. Se activa cuando las tres variables están en Render (el arranque dice
`hojaGoogle: true`).

## Qué hace y qué no

- Agrega **una fila por evento** (pago confirmado, recarga entregada y reembolso) en **dos
  pestañas** de la misma hoja.
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
- **«Entregas»** (`GOOGLE_SHEETS_DELIVERY_TAB`): lo que hace falta para recargar. Pedido del
  dueño (2026-10-19):
  - Fecha (Colombia)
  - Referencia
  - Evento
  - ID del jugador (como texto: conserva los ceros a la izquierda)
  - Nickname confirmado (el de la búsqueda de ID o el que verificó el dueño)
  - Confirmación del jugador: «Confirmado con la búsqueda de ID», «Confirmado por el cliente
    (escribió su ID dos veces)» o «Verificado por el dueño y aceptado por el cliente». La nota
    libre del operador nunca se copia.
  - Servidor elegido (el que declaró el cliente)
  - Región detectada (la que devolvió la búsqueda de ID o anotó el dueño)
  - Paquete
  - Total
  - Estado del pago
  - Estado de la recarga
  - Comprobante
  - Id del registro
- **Nunca** escribe correo, nombre del cliente ni PIN. «Pedidos» tampoco lleva UID ni nickname.
- Las dos pestañas deben llamarse distinto: si coinciden, el servidor no arranca (así los datos
  del jugador nunca caen en «Pedidos»).
- Cada pestaña va por su propio aviso de la cola (`sheets` y `sheets_delivery`): si una falla, la
  otra no se repite.
- **No es la base de datos ni la autoridad de nada.** Editar o borrar una celda no cambia ningún
  pedido: la tienda solo escribe en la hoja y nunca la lee.
- Escribe con `valueInputOption=RAW`: ningún texto se interpreta como fórmula.
- Va por la cola de avisos:
  - si Google falla, el pedido y el pago siguen igual;
  - la fila se reintenta (1, 5, 15 y 60 min);
  - tras 5 intentos queda como «Aviso sin enviar» en el panel.
- La compra **no depende** de Google: la fila se escribe después de confirmar el pago.
- **Duplicados:** cada evento se escribe una vez por pedido. Si Google tardara en responder y se
  reintentara, la columna «Id del registro» permite detectar la fila repetida.

## Cómo activarlo (dueño)

1. En Google Cloud Console, crea un proyecto (o usa uno existente) y activa **Google Sheets API**.
2. En «IAM y administración → Cuentas de servicio», crea una cuenta de servicio sin roles.
3. Crea una **llave JSON**. El archivo descargado contiene `client_email` y `private_key`.
   **Guárdalo fuera del repositorio** y bórralo cuando termines.
4. Crea una hoja de cálculo privada con las pestañas **Pedidos** y **Entregas**. En la fila 1 de
   cada una escribe los encabezados de su lista de columnas de arriba.
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
