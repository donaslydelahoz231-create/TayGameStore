# Registro auxiliar en Google Sheets (opcional)

**Estado:** implementado y probado con una hoja simulada. **No está conectado**: hacen falta
credenciales del dueño y su autorización para ponerlas en Render.

## Qué hace y qué no

- Agrega **una fila por evento**: pago confirmado, recarga entregada y reembolso.
- Columnas:
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
- **Nunca** escribe correo, nombre, UID, nickname ni PIN.
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
4. Crea una hoja de cálculo privada con una pestaña llamada **Pedidos**. En la fila 1 escribe los
   encabezados de la lista de columnas de arriba.
5. Comparte la hoja **solo** con el `client_email` de la cuenta de servicio, como **Editor**.
   No la publiques ni la compartas con enlace.
6. En Render → Environment (variables protegidas), carga:
   - `GOOGLE_SHEETS_SPREADSHEET_ID`: el id de la URL de la hoja (`/d/<id>/edit`);
   - `GOOGLE_SHEETS_CLIENT_EMAIL`: el `client_email`;
   - `GOOGLE_SHEETS_PRIVATE_KEY`: el `private_key` completo. Los saltos de línea pueden ir escritos
     como `\n`;
   - opcional: `GOOGLE_SHEETS_TAB` si la pestaña no se llama «Pedidos».

   Las tres primeras van juntas. Si falta una o la llave no se puede leer, el servidor no arranca y
   dice cuál es.
7. Al reiniciar, el registro de arranque «avisos y automatización» debe decir `hojaGoogle: true`.

Cambiar variables de Render es un cambio en producción: requiere la autorización del dueño.

## Riesgos

- Quien tenga acceso a la hoja ve referencias, paquetes y totales (sin datos personales).
  Compártela solo con la cuenta de servicio y contigo.
- La llave de la cuenta de servicio solo puede editar las hojas compartidas con su correo.
  Si se filtra, bórrala en Google Cloud y crea otra.
- Apagarlo: borra las variables en Render. Los pedidos no se ven afectados.
