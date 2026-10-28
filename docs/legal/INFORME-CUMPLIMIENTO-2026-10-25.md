# Informe de cumplimiento legal y accesibilidad — 2026-10-25

Pedido del dueño: páginas de privacidad, términos, cookies y reembolsos; consentimiento en los
formularios; solo los datos necesarios; analítica y terceros revisados; sitio accesible (texto
alternativo, contraste, teclado, etiquetas claras); sin reseñas falsas ni afirmaciones sin
respaldo; datos del negocio; derechos de autor de las imágenes; leyes de Colombia y otros
riesgos. Antes, a pedido del dueño, se deshizo el último diseño local (Facetas y movimiento) para
volver al aspecto publicado.

**Este informe no es asesoría legal.** Resume lo que exige la norma colombiana según el texto de
las leyes citadas y lo que hace hoy la tienda, con evidencia. Antes de vender a escala, conviene
que un abogado colombiano revise los textos (ver «Acciones del dueño»).

Este documento no contiene datos personales del propietario.

## 1. Normas revisadas y estado

| Norma                                                | Qué exige (resumen)                                                                                                 | Estado en la tienda                                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ley 1581 de 2012 y Decreto 1377 de 2013 (D. 1074/15) | Política de tratamiento, autorización previa y expresa con prueba, derechos y plazos, menores, transmisiones        | ✔ `privacidad.html`: responsable, datos, finalidades, autorización (versión y fecha guardadas), menores, encargados, datos fuera de Colombia, plazos 10+5 y 15+8 días hábiles, requisito de procedibilidad |
| Ley 1480 de 2011, art. 23–26                         | Información clara y precio total en pesos                                                                           | ✔ precios en COP calculados por el servidor; nota de impuestos (`LEGAL_TAX_NOTE`)                                                                         |
| Ley 1480, art. 33                                    | Toda promoción indica su plazo y condiciones                                                                        | ✔ **nuevo**: la franja de promo dice «Válida hasta el dom., … 11:59 p. m. (hora de Colombia)» o «Del sáb. … al dom. …»                                      |
| Ley 1480, art. 47                                    | Retracto de 5 días hábiles; excepción de servicios cuya prestación empezó con acuerdo del consumidor; reembolso ≤ 30 días | ✔ términos §7 y `reembolsos.html` §2–3                                                                                                                 |
| Ley 1480, art. 50                                    | En comercio electrónico: identidad del vendedor (nombre, NIT), dirección de notificación, teléfono, correo; PQR       | ⚠ parcial: nombre, documento **enmascarado** (regla del dueño), ciudad, correo y WhatsApp. Ver riesgo R1                                                   |
| Ley 1480, art. 51 y Decreto 587 de 2016              | Reversión del pago (fraude, no solicitada, no recibida, no corresponde) dentro de 5 días hábiles                    | ✔ términos §7 y `reembolsos.html` §6                                                                                                                      |
| Ley 527 de 1999                                      | Validez de la aceptación electrónica (mensajes de datos)                                                            | ✔ casilla obligatoria con enlaces a términos y privacidad; versión y fecha guardadas                                                                     |
| Cookies (Ley 1581, sin ley específica)               | No hay ley colombiana de cookies; si identifican a una persona son datos personales                                 | ✔ solo cookies técnicas necesarias, explicadas en `cookies.html`. **No hace falta banner** para ellas; si un día se usa analítica o publicidad, pedir permiso antes |
| Ley 23 de 1982 y Decisión Andina 351 (autor)         | Usar solo obras propias o con licencia                                                                              | ✔ ver §4                                                                                                                                                  |
| Decisión Andina 486 (marcas)                         | No usar marcas ajenas como propias                                                                                  | ✔ mención solo descriptiva y aviso de no afiliación (pie y términos §1); sin logos ni imágenes de Garena                                                  |
| Ley 2300 de 2023                                     | Horarios y canales para contactos comerciales                                                                       | ✔ no se envía publicidad; solo avisos del pedido                                                                                                         |
| DIAN — facturación electrónica                       | Obligados a facturar según su régimen                                                                               | ⚠ el comprobante de la tienda **no** es factura (ahora lo dice); la obligación depende del régimen del dueño: ver R6                                      |

## 2. Qué se hizo (cambios locales, sin publicar)

- **Páginas legales:** `privacidad.html` y `terminos.html` reescritas; nuevas `cookies.html` y
  `reembolsos.html` (`noindex`, mismo estilo, servidas por `LEGAL_PAGES`, incluidas en el build y
  en `golive:check`). Enlace a la SIC en términos, privacidad y reembolsos.
- **Datos del vendedor:** sección `#vendedor` en términos y enlace «Datos del vendedor» en el pie.
  Las páginas nuevas **no** repiten el nombre, el documento, la dirección ni el WhatsApp del
  dueño: enlazan a esa sección (requisitos 11 y 19 de `docs/datos-del-propietario.md`; una prueba
  e2e lo comprueba). Términos y privacidad muestran los mismos campos que antes.
- **Consentimiento:** la casilla del pedido dice «Acepto los términos y condiciones y autorizo el
  tratamiento de mis datos según la política de privacidad» (los dos enlaces de siempre).
- **Pie:** enlaces a los 4 documentos y a los datos del vendedor.
- **Afirmaciones sin respaldo quitadas:** la cifra fija «24 ms» de latencia; «Factura digital» /
  «Mi factura» / «Revisar factura» → «Comprobante digital» / «Mi pedido» / «Revisar pedido» (el
  comprobante no es una factura electrónica de la DIAN).
- **Fuentes propias:** Oxanium y Plus Jakarta Sans (licencia SIL OFL 1.1, texto en
  `/fonts/LICENCIA-FUENTES-OFL.txt`) se sirven desde la tienda. Antes cada visita enviaba la IP
  del visitante a Google. CSP: `font-src 'self'`. Son los mismos archivos (sha256 idéntico) que
  usaban las capturas de referencia.
- **Accesibilidad:** ver §3.

## 3. Accesibilidad (WCAG 2.2 AA) — evidencia

- **axe-core** (WCAG 2.0/2.1/2.2 A y AA + buenas prácticas, todas las gravedades) en entrada,
  tienda, modal de promo y las 4 páginas legales, a 360 y 1280 px: **0 avisos**. Corregidos en
  esta ronda: tamaño de los enlaces legales del pie (24 px con ratón, 44 px táctil; 2.5.8) y la
  tabla de cookies, que se desplaza en celular y ahora se alcanza con teclado.
- **Contraste medido píxel a píxel** (los 752 textos que axe no puede decidir por degradados):
  el blanco sobre el degradado violeta → azul bajaba a **3,36:1** en el extremo azul (#2f8bff).
  Donde el degradado lleva texto, el extremo es #2a6cf0: **4,66:1 como mínimo**. Contador del
  carrito 4,46 → 4,99:1; estrella de favoritos 4,13 → 4,97:1. Lo que el script aún marca son
  píldoras con texto oscuro (mediana 7,6–10,3:1): el valor bajo sale de sus esquinas redondeadas,
  no del texto.
- **Teclado:** 92 paradas de Tab en orden; los 19 controles de formularios (jugador, pedido,
  pago, aceptación, seguimiento y verificación) se alcanzan; anillo de foco cian de 2 px; la
  casilla de aceptación se marca con Espacio.
- **Texto alternativo:** la única `<img>` del sitio (QR del panel) tiene `alt`; los íconos son SVG
  decorativos con `aria-hidden`.
- **Etiquetas claras:** los 9 botones «×» (búsqueda, carrito, cómo funciona, seguridad,
  promociones, perfil, favoritos, historial, búsqueda de jugador) dicen qué cierran.
- **Burbujas de soporte:** tapaban el final del aviso de marcas al llegar al fondo; ahora el pie
  les deja espacio (0 líneas tapadas a 360, 768 y 1280 px con WhatsApp y correo).

## 4. Datos, terceros, analítica, reseñas e imágenes

- **Analítica y rastreo:** ninguno. Prueba e2e nueva: la tienda y las páginas legales hacen
  **0 peticiones a otros dominios** (sin analítica, fuentes de Google ni anuncios).
- **Cookies:** `tgs_guest` (90 días), `tgs_session` (hasta 7 días por defecto), `tgs_oauth`
  (10 min), `tgs_webauthn` (solo administrador, 5 min). Todas propias, `HttpOnly`,
  `SameSite=Lax` y, con HTTPS, `Secure` y prefijo `__Host-` (`src/server/plugins/security.ts`).
- **Datos del pedido:** nombre, correo, UID y servidor del jugador; de Nequi solo los 4 últimos
  dígitos del celular; la IP solo como huella con clave. No se piden datos sensibles ni la
  contraseña del juego.
- **Terceros:** Mercado Pago, Nequi (lo hace el cliente), Google (acceso, correo y hoja interna
  sin correo ni nombre del cliente), Render + Cloudflare, Neon, WhatsApp (si el cliente escribe).
  Recarga directa (UniPin) y consulta externa de ID: **apagadas**.
- **Reseñas:** producción tiene **0** reseñas publicadas; no hay reseñas falsas que quitar. Solo
  se aceptan sobre pedidos entregados.
- **Imágenes:** la mascota «Tay», la imagen social y los íconos se dibujaron para la tienda (SVG
  del repositorio); las fuentes son OFL; no se usan logos ni imágenes de Garena ni de otros
  juegos.
- **Arte de los paquetes (2026-10-27):** las 7 imágenes de `src/web/public/art` (gemas, montón,
  bolsa, cofres, bóveda y el cofre del banner) se generaron con IA (Gamma, `generate_image`)
  para esta tienda, con instrucciones que excluyen logos, texto y marcas; muestran gemas
  genéricas, no el diamante de Free Fire. Se recortaron y pasaron a WebP sin metadatos.
  **NO VERIFICADO:** que los términos de Gamma permitan el uso comercial de las imágenes
  generadas en el plan de la cuenta; revísalo en sus condiciones antes de publicar.
- **Marca y fuentes (2026-10-27):** el emblema de Tay, el símbolo, el ícono de app y los íconos
  de la interfaz son dibujos SVG propios de la tienda. El logotipo «TayGameStore» son los trazos
  de la fuente Unbounded 700; Unbounded e Instrument Sans tienen licencia SIL OFL 1.1 (leída en
  los propios archivos), que permite usarlas en logotipos y servirlas con la web; su texto de
  licencia va en `/fonts/LICENCIA-FUENTES-OFL.txt`.
- **Íconos de acceso y de juegos (2026-10-28, pedido del dueño):**
  - **Acceso:** los botones «Google» y «Facebook» usan los logotipos oficiales de cada marca, solo
    para identificar el método de acceso, como piden sus guías de marca.
    - Google: la «G» sale del paquete oficial `signin-assets.zip` de
      [developers.google.com/identity/branding-guidelines](https://developers.google.com/identity/branding-guidelines),
      recortada sin el marco.
    - Facebook: el logotipo circular azul (#0866FF) de los recursos de marca de Meta
      ([about.meta.com/brand/resources/facebook/logo](https://about.meta.com/brand/resources/facebook/logo)),
      en el trazo que publica Simple Icons 16.36.0 con esa fuente.
    - Son marcas de Google LLC y Meta Platforms, Inc.
  - **Juegos:** el dueño decidió **no** usar logotipos oficiales. Los íconos de Free Fire,
    Roblox, PUBG Mobile y Mobile Legends son dibujos propios de la tienda con los colores de cada
    juego: llama, bloque, caja con paracaídas y escudo con espada. No copian sus logotipos, así
    que sigue vigente «no usa sus logos ni sus imágenes» (términos §1).

## 5. Riesgos y acciones del dueño (por prioridad)

| #   | Riesgo                                                                                                                                                                            | Qué hacer                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Alto.** Ley 1480 art. 50 pide NIT, dirección de notificación y teléfono. Tu regla prohíbe publicar el documento completo, y el NIT de una persona natural es la cédula más un dígito | Con un abogado o contador: constituir una SAS (NIT propio, distinto de tu cédula) o confirmar cómo cumplir sin exponer tu documento |
| R2  | **Alto.** El plazo de entrega publicado dice «inmediata» (`LEGAL_DELIVERY_TIME`), pero hoy la entrega es manual: publicidad engañosa (Ley 1480 art. 29–30)                          | Cambiar la variable en Render a un plazo real (p. ej. «hasta 2 horas en horario de atención»). Necesita tu autorización          |
| R3  | **Medio.** Etiquetas «Top ventas» y «Popular» en el catálogo sin datos que las respalden                                                                                         | Cambiarlas en el panel (o autorizarme) por etiquetas verificables, o quitarlas                                                    |
| R4  | **Medio.** Términos de Garena: revender diamantes sin ser distribuidor autorizado puede llevar a bloqueos de cuentas y reclamos                                                     | Comprar los diamantes solo por canales oficiales o autorizados y guardar los soportes                                             |
| R5  | **Medio.** Ventana de acceso: el «×» no dice qué cierra y no hay un aviso de privacidad al entrar con Google                                                                      | Pediste no tocar los logins: dime si lo cambio (etiqueta «Cerrar acceso» y enlace a la política)                                  |
| R6  | **Medio.** Facturación electrónica y obligaciones con la DIAN según tu régimen                                                                                                   | Consultarlo con un contador                                                                                                       |
| R7  | **Medio.** Transmisión de datos a encargados en el exterior (Render, Neon, Google, Mercado Pago): el Decreto 1377 pide un contrato de transmisión                                 | Aceptar y guardar el acuerdo de tratamiento de datos (DPA) de cada proveedor                                                     |
| R8  | **Bajo.** Registro Nacional de Bases de Datos (SIC): según el Decreto 090 de 2018 solo es obligatorio para sociedades y entidades sin ánimo de lucro con activos de más de 100.000 UVT y para entidades públicas         | Confirmarlo si constituyes una sociedad                                                                                          |
| R9  | **Bajo.** Si `PROMO_SCHEDULE` fuera `always`, la promo no tendría fecha de fin (hoy es `weekends` en producción)                                                                  | Mantener `weekends` o cualquier horario con fin                                                                                  |

## 6. Verificación

- Formato, lint y tipos: OK. Unitarias y API: 385/385. Integración (Postgres): 304/304.
- e2e: 76/76, entre ellas 2 pruebas nuevas: «la tienda no carga nada de terceros» y la de las
  páginas legales, ampliada a las 4 páginas (axe, `noindex`, 360 px, enlaces del pie y el nombre
  del dueño solo donde ya estaba). Se amplió además la prueba de la promo, que ahora comprueba
  su vigencia.
- Visuales: 3/3. La captura 02 «acceso» no cambió en ningún tamaño. La 01 «entrada» cambia por
  «Comprobante digital» y el botón con más contraste. La 03 «tienda» cambia por el pie, la
  vigencia de la promo y el contraste. Todas se revisaron antes de regenerarlas.
- Producción (solo lectura, 2026-10-25): términos y privacidad sin marcadores pendientes, así que
  cookies y reembolsos, que usan las mismas variables, saldrán completas. Promo publicada
  `weekends`.

## 7. NO VERIFICADO

- Revisión de los textos por un abogado colombiano.
- Contratos de transmisión (DPA) aceptados con cada proveedor.
- Autorización de Garena o del distribuidor para revender diamantes.
- Régimen tributario del dueño y obligación de facturar.
- El aspecto en producción de estas páginas: los cambios siguen locales hasta que autorices el
  push.
