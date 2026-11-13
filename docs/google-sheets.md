# Registro auxiliar en Google Sheets (opcional)

**Estado (2026-10-29): conectada y recibiendo pedidos reales en producción** desde las 14:39 UTC
(09:39 en Colombia).

- El dueño cargó la llave de `tienda-hoja` en Render (`GOOGLE_SHEETS_CREDENTIALS_JSON`) y desplegó
  (`dep-dbhlkp6c6qcc73foejm0`, commit `52978e4`). El arranque dice `hojaGoogle: true` y «hoja de
  Google conectada» con la cuenta `tienda-hoja@…`.
- La puesta al día escribió las 6 filas que faltaban en «Pagos pendientes» (`filasNuevas: 6`,
  `filasReintentadas: 0`) y la pestaña «Usuarios» quedó con los 64 perfiles, todos sin error.
- Prueba con un pedido real: un pedido Nequi creado a las 14:51:03 UTC tuvo su fila en «Pagos
  pendientes» a las 14:51:04 UTC (1,5 s). «Hoy» lo contó al momento (última fila: 0 minutos).
- La hoja real («TayGameStore · Registro de pedidos», en el Drive del dueño) sigue compartida solo
  con el dueño y con la cuenta de servicio `tienda-hoja` (Editor), sin enlace público.
- La hoja también calcula sola lo que el dueño debe hacer y sus reportes: pestañas «Hoy», «Por
  verificar» y «Reporte mensual» (ver «Pestañas calculadas para el dueño»).
- Si un día el arranque dice «Hoja de Google apagada», la llave se borró o cambió: repetir «Cómo
  activarlo». La tienda y los pagos siguen funcionando igual sin la hoja.

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
  Sheets. La hoja real está en «Al cambiar y cada minuto» desde el 2026-10-29 (autorizado por el
  dueño), así que avanzan solas aunque nadie la edite.

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

## Pestaña «Pedidos en vivo» (2026-11-03)

Pedido del dueño (2026-11-03): «que en el Excel se actualicen los datos en tiempo real de inmediato
que un cliente o usuario realice un pedido». Antes, un pedido de Mercado Pago solo llegaba a la
hoja al pagarse (a «Entregas»), y uno de Nequi al elegir Nequi (a «Pagos pendientes»): los pedidos
sin pagar o que vencían en Mercado Pago nunca se veían. El dueño eligió una pestaña nueva.

- **Una fila por pedido, de cualquier método de pago, desde que el cliente lo crea**, que se
  reescribe (misma fila, buscada por la referencia de la columna A) con cada cambio: ID
  verificado, cliente que confirma su ID, método elegido o cambiado, pago iniciado en Mercado
  Pago, aviso de transferencia Nequi, pago confirmado, entrega, revisión, reembolso o
  vencimiento.
- **Sin datos personales**: ni correo, ni nombre, ni ID ni nickname del jugador, ni datos de la
  transferencia (esos siguen en «Entregas» y «Pagos pendientes», con su aviso).
- 11 columnas (A–K): Referencia · Pedido creado (Colombia) · Estado · Método de pago · Paquete ·
  Total · Estado del pago · Estado de la recarga · Comprobante · Vence (Colombia) · Actualizado
  (Colombia).
- Columna «Estado» (con color por estado): «🔎 Verificando el ID del jugador», «👤 ID verificado:
  falta que el cliente lo acepte», «🛒 Eligiendo cómo pagar», «⏳ Esperando el pago en Mercado
  Pago», los de Nequi de «Pagos pendientes» («⏳ Esperando la transferencia», «💰 El cliente avisó
  que pagó…»), y desde el pago los de «Entregas» («⏳ Por entregar», «🔄 En proceso», «✅ Entregado
  con éxito», …), «⌛ Venció sin pago», «✖️ Cerrado: el ID no se confirmó».
- **Cuándo se escribe**:
  - al crear el pedido, sin que la respuesta al cliente espere a Google (sale en segundo plano
    enseguida; en la práctica, 1 a 2 segundos);
  - en cada cambio, dentro de la misma transacción que el cambio (cola `notifications`, canal
    `sheets_live`), igual que las otras pestañas;
  - **red de seguridad** en cada pasada de la tarea de avisos (cada minuto con la tienda
    despierta): una sola consulta crea la fila que falte (al publicar, todos los pedidos que ya
    existen, en el orden en que se crearon) y vuelve a encolar la de cada pedido que cambió
    después de su último envío (el pedido, sus pagos, su entrega o sus transferencias Nequi), por
    ejemplo un pago rechazado por Mercado Pago que no cambia el pedido.
- La hora del envío se guarda como la de la reserva de la fila, antes de leer el pedido: así un
  cambio que llegue mientras se escribe siempre queda «más nuevo» y la red de seguridad lo
  recoge.
- Variable opcional: `GOOGLE_SHEETS_LIVE_TAB` (por defecto «Pedidos en vivo»), distinta de las
  otras pestañas.
- Pestaña creada en la copia de prueba y luego en la hoja real (2026-11-03), después de un
  respaldo («Respaldo 2026-11-03 · … (antes de «Pedidos en vivo»)»): encabezados A1:K1, fila 1
  fija, franjas, total en pesos, comprobante como texto, colores por estado y protección «solo
  aviso». No tenía columnas del dueño hasta el menú «Estado (tú)» (abajo).

### Menú «Estado (tú)» (2026-11-12)

Pedido del dueño (2026-11-12): «En el excel que está conectado quiero que implemente un interruptor
para cambiar el estado del pedido», con «los 4 tipos de estados de pedido; si no lo he cambiado,
los que no he verificado se ponen en pendiente», en «Pedidos en vivo» para todos los pedidos.

- **Columnas nuevas** (la tienda escribe A–M; el dueño, L y N):
  - **L «Estado (tú)»**: menú con Pendiente · Pago verificado · En proceso · Envío exitoso. La
    tienda escribe en L el estado actual del pedido en cada cambio; el dueño lo cambia eligiendo
    otro.
  - **M «Control (no tocar)»** (oculta): la tienda escribe aquí el mismo estado que en L. Si L es
    distinta de M, el dueño cambió el menú y eso es una orden.
  - **N «Referencia Nequi (tú)»**: la referencia del movimiento que el dueño ve en su app Nequi.
  - **O «Respuesta de la tienda»**: ✔️ si se aplicó o ✖️ con el motivo.
- **Estado del menú según el pedido**: verificando el ID o esperando el pago → Pendiente; pagado
  → Pago verificado; en entrega → En proceso; entregado → Envío exitoso. Los vencidos, rechazados,
  en revisión o reembolsados quedan con L vacía (se gestionan en el panel).
- **Qué hace cada opción** (cada 30 s, misma tarea que las casillas de «Entregas» y «Pagos
  pendientes», como el dueño y con `via: google_sheet` en la auditoría):
  - **Pago verificado**: solo pedidos Nequi y con la referencia en N; confirma la transferencia
    igual que la casilla de «Pagos pendientes» (comprobante incluido). Si el pedido ya había
    vencido, el pago queda registrado y el pedido en revisión, y la respuesta lo dice. Mercado Pago
    nunca se marca pagado desde la hoja: lo confirma Mercado Pago.
  - **En proceso** y **Envío exitoso**: igual que «Entregas» (manual). Si el pedido Nequi aún no
    está pagado, primero exige la referencia en N y lo confirma, y luego avanza.
  - **Pendiente**: no deshace un pago ni reabre un pedido vencido, cerrado o en revisión; en esos
    casos responde ✖️ y remite al panel.
- Al aplicar, la tienda escribe L y M con el estado resultante y responde en O; si el dueño cambió
  L otra vez mientras tanto, solo escribe O y su nuevo cambio se aplica en la siguiente pasada.
- **Filas anteriores**: los pedidos que ya estaban en la pestaña tienen L y M vacías hasta su
  próximo cambio. Elegir un estado en una de esas filas funciona igual (L distinta de M vacía).
- Configuración de la hoja (primero en una copia con datos ficticios, «DEMO menú «Estado (tú)»
  (copia, datos ficticios) · …», 2026-11-12; en la hoja real el 2026-11-13, después del respaldo
  «Respaldo 2026-11-13 · … (antes del menú «Estado (tú)»)»): columnas L–O añadidas, encabezados con
  nota, validación estricta de lista en L2:L1000, M oculta, N con formato de texto (conserva ceros
  a la izquierda) y protección «solo aviso» de la pestaña con L y N libres.

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

**Estado comprobado (2026-10-29): Make no está conectado ni automatiza nada con la tienda.**

- El arranque de producción de las 13:26:53 UTC dice `eventosExternos: false`: la tienda no envía
  pedidos a ningún servicio externo (ni Make, ni n8n, ni Zapier). Esos eventos se apagaron con
  `EVENTS_WEBHOOK_ENABLED=false` (ver `docs/automatizacion.md`).
- El código no tiene integración propia con Make; solo el webhook genérico de eventos.
- La hoja está compartida solo con el dueño y con `tienda-hoja`.
- En esta sesión no hay conector de Make, así que lo que haya en una cuenta de Make del dueño
  queda NO VERIFICADO. Aunque existiera un escenario, la tienda no le envía nada.
- Los reportes y alertas que se pedían a Make los hacen ahora las fórmulas de la hoja (ver
  «Pestañas calculadas para el dueño»).

## Qué hace y qué no

- Escribe en **cinco pestañas** de la misma hoja («Usuarios» y «Pedidos en vivo» tienen su
  propia sección):
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
    17. Método y operación de pago: proveedor y número, p. ej. «Mercado Pago · 123…» o «Nequi
        (transferencia) · referencia del movimiento»
    18. Evidencia o motivo (de la entrega, el fallo o la revisión)
    19. Actualizado (Colombia)
  - **columnas del dueño T (casilla «✓ Enviado»), U (nota) y V (respuesta)** (ver «Confirmar un
    pago y marcar un envío desde la hoja»): la tienda nunca las reescribe al actualizar la fila
    (solo escribe A–S).
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
    del dueño (en el panel o con su casilla de esta pestaña), después de ver el dinero en su app
    Nequi;
  - 20 columnas, en este orden:
    1. Referencia
    2. Estado del pago
    3. Método de pago: «Nequi (transferencia)» (un pedido Nequi nunca pasa a Mercado Pago; los de
       Mercado Pago van a «Entregas» al pagarse, con su método en «Método y operación de pago»)
    4. Estado del comprobante: «Sin enviar», «🔎 Por verificar» (sale solo cuando el cliente
       pulsa «Ya transferí»), «✅ Verificado» o «✖️ Rechazado» (según lo que hace el dueño en el
       panel)
    5. Total a recibir
    6. Paquete
    7. Pedido creado (Colombia)
    8. Vence (Colombia) (vacía cuando ya no espera pago)
    9. Cliente avisó el pago (Colombia)
    10. 4 últimos dígitos de la cuenta que pagó (lo que escribió el cliente; como texto)
    11. Referencia del comprobante (cliente) (la que escribió el cliente, si la dio)
    12. Confirmado (Colombia)
    13. Referencia Nequi confirmada (la que escribió el dueño al confirmar)
    14. Motivo del rechazo (el que escribió el dueño)
    15. Actualizado (Colombia)
    16. ID del jugador
    17. Nickname confirmado
    18. Confirmación del jugador (mismas frases que en «Entregas»)
    19. Servidor elegido
    20. Región detectada
  - pedidos del dueño del 2026-10-29: las columnas 16–20 (a quién se recarga) y las 3–4 (método
    y estado del comprobante). Las 3–4 se insertaron en la hoja con «Insertar columnas», así
    Google movió solo las referencias de «Hoy»; la fórmula de «Por verificar» se reescribió;
  - **columnas del dueño U (casilla «✓ Pago verificado»), V (referencia Nequi del movimiento) y W
    (respuesta)** (2026-11-02, ver «Confirmar un pago y marcar un envío desde la hoja»): la tienda
    nunca las reescribe al actualizar la fila (solo escribe A–T);
  - lleva los 4 últimos dígitos y la referencia que dio el cliente (datos de pago de tus
    clientes) y los datos del jugador: nunca su correo, nombre, celular completo ni PIN.
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
- Busca la tabla solo en las columnas de la tienda (`A:<última columna de la fila>`, p. ej.
  `'Pagos pendientes'!A:T`), nunca en toda la pestaña. Incidente del 2026-11-02: la validación de
  casilla de U2:U1000 dejaba esas celdas en FALSO, Google tomó la pestaña entera como tabla y la
  fila nueva cayó en la fila 1001. Se corrigió la casilla (forma de un solo valor, que deja vacías
  las celdas sin marcar) y, desde el 2026-11-03, el rango acotado evita que vuelva a pasar con
  cualquier columna del dueño.
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

Mejoras probadas en la copia y pasadas a la hoja original el 2026-10-29, con autorización del
dueño («tienes el permiso total»):

- Archivo → Configuración → Cálculo → «Al cambiar y cada minuto»: «Esperando (min)» de «Por
  entregar» avanza aunque nadie edite.
- Textos de «Por entregar» (A2) y «Léeme» (A6 y A16; en la copia es A14) con Nequi y «ENVIADO».
- Se aplicaron en un solo lote atado a la revisión leída (si la hoja hubiera cambiado entretanto,
  Google lo rechazaba entero) y se comprobaron leyéndolos de nuevo. El historial de versiones de
  Google guarda el estado anterior.

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

## Pestañas calculadas para el dueño: «Hoy», «Por verificar» y «Reporte mensual» (2026-10-29)

Pedido del dueño: «implementa fórmulas para que yo solo analice, verifique y confirme; que todos
los informes y pedidos se automaticen al instante». Son fórmulas puras de Google Sheets que leen
lo que escribe la tienda; la tienda no las lee ni las escribe, y no cambian ningún pedido.

Orden de las pestañas (el de uso): «Hoy», «Por verificar», «Por entregar», «Resumen», «Pagos
pendientes», «Usuarios», «Entregas», «Reporte diario», «Reporte mensual», «Pedidos», «Léeme» y
«Compras_LootBar». La tienda encuentra sus pestañas por el nombre, así que el orden no la afecta.

- **«Hoy»** (centro de control):
  - Estado en una línea: «✅ Todo al día» o «⚠️ Tienes N cosas por atender», con la hora del
    cálculo.
  - «Qué hacer ahora»: pagos Nequi por verificar, recargas por entregar, pedidos en revisión y
    compras de LootBar con aviso. Cada uno con cuántos son, los minutos del más antiguo (en rojo
    a partir de 15) y dónde se resuelve. «Entregas sin compra de LootBar anotada» es
    informativo y no suma a los pendientes.
  - «Ventas y entregas» para hoy, los últimos 7 días, el mes y desde el inicio: pagos, ventas,
    reembolsado, neto, compras en LootBar, ganancia de caja (neto menos compras del periodo),
    margen, ticket promedio, Nequi frente a Mercado Pago, entregas con éxito, entrega promedio y
    porcentaje entregado en 15 minutos o menos. Pagos y ventas por día del pago; entregas, por
    día de entrega; compras, por fecha de compra.
  - «Conexión con la tienda»: última fila que escribió la tienda (en cualquier pestaña), minutos
    desde entonces, filas por pestaña y filas repetidas. Mientras falte la llave dice «Todavía
    ninguna».
- **«Por verificar»**: los pagos Nequi en «El cliente avisó que pagó» o «Venció con un aviso sin
  verificar», el más antiguo primero. Muestra los minutos de espera, el total, el paquete, los 4
  últimos dígitos, la referencia del comprobante y el vencimiento. El aviso nunca es un pago: se
  confirma en el panel después de verlo en la app Nequi.
- **«Reporte mensual»**: un mes por fila, el más reciente arriba, con las mismas cifras que «Hoy»
  más la ganancia y el margen del mes (rojo si la ganancia es negativa).

Cómo se hizo y cómo se comprobó:

1. **Copia de prueba** («PRUEBA (copia, datos ficticios)»): se añadieron filas ficticias de hoy y
   se compararon todas las cifras con el cálculo a mano.
   - Hoy: 2 pagos, $13.300, $7.000 de compras, $6.300 de ganancia (47 %).
   - Mes: 7 pagos, $32.300 de ventas, $3.800 reembolsado, $28.500 neto, $12.900 de compras y
     $15.600 de ganancia (55 %). 3 pagos con Nequi y 4 con Mercado Pago.
   - Pendientes: 2 por verificar, 2 por entregar y 1 aviso de LootBar, en el orden correcto.
2. **Hoja real**:
   - copia de seguridad completa en el mismo Drive, solo con acceso del dueño;
   - el mismo lote atado a la revisión leída;
   - lectura de vuelta.
   Sin filas todavía, todo sale en 0 o «—», «✅ Todo al día», «Nada por verificar», «Sin datos aún»
   y «Todavía ninguna», sin errores.
3. Las pestañas nuevas tienen protección con aviso (como las demás calculadas). La hoja sigue
   compartida solo con el dueño y con `tienda-hoja`, sin enlace público. «Por verificar» muestra
   los mismos 4 últimos dígitos que ya había en «Pagos pendientes»: no agrega datos nuevos.
4. «Léeme» explica las pestañas nuevas, agrega que «Por verificar» tiene los 4 últimos dígitos y
   pide no renombrar ninguna de las cuatro pestañas que escribe la tienda.

## Cómo activarlo (dueño)

Lo único que solo puede hacer el dueño es crear la llave (nunca pasa por el chat ni por el
repositorio). Hecho el 2026-10-29; estos pasos sirven si algún día hay que cambiarla. El id de la
hoja ya está cargado en Render (`GOOGLE_SHEETS_SPREADSHEET_ID`) y la hoja ya está compartida con la
cuenta de servicio `tienda-hoja` como Editor.

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
`GOOGLE_SHEETS_TAB`, `GOOGLE_SHEETS_DELIVERY_TAB`, `GOOGLE_SHEETS_PENDING_TAB`,
`GOOGLE_SHEETS_USERS_TAB` y `GOOGLE_SHEETS_LIVE_TAB` si las pestañas no se llaman «Pedidos»,
«Entregas», «Pagos pendientes», «Usuarios» y «Pedidos en vivo».

Una variable de la hoja incompleta o mal escrita **nunca impide arrancar la tienda** (desde el
2026-10-21; antes el servidor no arrancaba): la hoja queda apagada y el arranque explica qué falta.

Cambiar variables de Render es un cambio en producción: requiere la autorización del dueño.

## Confirmar un pago y marcar un envío desde la hoja (casillas)

Pedidos del dueño: «un apartado para cambiar el estado de completado el pedido y que en mi tienda
el estado esté conectado; no de decoración» (2026-10-29) y «que solo yo seleccione una palomita…
se pase para verificar el pago y el envío del pedido, y luego que la factura o el comprobante
arroje la información del pedido o el estado» (2026-10-29). Elección del dueño: **casilla +
referencia** para el pago y **casilla ✓ Enviado** para la entrega. Desde el 2026-11-02 las
columnas del dueño son casillas (validación «casilla» estricta: no aceptan texto).

> **Casilla «de un solo valor» (obligatorio):** la validación es `BOOLEAN` con un único valor
> `TRUE` (marcada = TRUE, desmarcada = **vacía**). Con la casilla normal (sin valores) cada celda
> vacía vale FALSE, Google toma esas columnas como parte de la tabla y `appendRow` (rango `A1`)
> escribe los pedidos nuevos debajo de la fila 1000. Pasó el 2026-11-02 con un pedido real; ver el
> registro de auditoría.

**«Pagos pendientes» (pago Nequi), columnas U, V y W:**

- **U «✓ Pago verificado (tú)»**: casilla. El dueño la marca solo después de ver en su app Nequi
  el total exacto del pedido.
- **V «Referencia Nequi (tú)»** (formato texto): la referencia del movimiento que ve en Nequi,
  4 a 40 letras, números o guiones (la misma regla del panel). **Sin referencia no confirma.**
- **W «Respuesta de la tienda»**: «✔️ Pago confirmado · Comprobante N.º 000012 · ya está en
  «Entregas»», «✔️ Ya estaba pagado…», «✔️ Pago registrado, pero el pedido ya había vencido:
  quedó en revisión…» o «✖️ No se confirmó: motivo» (sin casilla, sin referencia válida, sin
  pedido, referencia ya usada, pedido que no es Nequi…). Al responder la tienda vacía U y V.
- La tienda llama a `confirmNequiTransfer` con el **total exacto del pedido** (el dueño no escribe
  montos), la referencia de V y la cuenta de administrador del dueño: las mismas reglas que el
  botón Confirmar del panel (referencia única, pedido Nequi, pedido vencido → revisión, emisión
  del comprobante numerado, aviso al cliente, fila nueva en «Entregas»). El comprobante y el
  seguimiento del cliente muestran «Pagado» solos. **Rechazar** un aviso sigue siendo solo del
  panel.

**«Entregas» (envío), columnas T, U y V:**

- **T «✓ Enviado (tú)»**: casilla. Marcada = «Entregado». «En proceso» y «No se pudo entregar»
  se marcan en el panel (el servidor aún entiende esos textos, pero la casilla no los admite).
- **U «Nota del cambio (tú)»** (opcional): evidencia de la entrega (p. ej. el número de la
  compra en LootBar). Vacía, la tienda pone «Entregado (marcado por el dueño en la hoja de
  Google)».
- **V «Respuesta de la tienda»**: «✔️ Aplicado: Entregado · 2026-10-29 10:15», «✔️ Ya
  estaba: …» o «✖️ No se aplicó: motivo · hora». Al responder, la tienda vacía T y U (si el
  dueño ya cambió T, la deja para la próxima pasada).

Cómo funciona (`src/server/services/sheet-commands.ts`, `readCommands`/`finishCommand` en
`src/server/integrations/sheets/google-sheets.ts`):

- Cada **30 segundos** la tienda lee T2:U de «Entregas», U2:V de «Pagos pendientes» y L2:N de
  «Pedidos en vivo» con `valueRenderOption=UNFORMATTED_VALUE` (una casilla marcada llega como
  `true`, sin depender del idioma de la hoja). Solo si hay algo marcado o escrito (en «Pedidos en
  vivo», un menú L distinto de su control M) lee las referencias de la columna A y usa la base de
  datos: el modo reposo de Neon no cambia.
- La entrega se aplica con **las mismas reglas y el mismo historial que el panel**
  (`fulfillmentAction`): tomar → iniciar → entregar, recalculando el siguiente paso con el estado
  real (repetir la orden no hace nada más). El pedido pasa a ENTREGADO, el cliente ve «¡Envío
  exitoso!», sale el aviso de entrega (si hay correo) y la columna B se actualiza en 1–2 s.
- **Nunca**: entrega un pedido sin pago confirmado, deshace una entrega, salta una revisión, toca
  una recarga automática (UniPin), confirma un pago sin referencia ni con un monto distinto del
  total, ni confirma pagos de Mercado Pago (los confirma solo Mercado Pago).
- Quien actúa es la cuenta de administrador del dueño (primer correo de `ADMIN_EMAILS`); cada
  evento del historial lleva `via: google_sheet`. Si esa cuenta no existe en la base, responde
  «entra una vez al panel con tu cuenta de dueño».
- Las protecciones con aviso dejan libres T2:U1000 de «Entregas», U2:V1000 de «Pagos
  pendientes» y L2:L1000 y N2:N1000 de «Pedidos en vivo»; el resto de cada pestaña sigue protegido
  con aviso.
- Si Google falla, avisa en el registro (`sheet_commands_failed`, como mucho cada 10 minutos) y lo
  intenta de nuevo en la siguiente pasada. Si falla la base de datos, la orden queda escrita y se
  reintenta.
- Con Render dormido (plan gratuito) no corre: se aplica cuando la tienda despierta.

## Riesgos

- Quien tenga acceso a la hoja ve referencias, paquetes y totales; en «Entregas» y «Pagos
  pendientes», el ID, nickname, servidor y región de cada jugador, y en «Pagos pendientes», los 4
  últimos dígitos y la referencia de pago que avisó cada cliente Nequi (datos personales de tus
  clientes). Compártela solo con la cuenta de servicio y contigo; nunca con enlace. La política de
  privacidad (`privacidad.html`, punto 4) lo informa.
- **Quien pueda editar la hoja puede marcar entregas y confirmar pagos Nequi a nombre del
  dueño** (columnas T–U de «Entregas» y U–V de «Pagos pendientes»). La confirmación desde la hoja
  **no pasa por el segundo paso del panel** (TOTP/llave): la protege solo el acceso de edición a
  la hoja. El dueño lo eligió así el 2026-10-29 («Casilla + referencia»). Límites: exige una
  referencia de movimiento válida y única, confirma siempre el total exacto del pedido, solo
  pedidos Nequi, nunca entrega sin pago ni deshace nada, y todo queda en el historial con
  `via: google_sheet`. Por eso la hoja es solo del dueño y de `tienda-hoja`, nunca con enlace.
  Para volver a exigir el panel basta con borrar la variable de la hoja en Render o quitar las
  casillas.
- La llave de la cuenta de servicio solo puede editar las hojas compartidas con su correo.
  Si se filtra, bórrala en Google Cloud y crea otra.
- Apagarlo: borra las variables en Render. Los pedidos no se ven afectados.
