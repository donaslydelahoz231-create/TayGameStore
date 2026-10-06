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
| **Aviso al dueño**: notificación + sonido + contador en el panel y, si lo configuras, mensaje de Telegram | Servidor / panel | Sí |
| Recargar los diamantes al ID del jugador | **Tú**, con tu canal de recarga | **No**: entrega manual (ver abajo) |
| Marcar el pedido como entregado con la evidencia | Tú, en el panel | — |
| El cliente ve "Recarga completada" en su seguimiento | Tienda | Sí |

### Por qué la entrega es manual

No existe una API pública de Garena para recargar diamantes. La recarga automática solo es
posible con un **distribuidor autorizado** que te dé acceso a su API con contrato. Mientras no
lo tengas, la tienda no inventa uno: cada pedido pagado se entrega desde el panel
(*Tomar → Iniciar → Entregar* con la evidencia). Si no puedes entregar un pedido, reembólsalo
desde Mercado Pago; el reembolso llega por webhook y el pedido pasa a **Reembolsado**.

Cuando contrates un distribuidor, el punto de conexión ya existe (`FULFILLMENT_MODE` y el
puerto de verificación de jugador); se integra con su documentación oficial, nunca antes.

## 1. Aviso a tu celular por Telegram (opcional, recomendado)

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
fallo se registra (`alert: owner_notify_failed`); el panel sigue avisando.

### Aviso en el panel

Con el panel abierto (aunque la pestaña esté en segundo plano) se consulta cada minuto. Pulsa
**"Activar avisos de pedidos pagados"** una vez por sesión: el navegador pide permiso para las
notificaciones y habilita el sonido. El título de la pestaña muestra `(n) Pagados por entregar`.

## 2. Mercado Pago en producción

1. En Mercado Pago → **Tus integraciones** → tu aplicación de Checkout Pro → **Credenciales de
   producción**: copia el *Access Token* a `MP_ACCESS_TOKEN`.
2. **Webhooks** (modo productivo): URL `https://<tu-dominio>/api/webhooks/mercadopago`,
   evento **Pagos**. Copia la clave secreta a `MP_WEBHOOK_SECRET`.
3. `MP_MODE=production`, `PAYMENTS_ENABLED=true`, `CHECKOUT_ENABLED=true`. Redespliega.

Con `MP_MODE=production` desaparecen los avisos de "Modo prueba" de la tienda y el panel dice
"Mercado Pago: PRODUCCIÓN". Un pago de prueba (`live_mode=false`) nunca cuenta como pagado en
producción: va a revisión.

## 3. Textos legales

`src/web/terminos.html` y `src/web/privacidad.html` tienen campos `[COMPLETAR…]` (razón social,
NIT o cédula, domicilio, plazo de entrega, canales oficiales…). Son datos tuyos: nadie más
puede escribirlos. Con ventas en producción el servidor **no arranca** mientras queden.

## 4. Comprobar antes de abrir

```bash
# Variables (con un .env de producción en tu equipo, nunca en Git)
npm run golive:check -- --entorno
# La tienda publicada, desde fuera
npm run golive:check -- --url https://tu-dominio.com
```

Termina con `LISTO para vender.` (código 0) o lista lo que falta (código 1). Solo lee: no crea
pedidos, no paga y nunca imprime valores de variables.

## 5. Primera venta real

1. Compra tú mismo el paquete más barato con una tarjeta real.
2. Comprueba: llega el aviso, el pedido está **Pagado** en el panel, el pago aparece en tu
   cuenta de Mercado Pago con la misma referencia.
3. Entrega la recarga y márcala como entregada; el seguimiento debe decir "Recarga completada".
4. Prueba un reembolso desde Mercado Pago y comprueba que el pedido pasa a **Reembolsado**.

Hasta hacer este paso, el cobro real está **sin verificar**: las pruebas automáticas usan un
doble de Mercado Pago y nunca mueven dinero.
