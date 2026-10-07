# Salir a producción: cobrar dinero real y entregar los diamantes

Esta guía cubre el paso de "modo prueba" (Mercado Pago sandbox) a vender de verdad, y cómo
llega cada pedido pagado hasta el jugador.

## Qué pasa cuando un cliente paga

| Paso | Quién lo hace | Automático |
|---|---|---|
| El cliente elige paquete, ID de jugador y acepta los términos | Cliente | — |
| Se confirma el jugador (consulta del ID o verificación desde el panel) | Panel / cliente | Manual: no hay proveedor autorizado de consulta de ID conectado |
| El cliente paga en Mercado Pago (Checkout Pro) | Cliente + Mercado Pago | Sí |
| Mercado Pago avisa al servidor (webhook firmado), el servidor **consulta el pago a Mercado Pago** y comprueba monto, moneda y `live_mode` | Servidor | Sí. El navegador nunca puede marcar un pedido como pagado |
| Si el webhook no llega: al volver el cliente a la tienda se consulta su pago; además la conciliación revisa los pendientes (Render: cada 2 minutos dentro del servidor; Vercel: cada 10 minutos con el flujo `tareas.yml`, ver `deployment-vercel.md`) | Servidor | Sí |
| El pedido pasa a **Pagado** y queda "listo para entregar" | Servidor | Sí, una sola vez por pedido |
| **Correo al cliente** "Comprobante de pago" (código, operación de Mercado Pago, ID, paquetes y total) | Servidor | Sí, con correo configurado (sección 1) |
| **Aviso al dueño**: notificación + sonido + contador en el panel; correo y Telegram si los configuras | Servidor / panel | Sí |
| Recargar los diamantes al ID del jugador | **Tú**, con tu canal de recarga | **No**: entrega manual (ver abajo) |
| Marcar el pedido como entregado con la evidencia | Tú, en el panel | — |
| El cliente ve "Recarga completada" en su seguimiento y la recibe por correo | Tienda / servidor | Sí |

### Por qué la entrega es manual

No existe una API pública de Garena para recargar diamantes. La recarga automática solo es
posible con un **distribuidor autorizado** que te dé acceso a su API con contrato. Mientras no
lo tengas, la tienda no inventa uno: cada pedido pagado se entrega desde el panel
(*Tomar → Iniciar → Entregar* con la evidencia). Si no puedes entregar un pedido, reembólsalo
desde Mercado Pago; el reembolso llega por webhook y el pedido pasa a **Reembolsado**.

Cuando contrates un distribuidor, el punto de conexión ya existe (`FULFILLMENT_MODE` y el
puerto de verificación de jugador); se integra con su documentación oficial, nunca antes.

## 1. Correos al cliente y a ti (recomendado)

Con correo configurado, el cliente recibe su **"Comprobante de pago"** cuando Mercado Pago confirma el
pago, **"Recarga completada"** cuando marcas la entrega y **"Reembolso registrado"** si hay un
reembolso; tú recibes **"Pedido pagado por entregar"** en los correos de `ADMIN_EMAILS`. La
tienda le dice al cliente, junto al campo de correo, que le escribiremos allí (solo si el correo
está configurado: nunca promete lo que no hace).

Cómo es de fiable:
- El aviso se guarda en la base de datos **en la misma operación** que marca el pedido como
  pagado: no existe un pedido pagado sin su aviso pendiente.
- Se envía en el momento. Si el servidor de correo falla, se reintenta solo (1, 5, 15 y 60
  minutos). Tras 5 intentos fallidos queda marcado y el panel lo muestra en
  **"Avisos sin enviar"**.
- Nunca se envía dos veces el mismo aviso, aunque Mercado Pago repita su notificación.
- Al cliente solo se le escribe **después de un pago confirmado**: nadie puede usar tu tienda
  para mandar correos a otra persona escribiendo su dirección en un pedido sin pagar.
- Los correos nunca piden contraseñas y lo dicen en el pie; las respuestas del cliente van a
  `SUPPORT_EMAIL`.

### Con Gmail

1. En tu cuenta de Google activa la **verificación en dos pasos**.
2. En *Cuenta de Google → Seguridad → Contraseñas de aplicaciones*
   (`myaccount.google.com/apppasswords`), crea una para "TayGameStore". Google te muestra una
   clave de 16 letras. Si la clave se filtra, revócala allí mismo y crea otra.
3. En el hosting: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=` tu Gmail,
   `SMTP_PASS=` esa clave de aplicación (nunca tu contraseña normal). Redespliega.

Gmail limita los envíos diarios de una cuenta personal; para una tienda con mucho volumen
conviene Google Workspace o un servicio de correo transaccional (también funcionan por SMTP con
las mismas variables). Revisa los límites vigentes en la ayuda de Google.

### SMS

No está incluido: requiere contratar un proveedor de SMS (cobra por mensaje) y pedir el
celular al cliente en el pedido. Si lo quieres, se integra con la documentación oficial del
proveedor que elijas, con la misma cola de avisos.

## 2. Aviso a tu celular por Telegram (opcional)

Telegram es **solo para ti** (el dueño): los clientes nunca lo ven ni lo necesitan.

1. En Telegram abre **@BotFather**, envía `/newbot` y sigue los pasos. Te da un *token*.
2. Escríbele cualquier mensaje a tu bot nuevo.
3. En tu navegador abre `https://api.telegram.org/bot<TOKEN>/getUpdates` (con tu token) y
   copia el número de `"chat":{"id": …}`.
4. En el hosting (Vercel → *Settings → Environment Variables*, o Render → *Environment*):
   `TELEGRAM_BOT_TOKEN` = el token y `TELEGRAM_CHAT_ID` = ese número. Redespliega.

El token es un secreto: no lo pegues en chats, issues ni en Git. Si se filtra, revócalo en
@BotFather (`/revoke`) y cambia la variable.

El mensaje incluye la referencia, el total, el ID del jugador y los paquetes; no incluye el
correo ni el nombre del cliente. Si Telegram no responde, el pago queda guardado igual y el
aviso se reintenta como los correos; el panel sigue avisando.

### Aviso en el panel

Con el panel abierto (aunque la pestaña esté en segundo plano) se consulta cada minuto. Pulsa
**"Activar avisos de pedidos pagados"** una vez por sesión: el navegador pide permiso para las
notificaciones y habilita el sonido. El título de la pestaña muestra `(n) Pagados por entregar`.

## 3. Mercado Pago en producción

1. En Mercado Pago → **Tus integraciones** → tu aplicación de Checkout Pro → **Credenciales de
   producción**: copia el *Access Token* a `MP_ACCESS_TOKEN`.
2. **Webhooks** (modo productivo): URL `https://<tu-dominio>/api/webhooks/mercadopago`,
   evento **Pagos**. Copia la clave secreta a `MP_WEBHOOK_SECRET`.
3. `MP_MODE=production`, `PAYMENTS_ENABLED=true`, `CHECKOUT_ENABLED=true`. Redespliega.

Con `MP_MODE=production` desaparecen los avisos de "Modo prueba" de la tienda y el panel dice
"Mercado Pago: PRODUCCIÓN". Un pago de prueba (`live_mode=false`) nunca cuenta como pagado en
producción: va a revisión.

## 4. Textos legales

Los datos del vendedor se escriben en **Render → Environment** (nunca en Git ni en un chat); la
tienda los pone en `/terminos.html` y `/privacidad.html` al servirlas:

| Variable | Qué va |
|---|---|
| `LEGAL_NAME` | nombre o razón social |
| `LEGAL_ID` | solo los 4 últimos dígitos del NIT o la cédula (la tienda rechaza el número completo) |
| `LEGAL_ADDRESS` | dirección y ciudad |
| `LEGAL_DELIVERY_TIME` | plazo de entrega de la recarga |
| `LEGAL_REFUND_TIME` | plazo de reembolso si no se puede entregar |
| `LEGAL_RESPONSE_TIME` | plazo de respuesta a peticiones y reclamos |
| `LEGAL_TAX_NOTE` | frase sobre IVA u otros impuestos en los precios |
| `LEGAL_RETENTION` | tiempo que se conservan pedidos y pagos |

Los canales (`SUPPORT_EMAIL`, `SUPPORT_WHATSAPP`) y la versión (`TERMS_VERSION`) se toman solos.
Son datos tuyos: nadie más puede escribirlos. Con ventas en producción el servidor **no arranca**
mientras falte alguno, y `golive:check` dice cuál. Haz revisar el texto por un abogado (las notas
«REVISAR CON ABOGADO» siguen en el borrador).

## 5. Comprobar antes de abrir

```bash
# Variables (con un .env de producción en tu equipo, nunca en Git)
npm run golive:check -- --entorno
# La tienda publicada, desde fuera
npm run golive:check -- --url https://tu-dominio.com
```

Termina con `LISTO para vender.` (código 0) o lista lo que falta (código 1). Solo lee: no crea
pedidos, no paga y nunca imprime valores de variables.

## 6. Primera venta real

1. Compra tú mismo el paquete más barato con una tarjeta real.
2. Comprueba: llega el aviso, el pedido está **Pagado** en el panel, el pago aparece en tu
   cuenta de Mercado Pago con la misma referencia y te llega el correo **"Comprobante de pago"**
   (revisa también la carpeta de spam la primera vez).
3. Entrega la recarga y márcala como entregada; el seguimiento debe decir "Recarga completada"
   y te llega ese correo.
4. Prueba un reembolso desde Mercado Pago y comprueba que el pedido pasa a **Reembolsado**.

Hasta hacer este paso, el cobro real está **sin verificar**: las pruebas automáticas usan un
doble de Mercado Pago y nunca mueven dinero.
