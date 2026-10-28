# Cambios

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versiones:
[SemVer](https://semver.org/lang/es/).

## [Sin publicar]

### Carrito más grande, logotipos oficiales en el acceso e íconos de juegos (2026-10-28)

- **Carrito:**
  - El ícono y el botón son más grandes: 27 px y 48 px en el celular, 24 px y 44 px en el PC.
  - El contador queda entero dentro del botón; antes el borde lo cortaba.
  - La búsqueda y la cuenta crecen a la misma altura para que la cabecera quede pareja.
  - En teléfonos de 380 px o menos, los botones miden 44 px para que la fila quepa.
- **Acceso:** los botones de Google y Facebook muestran los logotipos oficiales de cada marca en
  lugar de las letras «G» y «f». Solo cambia el ícono; el flujo de acceso es el mismo.
- **Juegos:** cada juego tiene un ícono propio con sus colores en lugar de letras sueltas: llama
  con diamante (Free Fire), bloque (Roblox), caja con paracaídas (PUBG Mobile) y escudo con espada
  (Mobile Legends). No son sus logotipos; los términos siguen diciendo que la tienda no los usa.

### Presentación, bienvenida y transiciones también en celulares (2026-10-28)

- **Con «reducir movimiento»** (en muchos celulares: «Quitar animaciones» o «Reducir
  movimiento»), la tienda ya no apaga todo el inicio: muestra una **versión suave** con la misma
  presentación (Tay, el logotipo, el lema y la barra con la carga real), la bienvenida y la
  transición «Abriendo TayGameStore…» al pulsar «Entrar», solo con fundidos (sin piezas que
  vuelan, sin diamante que crece y sin zoom). Antes, en esos teléfonos no se veía nada.
- **Con el dedo:** al tocar o arrastrar sobre la vitrina de paquetes, Tay mira hacia el dedo, la
  vitrina se inclina y salen destellos de diamante; al soltar, todo vuelve al centro. En la
  presentación, Tay también se inclina hacia el dedo. Antes estos efectos solo respondían al
  ratón. El botón «Entrar» ya no se mueve bajo el dedo (el efecto magnético queda para ratón).
- Respuesta al toque en un celular simulado con la CPU 4 veces más lenta: 80–96 ms (bueno: menos
  de 200 ms). Las variables de inclinación se aplican solo a lo que se inclina, no a toda la
  bienvenida.
- La presentación sigue saliendo una vez por pestaña; en una pestaña nueva se ve otra vez.

### Panel «LIVE STORE» compacto y cómodo en el celular (2026-10-28)

- Menos texto, lo esencial intacto: estado y hora de la última comprobación, título, **«Desde
  $ 3.800»** resaltado junto a los medios de pago (o al aviso de modo prueba), y las barras de
  catálogo, verificación, pagos y entrega con un valor corto. Sin notas debajo de cada barra. La
  entrega muestra el plazo configurado (`LEGAL_DELIVERY_TIME`, si es corto, p. ej. «24 horas») o,
  si no lo hay, cómo llega la recarga: «A tu ID».
- En el celular la bóveda vuelve a la izquierda del texto, cuadrada y completa (antes se estiraba
  en una franja recortada); el panel pasa de ~700 a ~360 px de alto a 360 px de ancho.
- «Protección de flujo» y «Comprobante digital» como enlaces discretos en una línea, igual que
  en el diseño original.

### Panel «LIVE STORE» con el diseño elegido por el dueño, más claro y funcional (2026-10-28)

- Vuelve el diseño que el dueño prefirió (bóveda, «LIVE STORE», estado de operación y una barra
  por servicio), corregido y con función en cada parte:
  - Ningún texto se monta sobre una barra: las filas comparten tres columnas (etiqueta, barra,
    valor) y la de la etiqueta mide lo que la más larga («VERIFICACIÓN»).
  - Cada barra dice algo: llena si el servicio está activo, a medias si es limitado o cargando,
    casi vacía si no está disponible. Debajo, una nota con el dato útil: cuántos paquetes hay y
    desde qué precio, cómo se verifica el ID, con qué se paga y el plazo de entrega.
  - La etiqueta y el color del panel siguen el estado real («LIVE STORE» en verde, «MODO
    PRUEBA» en ámbar, «PAUSADA» o «SIN CONEXIÓN» en rosa).
  - La hora de arriba es la de la última comprobación con el servidor («Actualizado 08:32
    a. m.»), no un reloj decorativo.
  - «Protección de flujo» abre la explicación de seguridad y «Comprobante digital» lleva al
    verificador de comprobantes.
- Sin animaciones continuas ni inclinación con el puntero: la respuesta al tocar y escribir se
  mantiene (mismas capas de composición y mismos tiempos medidos).

### Respuesta más rápida al tocar y escribir y panel de estado funcional (2026-10-28)

- Panel del inicio («LIVE STORE»): ahora es una lista de estado sin barras ni imagen, que ya no
  monta el texto sobre la barra (pasaba con «VERIFICACIÓN»). Cinco filas con datos del servidor:
  catálogo (cuántos paquetes hay), verificación del ID (al instante o por el equipo), pagos (con
  qué medios), entrega (el plazo de los términos) y soporte (WhatsApp y/o correo), cada una con una
  nota corta de qué significa para el cliente. Etiqueta de estado real («Tienda abierta», «Modo
  prueba», «Compras pausadas»…) en lugar de «LIVE STORE» fijo, y dos accesos: «Consultar mi
  pedido» y «Hablar con soporte». Sin reloj, sin inclinación con el puntero.
- Teclas: el sonido de bienvenida se prepara justo después del toque, no dentro de él, y la
  preferencia de sonido se lee una vez; el procesamiento de cada tecla bajó de ~290 ms a ~0.
- Toques y escritura (medido con la CPU 4× más lenta, mediana de 4 corridas, antes → ahora):
  escribir el ID 264 → 80 ms, el nombre 232 → 88 ms, una tecla en la presentación 216 → 124 ms,
  entrar como invitado 388 → 296 ms, agregar al carrito 348 → 296 ms.
- Quitado lo decorativo que se redibujaba sin parar o retrasaba cada cuadro: las partículas de
  fondo, la aparición animada de las secciones al bajar (entraban desenfocadas durante 1 s), el
  aura que palpitaba en los botones principales y el desenfoque del fondo dentro de la tienda
  (cabecera, botones, burbujas, avisos; ahora con fondos casi opacos). La ventana de acceso y la
  bienvenida no cambian.
- El catálogo solo vuelve a dibujar la tarjeta que cambió (antes rehacía las seis con su arte en
  cada toque) y ya no se fuerza un cálculo de diseño de toda la página al cambiar el carrito o al
  pulsar un botón. Capas de composición: de 113 a 61.

### Transiciones sin cruces con forma de diamante y sonido de bienvenida (2026-10-27)

- Las animaciones ya no se cruzan: cada fase empieza cuando termina la anterior (medido cuadro a
  cuadro y con una prueba automática). Antes, al abrir se veía medio segundo la bienvenida antes
  de la presentación, el logotipo se desvanecía encima del titular y, al pulsar «Entrar», la
  bienvenida se veía a través de la capa y el acceso aparecía mientras Tay aún salía.
- Presentación: Tay se arma, luego el logotipo letra a letra (con un brillo que recorre solo las
  letras), Tay guiña, sale con el logotipo y un diamante con borde de luz se abre desde su centro
  para dejar ver la bienvenida, que entra después.
- «Entrar»: la bienvenida se va, un diamante nace del tamaño del botón y cubre la pantalla,
  «Abriendo TayGameStore…» con su barra, y el diamante se abre sobre la ventana de acceso ya lista
  (la ventana no cambia). Unos 1,5 s en total.
- Los destellos del puntero salen solo sobre la vitrina (ya no cruzan el texto).
- Sonido de bienvenida propio, sintetizado en el navegador (sin archivos ni licencias): un
  destello de cristal de 1,6 s y un sonido corto al «Entrar». Los navegadores no dejan sonar una
  página hasta que el visitante la toca, así que suena con el primer toque (durante la
  presentación espera a que se abra el diamante), una vez por visita. Botón «Activar sonido» /
  «Silenciar» en la presentación y la bienvenida; si se silencia, se recuerda.
- Política de cookies: se informan las claves `tgs_sonido`, `tgs:presentacion` y
  `tgs:bienvenida-sono`.

### Nequi en la vista previa, comprobante para compartir y burbujas de soporte (2026-10-27)

- «Compartir» del comprobante ahora se ve siempre (antes solo aparecía en navegadores que
  comparten archivos, así que en computador no estaba). Se activa con el pedido pagado. En el
  celular abre el menú de compartir con la imagen y un texto con el número, el pedido, el total y
  el código para verificarlo. Donde no hay ese menú, descarga el JPG y ofrece WhatsApp (sin
  número: el cliente elige a quién), correo o «Copiar datos».
- En la columna del comprobante, JPG y PDF van lado a lado y «Compartir» en su propia fila (antes
  se recortaba).
- Vista previa (nunca en producción): Nequi como método de pago con una llave y un titular
  **ficticios**, aviso «Ya transferí» y una revisión del dueño simulada (confirmar, rechazar o
  revisar después). La vista previa ahora emite comprobantes numerados con código de prueba
  («V0-…») que pasan «Verificar comprobante», y muestra las dos burbujas (WhatsApp con un número
  ficticio que no se marca: sale un aviso). En la tienda real, las burbujas salen con los canales
  que configura el servidor y solo dentro de la tienda.

### Inicio animado e interactivo (2026-10-27)

- Mismo recorrido del sitio publicado (abrir → bienvenida → «Entrar» → acceso), ahora con
  presentación: al abrir, Tay se arma faceta a faceta, el logotipo aparece letra a letra y la
  barra avanza con la carga real del catálogo (1,9 a 3,6 s). Se puede saltar (botón, Escape,
  Enter o espacio), sale una vez por sesión y no aparece al volver de pagar ni con un enlace de
  seguimiento.
- La bienvenida entra por partes y reacciona al puntero: la vitrina se inclina, Tay sigue el
  cursor con la mirada, destellos de diamante y botón «Entrar» magnético con brillo.
- Al pulsar «Entrar»: transición corta «Abriendo TayGameStore…» y luego la ventana de acceso,
  que no cambia.
- Con movimiento reducido no hay presentación ni animaciones de entrada; sin JavaScript tampoco.

### Marca propia: tipografía, logo, íconos, bienvenida y comprobante (2026-10-27)

- Tipografía con identidad propia y un solo sistema: Unbounded (títulos, marca, precios y
  totales) e Instrument Sans (texto e interfaz), servidas por la tienda (OFL 1.1, licencias en
  `/fonts`). Escala fluida que crece con la pantalla: el texto que se lee pasa de 12 a 13,5 px
  como mínimo y los rótulos de 11 a 12 px; de unos 28 tamaños distintos a una escala definida.
- Botones en tres alturas (38/46/54 px en escritorio, 42/48/54 px en el celular) con la misma
  forma y texto legible; en el celular la acción principal de cada tarjeta ocupa el ancho.
- Logo de Tay redibujado en alta calidad: emblema facetado con luz y sombra, símbolo
  simplificado que se lee a 16 px (cabecera, favicon), ícono de app y logotipo «TayGameStore» en
  trazos vectoriales (`brand/`, `tools/marca/logotipo.py`). Imagen social, ícono de app y favicon
  regenerados; la imagen social pesa 251 KB para que WhatsApp la muestre.
- Íconos de dos tonos (trazo del color del texto y relleno cian→violeta de la marca).
- Bienvenida nueva: promesa clara, oferta del servidor, botón grande, los 4 pasos de la compra y
  una vitrina con los 6 paquetes y Tay; cantidad y precio solo si el catálogo los trae.
- Comprobante como recibo: banda de marca, datos en celdas, total destacado, código de
  verificación en su propia fila y borde de ticket. El JPG/PDF descargable tiene el mismo diseño.
- Portada sin huecos: el panel de estado muestra la bóveda de diamantes. Páginas legales con la
  misma tipografía.
- La ventana de acceso no cambia: conserva sus fuentes e ícono (captura 02 idéntica en los 3
  tamaños).

### Tienda con acabado profesional (2026-10-27)

- Cada paquete tiene su arte en lugar de los íconos repetidos, y el valor se ve al crecer: 3
  gemas, montón, bolsa, cofre, cofre adornado y bóveda (`src/web/public/art`, WebP de 480 px,
  7–24 KB, carga diferida, sin metadatos). Imágenes generadas para la tienda, sin logos ni
  diamantes del juego; procedencia en el informe legal §4.
- La promoción es un banner con un cofre que se funde con el fondo; el texto y «Ver tarifas»
  quedan a la izquierda.
- Celular: barra de compra fija abajo con lo elegido, el total y «Revisar pedido» (lleva al
  siguiente paso). Se oculta en la bienvenida, en escritorio y con el pedido a la vista; las
  burbujas de soporte y los avisos suben para no taparse.
- La ventana de acceso no cambia (capturas 01 y 02 idénticas; solo se regeneró la 03).
- Vista previa: incluye cookies y reembolsos, y su aviso de «entorno de prueba» sube para no
  tapar la barra de compra.

### Legal y accesibilidad (2026-10-25, `docs/legal/INFORME-CUMPLIMIENTO-2026-10-25.md`)

- Páginas nuevas `cookies.html` (solo cookies técnicas, con nombre, uso y duración) y
  `reembolsos.html` (cancelación, retracto de 5 días hábiles, excepción tras la entrega,
  reversión del pago y cómo pedirlo). Términos y privacidad reescritos según la Ley 1480, el
  Decreto 587 de 2016, la Ley 1581 y el Decreto 1377 (plazos de consultas y reclamos, menores,
  datos fuera de Colombia, encargados). Las 4 con `noindex` y enlazadas desde el pie, con
  «Datos del vendedor». Las páginas nuevas no repiten datos del dueño: enlazan a esa sección.
- La franja de promoción dice hasta cuándo rige, en hora de Colombia (Ley 1480, art. 33).
- Afirmaciones sin respaldo fuera: la cifra fija «24 ms»; «Factura» pasa a «Comprobante» o
  «Pedido» (el comprobante no es factura electrónica de la DIAN, y los términos lo dicen).
- Fuentes servidas por la propia tienda (OFL 1.1, con su licencia): ningún tercero recibe la IP
  del visitante al cargar la página. CSP `font-src 'self'`. Prueba e2e nueva: 0 peticiones a
  otros dominios.
- Accesibilidad (WCAG 2.2 AA, axe con todas las gravedades: 0 avisos): el texto blanco sobre el
  degradado de los botones pasa de 3,4:1 a 4,7:1 como mínimo (contador del carrito y estrella de
  favoritos también); los 9 botones «×» dicen qué cierran; enlaces del pie de 24 px; la tabla de
  cookies se alcanza con teclado; las burbujas de soporte ya no tapan el final del pie.
- La ventana de acceso no cambia (captura 02 idéntica en los 3 tamaños).

### Seguridad (auditoría A–P del 2026-10-25, `docs/seguridad/AUDITORIA-2026-10-25.md`)

- El código de la app autenticadora del panel sirve una sola vez (RFC 6238 §5.2): ni el de la
  activación ni uno ya usado vuelven a abrir el panel dentro de su ventana de 30 s. Columna
  `users.mfa_totp_last_step` (migración 0024, solo agrega).
- Los registros de cada petición ya no guardan la IP del cliente en claro, solo su huella con
  clave (como promete la política de privacidad).
- Escudo anti-abuso: reconoce más sondeos de PHP (`.phtml`, `.phar`, `.phps`, `.inc`,
  `.user.ini`, `/phpinfo`, `%00`, `php://`, `composer.lock`, depuración de Laravel y Symfony).
  La tienda no usa PHP; quien busca esas rutas es un escáner, y con 2 intentos queda bloqueado.
- Dependencias: `fast-uri` 3.1.9 / 4.2.3 e `ip-address` 10.7.4 (avisos moderados en
  dependencias de `fastify` y `@fastify/rate-limit`); `smtp-server` 3.21.1 (solo pruebas).

### Corregido (UI/UX en celular, medido a 360 px)

- En las tarjetas de producto el «+» de la cantidad ya no queda cortado (7 px a 360 px y
  17 px a 320 px con pantalla táctil; 20 px a 320 px con ratón): si no cabe junto a «Agregar»,
  baja a su propia fila con botones de 44 px. Los botones − y + dicen a los lectores de pantalla
  qué paquete cambian. Prueba e2e nueva en 7 tamaños, táctil y ratón.
- El pedido vacío ya no ocupa media pantalla antes del formulario en celular y tableta: muestra
  la cabecera, el total y «Aquí verás tu resumen cuando agregues una recarga».
- Los 4 pasos del inicio se ven en 2 × 2 (antes 3 + 1) y «Opiniones» sin reseñas muestra un
  solo aviso (antes dos seguidos).
- Accesibilidad: axe sin avisos en la tienda (el título del panel «LIVE STORE» sigue el orden de
  títulos y la burbuja de soporte es una región con nombre).

### Cambiado (landing más clara, sin quitar secciones ni animaciones)

- La bienvenida dice qué se compra y cómo: «Escribe tu ID de Free Fire, elige tus diamantes y
  paga en línea», el precio «desde» real del catálogo y los medios de pago activos (del servidor).
- Etiquetas en español claro en vez de jerga técnica en inglés («NEXUS CATALOG», «ORDER DESK»…);
  pasos del inicio en lenguaje del cliente (ID → diamantes → pago → recarga).
- Precios en una sola línea y con cifras del mismo ancho; si no cabe, «Disponible» baja.
- Sistema de tipografía: el texto que se lee (descripciones, ayudas, formularios, pie) pasa de
  11 a 12 px con dos variables (`--fs-2xs` y `--fs-label`); los rótulos en mayúsculas e
  insignias siguen en 11 px.
- Los botones de compra (Agregar, −/+, favoritos, juegos, «Entrar») se hunden un poco al
  presionarlos (sin movimiento si el sistema lo pide) y «¿Dónde encuentro mi ID?» se toca con el
  dedo en toda su fila.
- El acceso (Google y Facebook) queda exactamente como estaba, a pedido del dueño.

### Seguridad (dependencias al día)

- `fastify` 5.12.5 → 5.12.7: incluye la versión de seguridad 5.12.6 (aviso GHSA-389g-gv7q-r4x8).
- `nodemailer` 10.1.0 → 10.1.7: quita credenciales en redirecciones a otro origen y limita el
  trabajo que un mensaje puede provocar.
- `zod` 4.6.5 → 4.6.7: comprueba el tamaño de listas y conjuntos antes de leer sus elementos.
- `@fastify/helmet` 13.2.0 (la tienda no usa opciones de helmet por ruta: sin cambio de
  comportamiento) y parches de desarrollo (`vite`, `vitest`, `prettier`, `typescript-eslint`,
  `@types/node`, `smtp-server`, `@axe-core/playwright`). `@playwright/test` sigue en 1.56.1.

### Agregado (nombre de usuario para cada cliente y pestaña «Usuarios» en la hoja)

- Pedido del dueño (2026-10-21): cada cliente, invitado o con cuenta de Google o Facebook,
  recibe un nombre de usuario al azar (p. ej. «HalconFugaz482») que ve en la cabecera y puede
  cambiar en «Cuenta → Cambiar nombre de usuario». El invitado lo conserva en su navegador. La
  cabecera ya no muestra el nombre real de la cuenta.
- Reglas: 3 a 20 caracteres (letras sin tildes, números o `_`), único sin distinguir mayúsculas,
  sin números largos (celular o documento) y sin nombres que suplanten a la tienda (admin,
  TayGameStore, soporte, Nequi…, también con números); solo el dueño puede usarlos. Tope de 20
  perfiles de invitado nuevos por conexión al día y límites por IP.
- Pestaña «Usuarios» de la hoja de Google (`GOOGLE_SHEETS_USERS_TAB`): una fila por cliente con
  código fijo, nombre de usuario, tipo (invitado o cuenta y su proveedor) y fechas. Nunca correo,
  nombre real, IP ni cookie. Tabla `customer_profiles` (migración 0023) con su propia cola de
  escritura, reintentos y una reserva para que un cambio de nombre a mitad de escritura no deje
  la hoja con el nombre viejo.
- El invitado ahora abre el menú de cuenta (con «Iniciar sesión» a un clic) en lugar del acceso.
- Política de privacidad: explica el nombre de usuario y la pestaña «Usuarios».

### Cambiado (hoja de Google más fácil de conectar y sin riesgo para la tienda)

- La llave de la cuenta de servicio se puede cargar como el archivo JSON completo en una sola
  variable (`GOOGLE_SHEETS_CREDENTIALS_JSON`): el dueño ya no copia campos sueltos.
- Una variable de la hoja incompleta o mal escrita ya no impide arrancar la tienda: la hoja queda
  apagada y el arranque dice qué falta, sin mostrar valores (como Nequi). Si la hoja está
  conectada, el arranque dice con qué cuenta de servicio.

### Agregado (hoja de Google: pestaña «Pagos pendientes»)

- Pedido del dueño (2026-10-20): ver en la hoja el pago pendiente del cliente hacia el dueño.
  Una fila por pedido **Nequi**, que se actualiza sola al elegir Nequi, al avisar «Ya
  transferí» (con los 4 últimos dígitos de la cuenta y la referencia del comprobante que dio el
  cliente), al confirmar o rechazar el dueño, al devolver y al vencer. El aviso del cliente nunca
  cuenta como pago. Sin correo, nombre ni ID del jugador. Canal propio en la cola
  (`sheets_pending`, migración 0022) y pestaña configurable (`GOOGLE_SHEETS_PENDING_TAB`).

### Corregido (Nequi no se podía encender con una llave @ + celular)

- La validación rechazaba toda llave Bre-B hecha solo de números, también `@` + celular (10
  dígitos que empiezan por 3), que es un formato válido y no puede ser una cédula colombiana (las
  de 10 dígitos empiezan por 1). Ahora se acepta; las demás llaves solo de números se siguen
  rechazando.

### Corregido (hoja de Google: fórmulas que perdían los pedidos)

- La tienda agregaba filas con `insertDataOption=INSERT_ROWS` y Google desplazaba los rangos de
  las fórmulas del dueño («Pedidos!B2:B» → «B7:B»): «Resumen», «Por entregar» y «Reporte diario»
  habrían mostrado 0 con la primera venta. Ahora `OVERWRITE` (escribe en la primera fila vacía,
  sin insertar). Encontrado con una prueba en tiempo real sobre una **copia** de la hoja real con
  datos ficticios; la hoja original no se tocó (aún no está conectada en producción).

### Cambiado (la tienda no se frena con integraciones lentas)

- Pago, webhook, «Ya transferí» y acciones del panel esperan como mucho `NOTIFY_INLINE_WAIT_MS`
  (300 ms) al correo, la hoja y el webhook; lo demás sigue en segundo plano y la cola lo
  reintenta. Medido con hoja y correo de 1,5 s: «Ya transferí» p95 3,7 s → 1,2 s, webhook de pago
  p95 5,0 s → 1,9 s, «Marcar ENVIADO» p95 5,2 s → 1,3 s.
- Cuota de Google (429): la fila vuelve a la cola en 1 a 3 min sin gastar un intento (antes un
  pico de ventas agotaba los 5 intentos y la fila quedaba fallida). Las filas de la hoja salen de
  a una y en orden; una pasada se corta a los 40 s para no superar la reserva de la fila.
- Reclamar o liberar una entrega ya no reescribe la fila de «Entregas» (no cambia nada visible).
- Simulador de carga: clientes que pagan por Nequi (`--nequi`), dueño virtual en el panel
  (`--owner`) y servidor de pruebas con hoja/correo lentos y cuota de Google.

### Seguridad

- Hoja de Google: el texto libre (nickname, región, evidencia, paquete) que empieza por `=`, `+`,
  `-` o `@` lleva un apóstrofo delante, para que no se ejecute como fórmula si la hoja se exporta
  a CSV y se abre en Excel (OWASP: inyección CSV).

### Añadido

- **Nequi con llave Bre-B** (pedido del dueño, 2026-10-20; ver `docs/pagos-nequi.md`):
  - variable nueva `NEQUI_MANUAL_BREB_KEY` (solo llaves alfanuméricas con `@`; una llave solo de
    números se rechaza porque podría ser un documento). Con llave, el celular pasa a ser opcional;
    hace falta al menos uno de los dos;
  - la caja de Nequi muestra el total exacto, la llave (con «Copiar»), el celular si existe, el
    titular y el ID del pedido, y avisa que el pedido queda **pendiente** hasta que el dueño vea el
    dinero; el cliente indica los 4 últimos dígitos de la cuenta desde la que pagó (Nequi u otro
    banco) y su referencia queda como dato sin verificar;
  - sin QR por ahora (decisión del dueño). Los valores reales los escribe el dueño en Render.
- **«Seguimiento» según el método:** los pedidos Nequi ya no dicen «Falta el pago con Mercado
  Pago» ni «Pago confirmado por Mercado Pago»; muestran «Falta tu transferencia por Nequi…»,
  «Recibimos tu aviso de pago. Sigue pendiente…» y «Pago verificado en nuestra cuenta Nequi».
- **Pedidos con recarga manual: estado del pago y estado de la recarga, separados**
  (`src/server/domain/order-states.ts`):
  - el servidor los calcula del estado guardado; no son columnas nuevas ni los puede fijar el
    navegador;
  - pago: pendiente, confirmado, rechazado, vencido, en revisión o reembolsado (este último solo
    si Mercado Pago lo informa);
  - recarga: pendiente, en proceso, completado (solo con evidencia), requiere revisión o
    cancelado;
  - se ven en el seguimiento del cliente y en el panel.
- **Panel → Pedidos:**
  - filtros por juego y por fechas (hora de Colombia), además de estado y búsqueda;
  - 50 pedidos por página;
  - columnas de paquete, pago, recarga y última actualización;
  - en el detalle: medio elegido y transacción de Mercado Pago (id y medio con que pagó);
  - **notas internas** (`POST /api/admin/orders/:id/note`), que no se pueden editar ni borrar;
  - **historial completo** (pedido, entrega, pagos e intentos) con quién hizo cada cambio y por
    qué;
  - alertas de recargas «en proceso» más de 2 h y revisiones de más de 24 h.
- **Seguimiento privado sin cuenta:**
  - enlace privado (`/#pedido=…&codigo=…`; el código no viaja al servidor en la URL) y formulario
    «Consultar un pedido» con la referencia y el código;
  - la referencia sola, un código equivocado o el de otro pedido responden igual que un pedido
    inexistente.
- **Google Sheets como registro auxiliar** (opcional, apagado sin credenciales;
  `docs/google-sheets.md`):
  - canal `sheets` en la cola de avisos, con reintentos y alerta en el panel;
  - cuenta de servicio con firma JWT RS256 propia, sin dependencias nuevas;
  - filas sin correo, nombre, UID ni PIN, escritas como texto literal.
- **Pestaña «Entregas» en la misma hoja** (pedido del dueño, 2026-10-19):
  - por cada pago, entrega o reembolso, una fila con el ID del jugador, el nickname confirmado,
    cómo se confirmó la cuenta, el servidor elegido, la región detectada, el paquete y los
    estados; nunca correo, nombre ni PIN;
  - canal propio `sheets_delivery` (migración 0019): sus reintentos no repiten filas de
    «Pedidos»;
  - `GOOGLE_SHEETS_DELIVERY_TAB` (por defecto «Entregas»); el servidor no arranca si coincide
    con la pestaña de pedidos;
  - la política de privacidad lo informa (punto 4) en lugar de n8n, que ya no se usa.
- Evaluación de Wompi y Nequi Negocios (`docs/pagos-colombia.md`), sin implementar otra
  pasarela.
- **«Entregas»: una fila por pedido con su estado en tiempo real** (migración 0020):
  - la fila aparece al confirmarse el pago y se reescribe (buscada por la referencia) al tomar,
    empezar, entregar, fallar, revisar o reembolsar: «⏳ Por entregar», «🔄 En proceso», «✅
    Entregado con éxito», «⚠️ Requiere revisión», «↩️ Reembolsado», «✖️ Cancelado»;
  - 19 columnas: pagado y entregado, minutos hasta la entrega, comprobante y código, operación
    del pago y evidencia o motivo (`docs/google-sheets.md`);
  - la cola nunca envía dos actualizaciones del mismo pedido a la vez y la última lleva el estado
    más reciente.
- **Nequi como método de pago independiente de Mercado Pago** (decisión del dueño, 2026-10-19;
  `docs/pagos-nequi.md`). Apagado por defecto (`NEQUI_MANUAL_ENABLED=false`):
  - **Nequi por transferencia**: el cliente transfiere desde su app Nequi y avisa «Ya
    transferí» con los 4 últimos dígitos; el pedido queda pendiente hasta que el dueño ve el
    movimiento en su app y lo confirma en el panel (referencia y monto exacto). Rechazo del aviso,
    devolución registrada y transferencias tardías a revisión;
  - **Nequi Push** reservado y deshabilitado: no hay acceso oficial y no se inventó ninguna API;
  - cada pedido guarda su método (`orders.payment_method`, migración 0021); un pago de un
    proveedor nunca confirma un pedido del otro (código, disparadores de la base de datos y
    restricción del proveedor). Cambio de método solo explícito, sin pagos y solo de Mercado
    Pago a Nequi: **al elegir Nequi nunca se abre Mercado Pago** (botón «Pagar por Nequi», sin
    opciones ni botones de Mercado Pago en un pedido de Nequi; el servidor lo impide con
    `PAYMENT_METHOD_LOCKED`). Antes, mientras se preparaba el pago por Nequi, el botón decía
    «Abriendo Mercado Pago…» y el cuadro de Nequi ofrecía «Pagar con Mercado Pago en su lugar»;
  - configuración propia (`NEQUI_MANUAL_*`): un valor mal escrito apaga Nequi sin impedir el
    arranque; en producción basta un método activo (Mercado Pago o Nequi) para vender;
  - correo al dueño «Transferencia Nequi por verificar», filtro y alerta en el panel; textos de
    correos, comprobante, términos y privacidad según el proveedor;
  - pruebas: 24 de aislamiento (los 8 puntos del requisito), 6 de configuración y una compra e2e;
  - corregir el aviso «Ya transferí» solo actualiza sus datos: no reenvía el correo al dueño ni
    alarga el plazo del pedido (antes, repetirlo podía inundar su correo y mantener abierto el
    pedido sin fin).

### Corregido (pantalla de entrada bloqueada)

- **«Entrar a TayGameStore» siempre se puede pulsar:** la pantalla de entrada tenía
  `overflow: hidden` y su contenido no se podía desplazar. En un teléfono en horizontal (o con
  zoom, letra grande o una ventana baja) el botón quedaba fuera de la pantalla y la tienda se veía
  bloqueada con `<body class="entry-locked lock">`. Ahora la entrada se desplaza si no cabe, se
  centra solo cuando hay espacio y en pantallas bajas se compacta (Tay más pequeño, pie en el
  flujo).
- **Sin salida si el acceso no se ve:** si un bloqueador de contenido (o un fallo de estilos)
  oculta el diálogo de acceso, «Entrar» abre la tienda como invitado en vez de dejar una pantalla
  vacía. El acceso con cuenta sigue en «Cuenta».
- **JavaScript bloqueado (p. ej. Brave Shields con «Bloquear scripts»):** un aviso explica cómo
  permitir los scripts en lugar de un botón que no responde.
- Seguridad: `X-Frame-Options: DENY`, coherente con `frame-ancestors 'none'` de la CSP.

### Corregido (accesibilidad)

- **Nombre accesible igual al texto visible** (WCAG 2.5.3, regla `label-content-name-mismatch` que
  axe-core 4.14 marca como grave): los botones «Cuenta» y «Carrito» separan sus palabras en el
  documento (sin cambio visual: son contenedores flex) y el logotipo deja su `aria-label` y lleva
  «inicio» solo para lectores de pantalla. Era la causa de las e2e rojas del PR de dependencias
  de desarrollo (Dependabot) en Chromium, Firefox y WebKit.

### Cambiado

- **ENVIADO y «¡Envío exitoso!»:** en el panel el pedido entregado se llama **ENVIADO** (filtro,
  título y botón «Marcar como ENVIADO»). El cliente ve «¡Envío exitoso!» en el estado del pedido,
  la ruta de seguimiento, el historial, el botón del comprobante y el asunto del correo
  («¡Envío exitoso! · Pedido TGS-…»). Las etiquetas de la hoja de Google («Recarga entregada» y
  «✅ Entregado con éxito») no cambian: sus fórmulas dependen de ellas.
- Correo al dueño por un aviso Nequi: «desde una cuenta terminada en …» (antes «desde un Nequi»),
  porque por Bre-B se puede pagar desde otro banco.
- Nequi ya no se ofrece como medio dentro de Mercado Pago (vía PSE): `/api/orders/:ref/pay`
  rechaza `payMeans: "nequi"` y lo indica. Los pedidos antiguos con ese medio no cambian.
- `/api/config` informa `paymentMethods` (`mercadopago`, `nequiManual`, `nequiPush`) en lugar de
  `paymentMethod`.

### Eliminado

- **Telegram**, por decisión del dueño:
  - se quitaron el aviso por Telegram, las variables `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`
    (en `render.yaml` y `.env.example`) y el indicador `telegram` del registro de arranque;
  - la migración 0018 quita el canal `telegram` de la cola de avisos (no había filas);
  - el aviso al dueño de cada pedido pagado queda en el correo (`SMTP_*` + `ADMIN_EMAILS`) y el
    panel; `golive:check` avisa si falta el correo al dueño.

### Corregido

- **Cambio de medio de pago:** elegir otro medio (Tarjeta → Nequi) ya no reutiliza la preferencia
  anterior.
  - Se cierra el intento y se crea otro.
  - Un pago hecho en la preferencia anterior se aplica igual por la referencia del pedido.
  - Se guarda el medio elegido (`payment_attempts.pay_means`) y el medio informado por Mercado
    Pago (`payments.payment_method_id` y `payment_type_id`), en la migración aditiva 0017.
- **Reembolso parcial:** un pago aprobado con devolución parcial (`partially_refunded`) lleva el
  pedido a revisión y el pago a «en revisión».
- El seguimiento ya no dice «Factura lista» antes de crear el pedido: dice «Resumen listo».

- **Excel de inventario y facturas** (panel → Inventario → «Descargar Excel»,
  `GET /api/admin/export/inventario.xlsx`):
  - se arma con la base de datos en el momento: hojas Resumen, Inventario, Facturas y Pedidos;
  - **Facturas** solo lista pedidos pagados, con número, operación de Mercado Pago y código de
    verificación; los pedidos sin pagar van en **Pedidos** como «Sin pago (no es factura)»;
  - sin nombres, correos, ID de jugador ni PIN; hojas protegidas sin contraseña, con filtro y
    encabezado fijo; el texto nunca se interpreta como fórmula;
  - generador `.xlsx` propio (`src/server/lib/xlsx.ts`), sin dependencias nuevas;
  - cada descarga queda en la Auditoría (`inventory.exported`).
- **Verificador público de comprobantes** (tienda → Soporte → «Verificar comprobante»,
  `POST /api/receipts/verify`):
  - cualquiera (cliente, proveedor) comprueba con la referencia y el código si un comprobante lo
    emitió TayGameStore; acepta pegar la línea entera «N.º … · V1-…»;
  - si es auténtico, muestra solo número, referencia, total, fecha de pago y estado; nunca el
    correo, el UID, el nombre ni la operación de Mercado Pago;
  - un código falso, una referencia inventada o un pedido sin pago dan la misma respuesta
    («No es auténtico»), así que no revela qué pedidos existen;
  - límite de 10 intentos cada 10 minutos por conexión;
  - la factura (pantalla, JPG y PDF) indica dónde verificarla.
- **Nequi como medio de pago propio** en «Elige cómo pagar», separado de «Tarjeta»:
  - abre Mercado Pago solo con PSE, donde el cliente elige el banco «Nequi» y aprueba en su app;
  - «Tarjeta» queda para crédito y débito (Visa, Mastercard, Amex) y ya no menciona Nequi;
  - cada medio muestra debajo una pista de cómo se aprueba ese pago.
- **Reseñas verificadas** (sección «Opiniones verificadas», migración 0016):
  - solo opina quien hizo un pedido entregado, una vez por pedido, desde «Seguimiento»;
  - se publican cuando el dueño las aprueba (panel → Reseñas) y se muestran con nombre de pila e
    inicial, fecha y paquete comprado; nunca el correo, el UID ni la referencia;
  - la base de datos impide editar las estrellas o el texto y borrar reseñas, también con SQL
    directo; ocultar las retira de la tienda sin borrarlas;
  - sin reseñas publicadas, la tienda lo dice: nunca muestra reseñas de ejemplo.
- **«Así llegan tus diamantes»:** el recorrido después de pagar (pago confirmado → recarga →
  entrega → reseña) con el plazo de entrega publicado (`LEGAL_DELIVERY_TIME`, ahora en
  `/api/config`). Reemplaza la sección «Tay Lab».
- **Preguntas frecuentes:** cuánto tarda la recarga, qué pasa si el ID está mal y si las reseñas
  son reales. «Cómo funciona» suma el paso 5, «Recibe».
- **Registro al arrancar** `avisos y automatización`: qué canales de aviso al dueño están activos
  (correo, Telegram, eventos, cron, plazo de entrega), solo sí/no.
- **Prueba de producción:** informa las reseñas publicadas, si hay plazo de entrega publicado y si
  los correos al cliente están activos.
- **Informe de rentabilidad** (`npm run finanzas:margenes`, `docs/proveedor-recargas/`):
  - costo máximo del proveedor para márgenes del 5, 10 y 15 % en los 6 paquetes, en precio
    normal y TAY RADAR;
  - escenarios de comisión de Mercado Pago;
  - beneficio y equilibrio con una cotización en JSON.

  Solo calcula: no toca la base ni servicios externos.
- **TAY RADAR:**
  - cada pedido sella en el historial la regla de precio aplicada (`tay-radar`, `promo` o
    `normal`), el descuento y el fin de la promo;
  - la tienda abierta vuelve a pedir precios cuando la promo empieza o termina.

### Seguridad

- **El segundo paso del panel ya no se puede saltar activando un TOTP propio**
  (`services/auth.ts`, `modules/auth/routes.ts`):
  - antes, quien entraba solo con la contraseña del dueño (o solo con su Google) podía generar y
    activar su propia app autenticadora y abrir el panel completo, aunque la cuenta ya tuviera
    huellas o llaves registradas;
  - ahora, con una llave registrada, generar o activar el código TOTP exige una sesión que ya
    pasó el segundo paso (entrar con la huella o llave);
  - cada intento bloqueado queda en la Auditoría como alerta (`admin.mfa_enroll_blocked`);
  - el alta inicial de una cuenta sin ningún segundo factor no cambia.
- **Avisos falsos al webhook de Mercado Pago ya no llenan la auditoría**
  (`services/payments.ts`): una firma inválida queda registrada como mucho una vez por minuto y
  por conexión (máximo 30 por minuto en total). Las repeticiones se cuentan en el siguiente
  evento y el log del servidor las registra todas.

### Corregido

- **Sin facturas de borrador ni fantasma en la tienda:**
  - antes del pedido, la tarjeta es un «Resumen» (antes decía «BORRADOR») y no se descarga;
  - con pedido sin pagar tampoco hay comprobante: lo dice la tienda;
  - JPG, PDF y Compartir solo funcionan con pedido pagado, con número y código de verificación
    del servidor;
  - textos alineados: «Tu pedido», «Nuevo pedido» y «Comprobante verificable».
- **Política de ganancia:** la comisión del pago admite cargo fijo e IVA (`PAYMENT_FEE_FIXED_COP`,
  `PAYMENT_FEE_TAX_PCT`). Antes un 4 % plano subestimaba la comisión de los paquetes pequeños. En
  0, las cifras son las de antes.

- **Rol de base de datos con privilegios mínimos, listo para adoptar** (H-01,
  `docs/base-datos-rol-minimo.md`):
  - El rol de grupo `tgs_app_rw` no puede desactivar triggers, borrar pedidos ni editar el
    historial.
  - `MIGRATION_DATABASE_URL` opcional, para migrar con el rol dueño.
  - La CI corre la integración con ese rol.
  - Sin efecto en producción hasta que el dueño cree el rol.
- **Webhook de Mercado Pago:** registra la antigüedad del `ts` firmado para decidir la tolerancia
  con datos reales (H-04). No rechaza avisos.

- **Ganancia garantizada con el costo del proveedor** (`docs/estrategia-promociones.md`):
  - `UNIPIN_CATALOG` acepta el costo de cada paquete (`costCop`);
  - con la comisión del pago (`PAYMENT_FEE_PCT`, 4 %) y la ganancia mínima (`MIN_MARGIN_PCT`,
    5 %), la tienda calcula un piso por paquete;
  - ninguna promo baja de ese piso: se sube sola, o desaparece si el piso alcanza el precio
    normal;
  - un paquete cuyo precio normal no llega al piso no se vende por UniPin;
  - catálogo, checkout y entrega usan el mismo cálculo;
  - Panel → Catálogo → **Rentabilidad**: costo máximo (precio normal y promo), costo de UniPin,
    ganancia por venta y estado de cada paquete;
  - estrategia de promociones documentada (fin de semana escalonado, quincenas, eventos de Free
    Fire, temporada).

- **Protección contra borrar la tienda, alterar precios y falsificar comprobantes**
  (`docs/seguridad-tienda.md`):
  - **Comprobantes verificables**: cada pago aprobado recibe un número consecutivo y un código
    de verificación (HMAC con llave del servidor sobre número, referencia, total y operación de
    Mercado Pago). Salen en el correo y en la factura. En Panel → Integridad el dueño verifica
    cualquier comprobante: un código falso o un total cambiado no coincide.
  - **La base de datos no deja borrar** pedidos, pagos, entregas, recargas, PIN, productos ni el
    historial, ni con SQL directo. Los montos, la referencia y el número de comprobante de un
    pedido, y sus líneas, son inmutables.
  - **Todo cambio de precio queda registrado**, incluso por SQL directo (trigger, actor
    `database`).
  - **Catálogo bloqueable** (`CATALOG_LOCKED`): con él, ni una sesión robada del panel cambia
    precios. El intento queda con alerta.
  - **Sellos de integridad**: el historial se sella cada 10 minutos con una cadena de hashes.
    Panel → Integridad muestra «Intacto» o «ALTERADO», el conteo, la huella del historial, el
    último comprobante emitido y la huella del catálogo. El diagnóstico diario los publica
    fuera de la base como testigo, y queda en rojo si la cadena se rompe.
- **Recarga directa al ID con UniPin (sin PIN), lista para activar.** Con `TOPUP_PROVIDER=unipin`,
  un pago aprobado valida el ID del jugador en UniPin (distribuidor oficial), pide la recarga y
  marca el pedido «Entregado» solo cuando UniPin la confirma con su `transaction_number`.
  - Una referencia determinista por unidad e intento: UniPin rechaza las repetidas, así que nunca
    se recarga dos veces.
  - Una respuesta dudosa (tiempo agotado, 5xx) se consulta y nunca cuenta como entregada.
  - Un rechazo, o la falta de confirmación tras ~2 h, pasa el pedido a revisión con el correo
    «Recarga por revisar» al dueño. «Reanudar entrega» reintenta solo las unidades que fallaron.
  - El catálogo y el checkout usan la cobertura por servidor (`UNIPIN_CATALOG`).
  - Firma HMAC y rutas tomadas del SDK oficial de UniPin.
  - `npm run unipin:check`, con su botón en Actions, comprueba credenciales, catálogo, el campo
    del ID y una recarga de prueba en staging.
  - Apagada por defecto. Guía: `docs/recarga-directa-unipin.md`.
- **Venta solo con stock (`SELL_ONLY_WITH_STOCK`)**: un paquete se puede comprar solo si hay un
  PIN libre en el inventario; si no, la tienda lo muestra «Agotado». Mientras un cliente paga,
  su PIN queda apartado (los pedidos sin pagar y sin vencer cuentan como reservados, y las compras
  del mismo paquete se atienden una tras otra), así nadie paga algo que no se pueda entregar. Con
  `PIN_AUTO_DELIVERY` el pago aprobado entrega el PIN solo: cero entregas a mano.
- **Mercado Pago abre directo el medio elegido.** Si el cliente elige «Tarjeta», Mercado Pago
  muestra de una vez el formulario de tarjeta (crédito o débito de cualquier banco: Bancolombia,
  Davivienda, Nequi…: número, vencimiento, código de seguridad y cédula); «PSE» abre el débito
  bancario y «Efecty» el efectivo (`payment_methods.excluded_payment_types`). Si Mercado Pago
  rechazara la restricción, se abre con todos los medios y la venta no se pierde. La tienda sigue
  sin ver ni guardar datos de tarjetas.
- **Soporte por WhatsApp y correo activo**: los canales oficiales se configuraron en Render
  (`SUPPORT_WHATSAPP`, `SUPPORT_EMAIL`, nunca en el código). El mensaje que abren las burbujas se
  adapta: consulta antes de comprar, paquetes del carrito con el ID, o referencia del pedido con
  ID y servidor (antes decía «pedido BORRADOR»). La prueba de producción comprueba que ambos
  canales estén publicados, sin imprimir sus valores.
- **Tabla de tarifas propia** en «Radar promo»: precio normal, precio promo y ahorro real de
  cada paquete ($200 a $12.000), y una franja sobre el catálogo con el mayor ahorro. Todo sale de
  los precios del servidor: `/api/catalog` publica ahora `promoPriceCop` (la promo configurada
  aunque hoy no rija), pero lo cobrado sigue siendo `priceCop`.
- Inspirado en la recarga oficial y en tiendas como LootBar (sin copiarlas): ayuda «¿Dónde
  encuentro mi ID?» junto al campo del ID, y en cada paquete «Directo a tu ID» con el precio
  aproximado por cada 100 diamantes, calculado del precio vigente del servidor.

### Corregido

- **Prueba intermitente del panel** (solo pruebas): todas las pruebas compartían una IP y
  quedaban al borde del límite de 10 pedidos cada 10 minutos. Ahora cada prueba entra con su
  propia IP de cliente y la prueba se puede repetir (20 de 20 con la CPU saturada). El límite
  real de la tienda no cambió. Capturas visuales de la tienda regeneradas tras el cambio de
  textos de los medios de pago.
- **Acceso con Google funcionando en producción.** Las credenciales `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` se limpian
  (espacios o saltos de línea pegados desde el celular hacían que Google respondiera «The OAuth
  client was not found»).
- **Tienda «en blanco» cuando la hoja de estilos no llega** (el dueño la vio así en un
  teléfono: letra por defecto, fondo blanco y la mascota gigante). El servidor sí entrega el CSS
  (registros de Render sin errores en `/assets/`); el corte ocurre en la red del visitante. Ahora
  `main.js` comprueba al terminar la carga que el diseño se aplicó; si no, pide la hoja otra vez y,
  mientras tanto, muestra un aviso con la marca y el botón «Recargar» en vez de la página sin
  estilos. Dos pruebas e2e cortan la hoja (una vez y siempre). La prueba de producción con navegador
  real comprueba también «diseño cargado» y lista los métodos de acceso activos;
  `golive:check --url` informa qué accesos (Google, Facebook) faltan por credenciales.
- Textos de la tienda sobre el ID: ya no prometen una verificación «del equipo» que en el modo
  actual no existe; dicen lo real (el cliente confirma su ID antes de pagar).
- Las tareas internas arrancan en reposo: un despliegue ya no deja la base de datos despierta
  30 minutos con tareas cada minuto.
- **Consumo de Neon**: con la tienda siempre activa, las 6 tareas internas en reposo corrían cada
  30 min pero en momentos distintos y mantenían la base despierta ~87 % del tiempo (~5,5 CU-h/día,
  rumbo a superar las 100 CU-h del plan gratuito). Ahora en reposo corren juntas en una sola tanda
  por intervalo, y la vigilancia consulta la base (`/api/ready`) una vez por hora en lugar de dos.
- La tienda de prueba (artefacto) no mostraba la burbuja de WhatsApp: su configuración simulada
  tenía WhatsApp vacío. Ahora `build:preview` toma los canales de `PREVIEW_SUPPORT_WHATSAPP` y
  `PREVIEW_SUPPORT_EMAIL` al construir (nunca del repositorio) y el artefacto se republicó.
- La prueba de producción abre la tienda publicada con un navegador real
  (`tools/smoke/burbujas.mjs`) y falla si la burbuja de WhatsApp no se ve a la derecha dentro
  de la tienda o aparece en la bienvenida.
- Burbuja flotante de WhatsApp (derecha, abajo): fija en la ventana dentro de la tienda (no en
  la pantalla de bienvenida, como pidió el dueño), más grande, y en teléfonos los avisos ya no la
  tapan.
- El texto inicial del ID afirmaba que el equipo verifica «con una fuente oficial»; ahora dice
  lo que pasa de verdad según el modo de verificación, y cambiar de juego ya no lo deja mal.

- **«Elige cómo pagar»** a la vista, como en las tiendas de recargas: tarjeta, PSE, Efecty o
  saldo de Mercado Pago, en tarjetas seleccionables (radios nativos, accesibles con teclado) en
  lugar del desplegable escondido «Pendiente / Mercado Pago». El medio elegido aparece en la
  factura y en «Confirmar y pagar»; el cobro sigue ocurriendo solo en la página de Mercado Pago.
- **Servidor de Free Fire en el pedido**: junto al ID, el cliente elige el servidor de su cuenta
  (Latinoamérica por defecto, Brasil, Norteamérica, Europa, Oriente Medio, India, Asia o «No estoy
  seguro»). Se guarda en el pedido (`orders.player_server`, migración 0013, con restricción de
  valores), forma parte de la clave de idempotencia y aparece en el comprobante, el seguimiento,
  el correo, el aviso al dueño y el panel de administración («No estoy seguro» pide confirmarlo
  antes de entregar). Pedidos anteriores quedan sin servidor y siguen funcionando.

### Cambiado

- **Pago en un solo paso**, como en la recarga oficial y en las tiendas de recargas: el botón
  «Pagar $X» crea el pedido y lleva directo al cobro en Mercado Pago (si el ID ya está
  confirmado). Fuera la ventana intermedia «Confirmar y pagar»; si el pago no se completa, el
  pedido queda guardado y «Pagar con Mercado Pago» vuelve a abrir el cobro.
- Los textos para clientes ya no usan la palabra «sandbox» (p. ej. «Modo prueba · sin cobros
  reales»); con Mercado Pago en producción no aparece ningún aviso de prueba.
- **Adiós a n8n**: la automatización pasa a piezas gratuitas (servidor + GitHub Actions + rutina
  diaria de Claude), ver `docs/automatizacion.md`. Nuevo flujo **Diagnóstico diario**
  (`diagnostico.yml`): verificador de producción y navegador real, con informe en el resumen.
  Los respaldos de n8n quedan en `infra/n8n/`.
- **Tienda siempre activa**: `mantener-activa.yml` pide `/api/health` cada 10 min para que Render
  (plan gratuito) no duerma el servicio y nadie espere ~1 min al entrar. No toca la base de datos:
  Neon sigue durmiendo sin clientes. Coste cero (GitHub Actions público + 744 de 750 h de Render).
- Marca: **Tay**, personaje propio (diamante con visor, antena-destello y manos de cristal),
  sustituye al título grande de la portada y al ícono de la entrada; anima flotación, parpadeo,
  saludo, brillo y órbita solo con `transform`/`opacity` (se detiene con movimiento reducido y
  fuera de pantalla). El mismo dibujo es el favicon, el ícono de Apple, la imagen social y
  `public/brand/tay-mark.svg` para redes.
- Textos: fuera los lemas gigantes («Tu recarga. Tu jugador. Tu siguiente jugada.»); en su lugar
  una línea corta que dice qué se vende («Recargas de diamantes Free Fire por ID»), también en el
  `<title>` para los buscadores.
- Escudo anti-abuso: las sondas de salud no consultan la lista de bloqueos (la Vigilancia cada
  5 min impedía que Neon se suspendiera) y su exención es por ruta exacta, no por prefijo.
- `infra/n8n/`: copia de los flujos de n8n (sin secretos) con instrucciones de restauración.
- Tareas internas en **modo reposo** (`JOBS_IDLE_MINUTES`, 30 por defecto): sin visitas a la API
  ni trabajo pendiente, corren una vez cada 30 min en vez de cada 1-2 min, para que la base de
  datos (Neon, plan gratuito: 100 CU-horas al mes) pueda suspenderse. Antes la mantenían siempre
  encendida (~5,7 CU-horas al día: el cupo se agotaba hacia el día 17 del mes y Neon suspende la
  base hasta el mes siguiente). Cualquier petición de un cliente, del panel o de Mercado Pago
  devuelve el ritmo normal al instante.

### Corregido

- Vigilancia de GitHub: `curl --proto '=https:'` (con dos puntos) rechazaba toda URL HTTPS, así
  que cada ejecución declaraba la tienda caída y abría un incidente falso (#11). Ahora
  `--proto '=https'`, igual que `tareas.yml`.
- Guías: `LEGAL_ID` lleva solo los 4 últimos dígitos (la tabla decía «NIT o cédula»).
- Botones de Google y Facebook: arrancan deshabilitados hasta que la configuración del servidor
  confirma el proveedor. Antes, un clic durante «Comprobando…» (servidor lento o recién
  despertado) navegaba a `/auth/*` y volvía con «acceso no configurado»; Render mostraba esas
  visitas como errores. La prueba e2e ahora comprueba que no sale ninguna petición a `/auth/*`
  (antes solo miraba la URL final, que el servidor devolvía a «/»).
- Registro del servidor: «entrada rechazada por validación» en lugar de «validation error» (nivel
  info; Render lo pintaba en rojo por la palabra «error»).

### Retirado

- Acceso de clientes con Discord (a pedido del dueño): sin botón, sin rutas `/auth/discord*` ni
  variables `DISCORD_*`. La ventana de acceso ofrece Google y Facebook, lado a lado, además de
  comprar como invitado. La base de datos conserva el valor `discord` solo por compatibilidad.

### Añadido

- Eventos de pedidos hacia n8n conectados en producción: el flujo Pedidos reconoce la llave por
  su huella SHA-256 (la llave solo vive en Render) y está publicado.
- Guía `docs/puesta-en-marcha.md`: los pasos que solo hace el dueño (rotar claves expuestas,
  webhook de Mercado Pago, SMTP, credenciales de n8n, Google OAuth, privacidad en GitHub, Neon) con
  el lugar exacto donde va cada credencial.
- n8n · Vigilancia: antes de avisar de una caída, espera 90 s y confirma con una segunda consulta.
- Vista previa al compartir el enlace (WhatsApp, Facebook, X): etiquetas Open Graph y Twitter con
  imagen propia de la marca (`og-image.png`, 1200×630) y direcciones absolutas tomadas de
  `PUBLIC_BASE_URL` en el build; favicon (SVG e ICO) e ícono para iPhone; datos estructurados
  `WebSite`. Las imágenes se regeneran con `node tools/marca/generar-imagenes.mjs` (sin logos ni
  arte de terceros).
- `robots.txt` y `sitemap.xml` servidos por el servidor con la URL pública: solo la tienda; la API,
  el inicio de sesión y el panel no se anuncian; términos y privacidad siguen con `noindex`.
- Guardia de datos (`.claude/hooks/guardia-datos.sh`), skills de auditoría y despliegue seguro,
  escáner de secretos y del documento del propietario, y registro de auditoría.

- Privacidad del vendedor: términos y privacidad muestran el documento solo como «documento
  terminado en XXXX» (`LEGAL_ID` se guarda completo en el hosting, nunca en el repositorio) y
  piden a los buscadores no indexarlas (`<meta name="robots">` y cabecera `X-Robots-Tag`:
  `noindex, noarchive, nosnippet`). El documento completo se entrega solo a la autoridad o ante
  un reclamo formal por correo. Comprobantes y correos no llevan nombre ni documento del vendedor.
- Aviso de marcas visible en el pie de la tienda (y ampliado en los términos): Free Fire, Garena,
  Roblox, PUBG y Mobile Legends se nombran solo para indicar el juego; TayGameStore es
  independiente y no usa sus logos ni imágenes.
- Entrega automática con el inventario (`PIN_AUTO_DELIVERY=true`): al aprobar Mercado Pago el
  pago, si hay PIN para todas las unidades, el pedido queda entregado en la misma transacción;
  el comprador pulsa «Ver mi PIN» en su pedido (solo él: misma autorización que ver el pedido) y
  lo recibe por correo con los pasos de canje en pagostore.com. Sin PIN suficientes o con las
  entregas pausadas, sigue la entrega manual. El dueño recibe «pagado y entregado con PIN».
- Compra estilo LootBar sin proveedor de consulta (`PLAYER_VERIFICATION=customer`, por
  defecto): el cliente escribe su ID, lo **repite** y pulsa «Sí, es mi ID»; el pedido nace
  listo para pagar y paga al instante, sin esperar a que el dueño verifique el nickname. El
  servidor exige que el ID repetido coincida y deja constancia («confirmado por el cliente»).
  `operator` mantiene la verificación previa del equipo; con proveedor autorizado sigue la
  consulta instantánea de nickname y región.
- Inventario de recargas (Panel → Inventario): el dueño carga los PIN que compra a una red
  autorizada, cifrados y sin duplicados; al empezar la entrega de un pedido pagado se reserva
  el más antiguo por unidad, al entregarlo queda usado; liberar/anular, alerta de stock bajo y
  costo por PIN. Procedimiento completo: `docs/procedimiento-diamantes.md`.
- Acceso del dueño sin Google (`docs/acceso-administrador.md`): contraseña propia creada con
  la frase `ADMIN_SETUP_CODE` (scrypt, bloqueo tras 5 fallos) + código de la app autenticadora,
  o huella/llave de acceso (WebAuthn) que ya es de dos pasos. Cambiar contraseña y añadir otra
  huella desde el panel. Nada de esto se muestra al público.
- Promo de fin de semana automática (`PROMO_SCHEDULE=weekends`, por defecto): el precio
  promocional rige de sábado 00:00 a domingo 23:59, hora de Colombia, en el catálogo y en lo que
  cobra el servidor. «Radar promo» muestra el horario en hora de Colombia, del visitante y UTC.
- Comprobante de pago por correo: al confirmarse el pago el cliente recibe «Comprobante de pago ·
  Pedido …» con código, fecha y operación de Mercado Pago, jugador, detalle con precio unitario,
  descuento y total (aclara que no reemplaza una factura electrónica).
- Textos legales configurables: los datos del vendedor (`LEGAL_*`), los canales de soporte y la
  versión se ponen en `/terminos.html` y `/privacidad.html` al servirlas, sin guardarlos en Git.
  `golive:check` y el arranque dicen exactamente qué variable falta.
- Eventos de pedidos hacia n8n (`EVENTS_WEBHOOK_URL` + `EVENTS_WEBHOOK_SECRET`): pagado,
  entregado y reembolsado salen por la cola de avisos con id estable, llave Bearer, sin
  redirecciones y sin correo ni nombre del cliente. Flujos de n8n de tareas, vigilancia y
  registro de pedidos: `docs/n8n.md`.
- Pago en proceso: si un pago de Mercado Pago queda pendiente (Efecty o PSE), la tienda lo
  muestra como «Pago en proceso» y avisa antes de abrir otro pago, para no cobrar dos veces. La
  tienda informa los medios de Checkout Pro en Colombia (tarjeta, PSE, Efecty, saldo).
- n8n: Diagnóstico integral, latido de la Vigilancia, agentes especializados (infraestructura,
  pedidos, marketing) bajo el Cerebro y plan de proveedor (`docs/specs/proveedores-recargas.md`).
- Evento `order.awaiting_verification` al crear un pedido con verificación manual (con su
  plazo): el dueño recibe al momento el aviso para verificar ID, nickname y región.
- Catálogo de producción cargado con los precios del HTML original, aprobados por el
  propietario el 2026-10-06 (registro de auditoría `product.created`).
- Burbujas de soporte (WhatsApp y correo) que solo aparecen si el canal está configurado.
- "Mis favoritos" en el menú de cuenta.
- Panel "Estado de operación" con el estado real del servidor (antes, porcentajes fijos).
- Vigilancia de producción cada 30 min con reinicio por deploy hook de Render e issues de
  incidente, y pull request semanal de mantenimiento (`docs/autorreparacion.md`).
- Botón "Deploy to Render" en el README.
- Despliegue alternativo en Vercel (`docs/deployment-vercel.md`).
- Pruebas de ataque desde el navegador (`e2e/tampering.spec.ts`): precios, pagos falsos,
  CSRF, panel oculto, cookies inventadas y XSS almacenado contra el panel.

### Corregido

- Ir a una sección (menú, «Revisar factura», crear pedido) seguía corrigiendo la posición
  durante ~1 s aunque la persona ya se hubiera ido con la barra de desplazamiento o un clic: la
  devolvía a la sección y su clic caía en otro botón (p. ej. «Actualizar estado»). Ahora deja de
  corregir si algo más mueve la página o hay un clic.
- Configurar la app autenticadora del panel: el dueño no lograba activar el código (secreto
  solo en texto, que había que teclear; cada clic en «Generar clave» lo cambiaba e invalidaba
  lo ya añadido en la app; el campo cortaba «123 456» en 6 caracteres). Ahora hay **código QR**
  (generado en el navegador) y enlace «Abrir en mi app autenticadora», la clave pendiente es
  siempre la misma, los códigos se aceptan con espacios y los botones de acceso se bloquean
  mientras procesan (el doble clic mostraba «Frase incorrecta» tras crear la contraseña).
- Google: la cuenta del dueño creada con contraseña o huella se vincula a su Google (mismo correo
  verificado y en ADMIN_EMAILS) en vez de crear otra; los correos de Google se guardan en
  minúsculas.
- Panel: los botones ocultos («Cerrar sesión», «Ver tienda como cliente»…) se mostraban a
  quien no tenía sesión porque el estilo del botón anulaba `hidden`.
- Seguimiento del pedido: una consulta automática que llegaba tarde (red lenta) podía volver a
  mostrar «Confirma tu cuenta» justo después de que el cliente confirmaba; ahora una respuesta
  anterior a un cambio se descarta (prueba que reproduce la carrera).
- Safari: al volver al inicio tras un desplazamiento largo, la portada podía quedar con las
  animaciones en pausa; se recalcula la visibilidad al detenerse el desplazamiento.
- Base de datos: `sslmode=require` (y `prefer`/`verify-ca`) se fija como `verify-full`, el
  comportamiento que `pg` 8 ya aplicaba. Quita el aviso de seguridad en cada arranque de Render
  y evita que `pg` 9 debilite la verificación del certificado.

### Salida a producción

- Publicación gratuita: `render.yaml` pasa al plan Free de Render con PostgreSQL de Neon
  (la base gratuita de Render caduca); las migraciones cierran la compilación (el plan gratuito
  no tiene `preDeployCommand`). Guía `docs/despliegue-gratis.md`. Simulado con una base vacía:
  migraciones, `/api/ready`, tareas, panel oculto y segundo despliegue sin errores.
- `/api/internal/jobs` es ahora una ruta de la app (Render, Vercel o cualquier hosting), con
  `CRON_SECRET` validado (mínimo 32 caracteres): sin llave o con otra, 404; si una tarea falla,
  500 para que el flujo de GitHub quede en rojo. `tareas.yml` sirve para ambos hostings y, en
  Render Free, mantiene la tienda despierta.

- Seguridad de los correos: no incluyen el nombre que escribe el cliente (texto libre); así
  nadie puede pagar un pedido con el correo de otra persona para colarle un engaño en un
  correo legítimo de la tienda. El nombre del pedido rechaza saltos de línea y caracteres
  invisibles (ancho cero, inversión de dirección).

- Correos al cliente ("Pago confirmado", "Recarga completada", "Reembolso registrado") y al
  dueño ("Pedido pagado por entregar") por SMTP (Gmail con contraseña de aplicación u otro
  servidor). Cola `notifications` en la misma transacción que el cambio de estado, envío
  inmediato, reintentos (1/5/15/60 min) y alerta "Avisos sin enviar" tras 5 fallos; nunca
  duplicados. Al cliente solo se le escribe tras un pago confirmado. Validado contra un
  servidor SMTP real local con STARTTLS y autenticación.

- Aviso al dueño cuando Mercado Pago confirma un pago: notificación del sistema, sonido y
  contador en el título del panel (también en segundo plano), y mensaje de Telegram opcional
  (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`). Se envía una sola vez por pedido, después de
  guardar el pago; si el canal falla, el pago queda igual.
- Alerta "Pagados por entregar" en el panel.
- El aviso del panel también funciona en Chrome para Android (donde `new Notification` falla) y
  en navegadores sin notificaciones (queda el sonido); la alerta se pinta antes de avisar.
- `npm run golive:check` revisa las variables de producción y la tienda publicada
  (`docs/salir-a-produccion.md`).
- Flujo de GitHub `tareas.yml`: en Vercel dispara las tareas del servidor cada 10 minutos
  (conciliación de pagos sin webhook, vencimientos, reintentos); antes, en Hobby, una vez al día.

### Seguridad del panel

- Panel en una dirección secreta (`ADMIN_PATH`, obligatoria en producción con `ADMIN_EMAILS`):
  `/admin.html` responde 404, sin enlaces públicos, `noindex` y sin Referer. `/api/admin/*`
  responde 404 (no 401/403) a quien no es administrador. Un intento de entrada al panel sin
  permiso recibe el mensaje genérico de Google.
- "Ver tienda como cliente" en el panel y "Panel de administración" en el menú de cuenta (solo
  para el dueño); volver al panel exige Google + TOTP.

### Simulación de clientes

- `npm run load:sim` (`tools/load/simulate.mjs`, `docs/simulacion-clientes.md`): hasta 300
  clientes comprando a la vez y ataques simultáneos. 9 rondas, ≈ 210.000 peticiones, 0 errores
  del servidor, 0 clientes fallidos, memoria estable y las 9 defensas activas.
- Doble de Mercado Pago de pruebas: id de pago único aunque coincida el milisegundo.

### Accesibilidad y diseño (revisión con las guías de Apple, HIG)

- Ningún texto bajo 11 px (había 163 en móvil, el menor de 7,2 px); `--muted2` de 3,99:1 a
  5,34:1 sobre paneles; paso "02" de 1,5:1 a ≥5,5:1; pie de la entrada de 2,1:1 a 5,8:1.
- Anillo de foco cian en todos los controles con teclado (44 de 44).
- Controles táctiles de 44 px en pantallas táctiles (había 68 por debajo).
- Respuesta a "Aumentar contraste" y "Reducir transparencia" del sistema.
- La numeración 01–04 queda solo para los pasos de compra (Lab, Soporte y FAQ sin número).

### Rendimiento

- Arranque y fluidez sin quitar animaciones: las que no se ven (fuera de pantalla, tras la
  pantalla de entrada) se pausan y continúan al volver; partículas a 30 FPS en móvil; cursor,
  inclinación y barra de avance una vez por fotograma; aura y brillo sin repintar la página.
  Medido con CPU ×4 en móvil: arranque 2,1 s → 0,9 s, bloqueos 2,5 s → 0,8 s, entrada a 60 FPS;
  en escritorio el cursor pasa de 25 a 60 FPS. `e2e/motion.spec.ts` lo vigila.

### Corregido

- Enlaces del menú y vuelta de Mercado Pago: la sección quedaba bajo la cabecera o se pasaba.
- "Soporte" cortado en el menú con sesión iniciada; "Quitar" ilegible en favoritos.
- "COP COP" en el panel; pasos de compra numerados 01–05 en orden; textos de programador
  ("backend", "frontend", "checkout") retirados de la tienda.

## [1.0.0-rc.1] — 2026-10-05

Primera versión candidata a producción. **No se ha vendido todavía**: faltan los pasos del
propietario de la sección "Antes de la 1.0.0".

### Tienda

- Frontend cinematográfico original conservado (`legacy/` intacto) y separado en capas CSS y
  módulos ES; responsive sin desbordes de 360 a 1920 px y accesible (axe-core WCAG 2.1 AA).
- Catálogo y precios decididos por el servidor; carrito (deshacer, ahorro, tope por paquete,
  sincronización entre pestañas) y favoritos completos; espacios compactados.
- Pedido → verificación del jugador → "Sí, es mi cuenta" → pago → entrega manual → comprobante
  JPG/PDF y seguimiento. Búsqueda de ID estilo LootBar lista tras un proveedor autorizado, con
  verificación manual automática de respaldo.
- Panel `/admin.html`: verificación, entregas, revisión, catálogo, bloqueos, auditoría y
  alertas.

### Pagos (Mercado Pago, única pasarela)

- Checkout Pro con el SDK oficial, webhook firmado, idempotencia, conciliación, reembolsos y
  pagos duplicados o tardíos controlados.
- Sandbox seguro: `MP_MODE` contrastado con `live_mode` de cada pago, avisos de modo prueba y
  `npm run mp:sandbox`.

### Cuentas

- Clientes: Google, Discord y Facebook (OAuth oficial), vinculación explícita que nunca une por
  correo. Administración: solo Google + `ADMIN_EMAILS` + TOTP.

### Seguridad

- CSP, CSRF, cookies `__Host-`, sesiones opacas, validación estricta, auditoría inalterable,
  secretos solo por entorno con llaveros rotables.
- Escudo anti-abuso (escáneres, CSRF, ráfagas, enumeración, MFA) con bloqueo escalonado,
  límite global por IP, `requestTimeout`, bloqueo de MFA por cuenta, filtro de U+0000 y errores
  del enrutador con formato estándar.
- Sin rutas que toquen credenciales, cobros o administradores (prueba de inventario).

### Rendimiento y datos

- Listado de pedidos sin N+1 (151 → 4 consultas); estáticos precomprimidos (br/gzip) y caché
  inmutable; índices en todas las claves foráneas.

### Calidad

- 117 pruebas unitarias, 131 de integración con PostgreSQL (incluye fuzzing de toda la API con
  semillas reproducibles), 35 e2e en Chromium, Firefox y WebKit (CI) y 3 referencias visuales.
- CI: lint, formato, tipos, deriva esquema/migraciones, auditoría de dependencias (0
  vulnerabilidades), gitleaks verificado por checksum, CodeQL y Dependabot semanal.

### Despliegue y operación

- `render.yaml` validado contra la configuración; guías de despliegue, sandbox, runbook,
  incidentes, dinero y acceso; textos legales en borrador con bloqueo de ventas mientras
  queden campos `[COMPLETAR`.

### Retirado

- Wompi, el botón de VK ID (protocolo no verificable) y el formulario de contraseña que nunca
  funcionó.

### Antes de la 1.0.0 (propietario)

1. Apps de Google, Discord y Meta; claves en Render.
2. Sandbox de Mercado Pago completo (`docs/sandbox-mercadopago.md`).
3. Render + dominio + catálogo y precios reales.
4. Textos legales completos y revisados por un abogado.
5. `ADMIN_EMAILS` solo con el correo del propietario.
