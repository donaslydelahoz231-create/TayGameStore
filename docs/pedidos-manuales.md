# Pedidos, pagos y recargas manuales

Cómo funciona hoy la venta con entrega manual: el cliente pide y paga; Mercado Pago confirma el
pago; el dueño hace la recarga en un canal permitido y la registra con evidencia. Este documento
distingue lo **implementado y probado**, lo **preparado (sin credenciales)** y lo **pendiente**.

## 1. Flujo

1. **Pedido.** El cliente elige el paquete, escribe su ID dos veces, su servidor y el correo de
   aviso.
   - El servidor recalcula producto, precio, promoción y total. El precio del navegador no cuenta.
   - Crea la referencia `TGS-…` con 10 caracteres aleatorios.
   - Entrega un **código de seguimiento secreto** de 32 bytes aleatorios. La base solo guarda su
     HMAC.
2. **Pago** con Mercado Pago (Checkout Pro).
   - La preferencia se crea en el servidor con `external_reference` igual a la referencia del
     pedido.
   - Si el cliente cambia de medio de pago (Tarjeta → Nequi), se cierra el intento anterior y se
     crea otra preferencia.
3. **Confirmación del pago**, separada de la entrega.
   - Llega por el webhook con firma, por la conciliación cada 2 min o por el regreso del navegador.
     Las tres vías **consultan el pago a Mercado Pago**.
   - Deben coincidir importe, moneda (COP) y modo (real o de prueba).
   - Un mismo pago de Mercado Pago no puede aprobar dos pedidos (índice único en la base).
4. **Recarga manual** desde el panel: Reclamar → Iniciar → el dueño recarga en el canal permitido
   → Marcar entregado **con evidencia** (obligatoria por una restricción CHECK de la base).
   - Si falla: «Marcar fallida» con motivo, y el pedido pasa a revisión.
5. **Seguimiento.** El cliente ve el estado guardado en el servidor; la página se actualiza sola
   cada 5 s, luego cada 15 s y luego cada 60 s.

## 2. Estados (separados)

Los calcula el servidor (`src/server/domain/order-states.ts`) a partir de la máquina de estados
existente. No son columnas nuevas y el navegador no puede fijarlos.

| Estado del pago | Cuándo |
|---|---|
| Pendiente | Pedido creado; ningún pago aprobado (incluye PSE o efectivo en proceso) |
| Confirmado | Mercado Pago aprobó un pago con importe, moneda y modo correctos |
| Rechazado | Mercado Pago rechazó el último intento (el cliente puede reintentar), o el pedido se rechazó antes de pagar |
| Vencido | El tiempo para pagar terminó sin pago |
| En revisión | Importe o moneda distintos, contracargo, reembolso parcial o estado desconocido |
| Reembolsado | Solo cuando Mercado Pago informa la devolución total |

| Estado de la recarga | Cuándo |
|---|---|
| Pendiente | Sin pago, o pagado y esperando turno («En cola de entrega» para el cliente) |
| En proceso | El dueño inició la entrega |
| Completado | Entrega registrada con evidencia |
| Requiere revisión | Entrega fallida o pedido en revisión |
| Cancelado | Vencido, rechazado o reembolsado sin entregar |

Garantías de la máquina de estados:

- Una recarga **solo empieza con el pago confirmado**: la entrega se crea en la misma transacción
  que el pago.
- **«Completado» exige evidencia.**
- Cada transición usa CAS y queda auditada.

## 3. Panel del dueño (ruta secreta, contraseña o Google + segundo paso)

- **Filtros:** estado, juego, fecha «desde» y «hasta» (hora de Colombia) y búsqueda exacta por
  referencia, UID o correo.
- **Paginación:** 50 pedidos por página.
- **Columnas:** referencia, creado, paquete, UID y servidor, total, **pago**, **recarga** y última
  actualización.
- **Detalle del pedido:**
  - correo y nombre del cliente;
  - medio elegido y transacción de Mercado Pago (id y medio con que pagó);
  - estados separados;
  - pagos, intentos y entrega.
- **Notas internas:** el cliente no las ve. Quedan en la auditoría, que la aplicación solo puede
  agregar: no puede editarla ni borrarla (sin `UPDATE`/`DELETE`, triggers y sellos de integridad).
- **Historial completo:** pedido, entrega, pagos e intentos, con fecha, cambio, **quién lo hizo**
  (correo del administrador) y nota o motivo.
- **Alertas nuevas:** «Recargas en proceso (+2 h)» y «En revisión (+24 h)». Se suman a «Pagados sin
  entregar (+30 min)» y las demás.
- Todas las rutas exigen: sesión de administrador, correo en `ADMIN_EMAILS` y segundo paso
  verificado. Sin eso responden 404, para no revelar que existen.

## 4. Seguimiento privado (sin cuenta)

- **Con cuenta:** «Mis pedidos» lista solo los pedidos de esa cuenta.
- **Sin cuenta:** al crear el pedido aparece **«Tu enlace privado de seguimiento»**
  (`/#pedido=TGS-…&codigo=…`).
  - El código va en el fragmento de la URL: el navegador no lo envía al servidor ni a otros sitios,
    y se borra de la barra al abrirlo.
- **Consultar un pedido** (sección Seguimiento): se pega el enlace, o se escriben la referencia y
  el código.
- **La referencia sola no muestra nada.** Responden lo mismo (404, sin datos):
  - referencia sin código;
  - código equivocado;
  - código de otro pedido;
  - pedido inexistente.
- **Abuso:** tras unas 20 consultas fallidas el escudo bloquea la conexión (403). Además hay un
  límite de 120 por minuto y uno global por IP.
- **No se afirma** que el pagador sea el titular de una billetera: Mercado Pago no entrega esa
  prueba a la tienda.

## 5. Avisos y registro auxiliar

- **Correo** (SMTP) y **Telegram**: implementados, apagados sin credenciales. Avisan:
  - pago confirmado al dueño y al cliente;
  - entrega y reembolso al cliente.
- **Google Sheets:** preparado y apagado (ver [google-sheets.md](google-sheets.md)). No escribe
  datos personales y nunca decide nada.
- Si un aviso o una fila fallan, el pedido sigue igual. Se reintenta con espera creciente y, tras
  5 intentos, el panel muestra «Avisos sin enviar».

## 6. Pagos en Colombia

Mercado Pago es hoy la única autoridad de pago (regla del proyecto). La evaluación de Wompi y
Nequi Negocios está en [pagos-colombia.md](pagos-colombia.md). No se implementó otra pasarela.

## 7. Pruebas

- **Unitarias:**
  - `tests/unit/order-states.test.ts`: estados, incluida la búsqueda exhaustiva de que nunca hay
    «completado» sin entrega ni «confirmado» sin pago;
  - `tests/unit/google-sheets.test.ts`: JWT RS256 con llave sintética, RAW, errores sin filtrar
    datos y configuración.
- **Integración** (Postgres con el rol mínimo de la aplicación):
  - `tests/integration/manual-orders.test.ts`:
    - flujo de estados;
    - entrega sin pago imposible;
    - cambio de medio;
    - reembolso parcial;
    - filtros, páginas, notas e historial;
    - permisos;
    - historial inmutable;
    - alertas;
    - un pago no aprueba dos pedidos;
    - acceso privado y anti-enumeración.
  - `tests/integration/sheets.test.ts`:
    - fila sin datos personales;
    - Google caído sin afectar el pago;
    - reintento sin duplicar;
    - fallo visible en el panel.
- **e2e** (`e2e/behavior.spec.ts`): el enlace privado abre el pedido en otro navegador; la consulta
  con un código falso no muestra nada y con el enlace sí.
- Las pruebas existentes cubren:
  - precios manipulados;
  - firmas inválidas y webhooks repetidos;
  - importes o monedas incorrectos;
  - pedidos ajenos;
  - panel sin permiso;
  - concurrencia;
  - fallos de Mercado Pago y de correo.

## 8. Pendiente antes de cobrar con confianza

1. **Avisos al dueño:** Telegram o SMTP en Render. Lo hace el dueño (son secretos).
2. **Prueba controlada de punta a punta** con dinero real mínimo y reembolso, con autorización
   del dueño: pago → webhook → «Confirmado» → aviso → entrega con evidencia → «Completado» →
   reembolso → «Reembolsado».
3. **Revisión legal:**
   - textos legales (siguen como borrador);
   - condiciones de Garena para la reventa;
   - facturación ante la DIAN (con contador).
4. **Disponibilidad:** el plan gratuito de Render se duerme.
