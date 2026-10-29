# Registro auxiliar en Google Sheets (opcional)

**Estado (2026-10-29):** implementado y probado; en producción **apagado** hasta que el dueño
cargue la llave.

- El arranque de producción dice «Hoja de Google apagada: falta la llave de la cuenta de
  servicio (`GOOGLE_SHEETS_CREDENTIALS_JSON`)». El id de la hoja ya está en Render.
- La hoja real («TayGameStore · Registro de pedidos», en el Drive del dueño) está lista
  (revisado en solo lectura):
  - tiene las pestañas «Pedidos», «Entregas», «Pagos pendientes» y «Usuarios», con encabezados
    idénticos a las columnas que escribe la tienda;
  - está compartida solo con el dueño y con la cuenta de servicio `tienda-hoja` (Editor), sin
    enlace público.
- Al cargar la llave, el arranque dice `hojaGoogle: true` y la hoja se pone al día sola (ver
  «Puesta al día al conectar»).

## Cada cuánto se actualiza

- **Al momento.** Cada cambio de un pedido se guarda en la base y, justo después, la tienda
  escribe su fila en la hoja (en la misma petición espera hasta 300 ms; si Google tarda más,
  termina en segundo plano). En la práctica la fila aparece en uno o dos segundos.
- No hay una tarea que «revise cada X minutos» para escribir: la tarea programada solo reintenta
  lo que Google no aceptó (1, 5, 15 y 60 min) y, si Google limita la cuota (429), espera de 1 a
  3 min sin perder la fila.
- Límite real: Google acepta unas 60 escrituras por minuto por cuenta de servicio (unos 12
  pedidos por minuto, ver «Capacidad»). Por encima, la hoja se atrasa unos minutos y se pone al
  día sola.
- Las columnas calculadas («Esperando (min)» en «Por entregar») dependen del recálculo de Google
  Sheets. Con «Al cambiar» (ajuste actual de la hoja) avanzan cuando entra una fila nueva; con
  «Al cambiar y cada minuto» avanzan solas. Ese ajuste es del archivo del dueño (ver
  «Prueba con una copia de la hoja»: se cambia solo con su autorización).

## Puesta al día al conectar

Pedido del dueño (2026-10-29): «que se sincronice totalmente». Antes, los pedidos que pasaban
con la hoja apagada nunca llegaban a ella. Ahora, la primera vez que corre la tarea de avisos en
cada arranque (a los pocos segundos), la tienda:

- encola la fila de «Entregas» de cada pedido que llegó a pagado (tiene comprobante) y la de
  «Pagos pendientes» de cada pedido Nequi que nunca tuvieron la suya; se escriben con su estado
  actual;
- vuelve a intentar las filas de la hoja que quedaron fallidas (por ejemplo, si la llave no
  servía): basta corregir la llave y reiniciar;
- no repite lo que ya tiene su fila (enviada, pendiente o en curso);
- «Usuarios» ya se ponía al día sola (`customer_profiles.sheet_version`);
- «Pedidos» es un historial de eventos y empieza desde que la hoja está conectada: la tienda no
  inventa eventos pasados con fechas que no conoce.

En producción (2026-10-29) hay 24 pedidos, todos vencidos sin pago (18 de Mercado Pago y 6 de
Nequi), y 58 clientes. Al conectar, «Pagos pendientes» recibirá los 6 pedidos Nequi como
«⌛ Venció sin pago» y «Usuarios» los 58 clientes; «Entregas» queda vacía hasta el primer pago.

## ¿Hace falta Make (o n8n)?

No para esto. La conexión directa ya está programada, probada y es más rápida:

| | Directa (tienda → Google) | Con Make |
| --- | --- | --- |
| Retraso | 1–2 s después de cada cambio | Webhook de Make + sus pasos: segundos, más la cola de Make |
| Costo | Gratis (cuota de Google) | Plan de Make: cada fila usa varias operaciones (buscar + actualizar) |
| Orden y duplicados | Una sola fila por pedido, en orden, con reintentos y sin perder filas | Hay que construirlo en Make |
| Datos de clientes | Solo Google | Pasan también por Make (otro tercero: requiere autorización y aviso en la política de privacidad) |
| Lo que falta | Cargar la llave en Render | Crear la cuenta y el escenario, y cargar `EVENTS_WEBHOOK_URL` y `EVENTS_WEBHOOK_SECRET` en Render |

Make sigue siendo útil para otras automatizaciones (avisos, reportes): la tienda ya envía eventos
firmados de pedidos (`EVENTS_WEBHOOK_URL`, ver `docs/n8n.md`) a cualquier webhook.

## Qué hace y qué no

- Escribe en **tres pestañas** de la misma hoja:
  - «Pedidos»: **una fila por evento** (pago confirmado, recarga entregada y reembolso), como
    historial;
  - «Entregas»: **una fila por pedido** que se reescribe con cada cambio de estado;
  - «Pagos pendientes»: **una fila por pedido Nequi** con lo que el cliente te debe y lo que
    avisó al transferir (ver más abajo).
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
- **«Pagos pendientes»** (`GOOGLE_SHEETS_PENDING_TAB`). Pedido del dueño (2026-10-20): ver en la
  hoja el pago pendiente del cliente hacia el dueño. Solo pedidos **Nequi**: a los de Mercado
  Pago los confirma Mercado Pago, no el dueño.
  - la fila aparece cuando el cliente elige Nequi y se **actualiza** (misma fila, buscada por la
    referencia de la columna A) cuando avisa «Ya transferí», cuando el dueño confirma o rechaza
    el aviso, cuando devuelve el dinero y cuando el pedido vence;
  - columna «Estado del pago»: «⏳ Esperando la transferencia», «💰 El cliente avisó que pagó:
    verifícalo en tu Nequi», «✖️ Aviso rechazado: esperando otra transferencia», «✅ Pago
    confirmado», «↩️ Devuelto al cliente», «⌛ Venció sin pago» o «⚠️ Venció con un aviso sin
    verificar: revisa tu Nequi». **El aviso del cliente nunca es un pago**: solo la confirmación
    del dueño en el panel, después de ver el dinero en su app Nequi;
  - 13 columnas, en este orden:
    1. Referencia
    2. Estado del pago
    3. Total a recibir
    4. Paquete
    5. Pedido creado (Colombia)
    6. Vence (Colombia) (vacía cuando ya no espera pago)
    7. Cliente avisó el pago (Colombia)
    8. 4 últimos dígitos de la cuenta que pagó (lo que escribió el cliente; como texto)
    9. Referencia del comprobante (cliente) (la que escribió el cliente, si la dio)
    10. Confirmado (Colombia)
    11. Referencia Nequi confirmada (la que escribió el dueño al confirmar)
    12. Motivo del rechazo (el que escribió el dueño)
    13. Actualizado (Colombia)
  - lleva los 4 últimos dígitos y la referencia que dio el cliente (datos de pago de tus
    clientes): nunca su correo, nombre, celular completo ni el ID del jugador.
- **«Usuarios»** (`GOOGLE_SHEETS_USERS_TAB`). Pedido del dueño (2026-10-21): cada cliente de la
  tienda, invitado o con cuenta (Google o Facebook), recibe un **nombre de usuario al azar**
  (p. ej. «HalconFugaz482») que puede cambiar en «Cuenta → Cambiar nombre de usuario».
  - una fila por cliente, que aparece cuando entra por primera vez (al pulsar «Continuar como
    invitado» o al iniciar sesión) y se **reescribe** (misma fila, buscada por el código de la
    columna A) cada vez que cambia el nombre. El código no cambia nunca; el nombre sí;
  - 7 columnas, en este orden:
    1. Código (`U-` + 8 letras/números)
    2. Usuario (el nombre de usuario actual)
    3. Tipo: «Invitado», «Cuenta (Google)», «Cuenta (Facebook)» o «Cuenta (Google + Facebook)»
    4. Creado (Colombia)
    5. Último cambio de nombre (Colombia) (vacía si nunca lo cambió)
    6. Cambios de nombre
    7. Actualizado (Colombia)
  - solo el alias: **nunca** el correo, el nombre real de la cuenta de Google o Facebook, la IP ni
    la cookie del navegador;
  - reglas del nombre (las aplica el servidor): de 3 a 20 caracteres, letras sin tildes, números o
    `_`, empezando por una letra; único sin distinguir mayúsculas; sin números de 7 o más cifras
    seguidas (podrían ser un celular o un documento); y sin palabras de la tienda o que suplanten a
    alguien (admin, TayGameStore, Tay, TGS, soporte, oficial, dueño, Garena, Free Fire, Nequi,
    Mercado Pago…, también escritas con números como «4dm1n»). Solo la cuenta del dueño (rol
    administrador en `ADMIN_EMAILS`) puede usar esas palabras;
  - contra abuso: como mucho 20 perfiles de invitado nuevos por conexión cada 24 h, y límites de
    peticiones por IP para pedir y cambiar el nombre;
  - si la hoja estaba desconectada, al conectarla se escriben también los clientes que ya
    existían (la tienda guarda qué fila falta por escribir: `customer_profiles.sheet_version`).
- **Nunca** escribe correo, nombre del cliente ni PIN. «Pedidos» tampoco lleva UID ni nickname.
- Las cuatro pestañas deben llamarse distinto: si coinciden, el servidor no arranca (así los datos
  del jugador nunca caen en «Pedidos» y ninguna fila rompe las columnas de otra pestaña).
- Cada pestaña de pedidos va por su propio aviso de la cola (`sheets`, `sheets_delivery` y
  `sheets_pending`, migración 0022): si una falla, las otras no se repiten. «Usuarios» va por su
  propia cola en la tabla `customer_profiles` (migración 0023), con reintentos y una reserva que
  impide que dos escrituras de la misma fila compitan.
- **No es la base de datos ni la autoridad de nada.** Editar o borrar una celda no cambia ningún
  pedido. De la hoja la tienda solo lee la columna A de «Entregas», para encontrar la fila del
  pedido que reescribe; si la borras, la siguiente actualización la vuelve a crear al final.
- Escribe con `valueInputOption=RAW`: ningún texto se interpreta como fórmula. El texto libre
  (nickname, región, evidencia, paquete) que empiece por `=`, `+`, `-` o `@` lleva un apóstrofo
  delante: así tampoco se ejecuta si exportas la hoja a CSV y la abres en Excel (inyección CSV).
- Agrega filas con `insertDataOption=OVERWRITE`: escribe en la primera fila vacía y **no inserta
  filas**. Con `INSERT_ROWS` (lo que hacía antes del 2026-10-20) Google desplazaba los rangos de
  las fórmulas («Pedidos!B2:B» pasaba a «B7:B») y «Resumen», «Por entregar» y «Reporte diario»
  dejaban fuera todos los pedidos. Se encontró probando con una copia de la hoja real.
- Va por la cola de avisos:
  - si Google falla, el pedido y el pago siguen igual;
  - la fila se reintenta (1, 5, 15 y 60 min);
  - tras 5 intentos queda como «Aviso sin enviar» en el panel;
  - si Google responde **429** (cuota de escrituras por minuto agotada), la fila vuelve a la
    cola en 1 a 3 min **sin gastar un intento**: un pico de ventas nunca la deja fallida;
  - las filas de la hoja salen de a una y en orden; una pasada se corta a los 40 s y lo que
    falta sale en la siguiente (nunca se envía dos veces la misma fila).
- Las peticiones (pago, «Ya transferí», acciones del panel) esperan como mucho
  `NOTIFY_INLINE_WAIT_MS` (300 ms) a la hoja y al correo; lo demás sigue en segundo plano.
- Reclamar o liberar una entrega no reescribe la fila (no cambia nada visible): ahorra cuota.
- **Capacidad:** Google permite unas 60 escrituras por minuto por cuenta de servicio. Un pedido
  pagado y marcado ENVIADO usa unas 5 (pago: 2; iniciar: 1; ENVIADO: 2). La hoja va al día hasta
  unos 12 pedidos por minuto; por encima, se atrasa y se pone al día sola, sin perder filas. La
  tienda y el panel no se frenan por eso. **NO VERIFICADO:** si Google sube esa cuota a pedido.
- La compra **no depende** de Google: la fila se escribe después de confirmar el pago.
- **Duplicados:** en «Pedidos», cada evento se escribe una vez por pedido; si Google tardara en
  responder y se reintentara, la columna «Id del registro» permite detectar la fila repetida. En
  «Entregas» hay una sola fila por pedido: la cola nunca envía dos actualizaciones del mismo
  pedido a la vez y la última siempre lleva el estado más reciente (`order_sheet_sync`,
  migración 0020).

## Prueba con una copia de la hoja (2026-10-20)

Pedido del dueño: probar la sincronización en tiempo real **en una copia**, nunca en la hoja
original. Se hizo así:

1. Copia privada de la hoja en el Drive del dueño (sin la cuenta de servicio: producción no
   puede escribir en ella), con solo datos ficticios.
2. La tienda local recorrió 6 pedidos ficticios: 3 por Mercado Pago (uno con webhook repetido) y
   3 por Nequi; entregas, una fallida y reanudada, un aviso rechazado, una devolución y una caída
   simulada de Google. Cada escritura que la tienda le hace a Google se reprodujo en la copia, en
   orden y por fases.
3. Resultado: «Resumen», «Por entregar», «Reporte diario» y «Compras_LootBar» cuadran con la base
   en cada fase (5 pagados, 3 ENVIADO, 1 reembolsado, 1 por entregar; neto $15.200; 0 filas
   repetidas). Mientras Google estuvo «caído», «Pedidos» mostró una entrega de menos hasta el
   reintento: es el comportamiento esperado.
4. Fallo encontrado y corregido: `INSERT_ROWS` desplazaba las fórmulas (ver arriba).

Mejoras probadas en la copia que conviene pasar a la hoja original (**requieren tu
autorización**; no se tocó el original):

- Archivo → Configuración → Cálculo → «Al cambiar y cada minuto»: «Esperando (min)» de «Por
  entregar» avanza aunque nadie edite (ahora solo se recalcula con cada cambio).
- Textos de «Por entregar» (A2) y «Léeme» (A6 y A14) con Nequi y «ENVIADO».

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

Lo único que solo puede hacer el dueño es crear la llave (nunca pasa por el chat ni por el
repositorio). El id de la hoja ya está cargado en Render (`GOOGLE_SHEETS_SPREADSHEET_ID`) y la hoja
ya está compartida con la cuenta de servicio `tienda-hoja` como Editor.

1. En [Google Cloud → IAM y administración → Cuentas de servicio](https://console.cloud.google.com/iam-admin/serviceaccounts)
   (proyecto **taygamestores**), abre **tienda-hoja** → pestaña **Claves**:
   - **borra todas las claves** que haya (las que pasaron por el chat ya no son seguras);
   - **Agregar clave → Crear clave nueva → JSON → Crear**: se descarga un archivo `.json`.
2. Abre ese archivo con el Bloc de notas (o cualquier editor), selecciona **todo** y cópialo.
3. En Render → servicio de la tienda → **Environment** → **Add Environment Variable**:
   - clave: `GOOGLE_SHEETS_CREDENTIALS_JSON`;
   - valor: pega el contenido completo del archivo;
   - **Save, rebuild and deploy**.
4. Borra el archivo `.json` de tu computador (y de la papelera).
5. Al reiniciar, el registro de arranque dice `hojaGoogle: true` y «hoja de Google conectada» con la
   cuenta `tienda-hoja@…`. Si algo falta o está mal, dice «Hoja de Google apagada» y el motivo
   (sin mostrar valores); la tienda y los pagos siguen funcionando igual.

Otras formas que también valen: `GOOGLE_SHEETS_CLIENT_EMAIL` + `GOOGLE_SHEETS_PRIVATE_KEY` (el
campo `private_key` del JSON, con los saltos de línea escritos como `\n`), y opcionalmente
`GOOGLE_SHEETS_TAB`, `GOOGLE_SHEETS_DELIVERY_TAB`, `GOOGLE_SHEETS_PENDING_TAB` y
`GOOGLE_SHEETS_USERS_TAB` si las pestañas no se llaman «Pedidos», «Entregas», «Pagos pendientes» y
«Usuarios».

Una variable de la hoja incompleta o mal escrita **nunca impide arrancar la tienda** (desde el
2026-10-21; antes el servidor no arrancaba): la hoja queda apagada y el arranque explica qué falta.

Cambiar variables de Render es un cambio en producción: requiere la autorización del dueño.

## Riesgos

- Quien tenga acceso a la hoja ve referencias, paquetes y totales; en «Entregas», el ID,
  nickname, servidor y región de cada jugador, y en «Pagos pendientes», los 4 últimos dígitos y
  la referencia de pago que avisó cada cliente Nequi (datos personales de tus clientes). Compártela
  solo con la cuenta de servicio y contigo; nunca con enlace. La política de privacidad
  (`privacidad.html`, punto 4) lo informa.
- La llave de la cuenta de servicio solo puede editar las hojas compartidas con su correo.
  Si se filtra, bórrala en Google Cloud y crea otra.
- Apagarlo: borra las variables en Render. Los pedidos no se ven afectados.
