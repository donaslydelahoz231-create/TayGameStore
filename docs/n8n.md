# Automatización con n8n

Todo está en tu n8n (`taygamestore.app.n8n.cloud`), carpeta **TayGameStore**. Ningún flujo
guarda llaves: cada una va en una **credencial** de n8n que creas tú en la pantalla de n8n.
Los valores están en el archivo `render-variables.env` que te entregué (nunca los pegues en
chats ni en GitHub).

## Flujos

| Flujo | Cuándo | Qué hace | Credencial que necesita |
|---|---|---|---|
| **TayGameStore · Tareas cada 10 min** | Cada 10 min | Llama a `/api/internal/jobs`: concilia pagos de Mercado Pago cuyo aviso no llegó, reintenta correos y eventos y, en Render Free, mantiene la tienda despierta. Si falla, lo anota en *Incidentes*. | **TayGameStore · Llave de tareas** |
| **TayGameStore · Vigilancia cada 5 min** | Cada 5 min | Consulta `/api/ready`. Solo cuando la tienda **cae o se recupera**: guarda el estado, lo anota en *Incidentes* y te escribe a `taygamerstore@gmail.com`. | **Gmail · taygamerstore** |
| **TayGameStore · Pedidos** | Cuando la tienda avisa | Recibe cada pedido **por verificar**, pagado, entregado o reembolsado y lo guarda en la tabla *Pedidos* sin duplicados. Si el pedido espera verificación de ID o ya está pagado, te escribe por Gmail ("Verifica el ID …" / "Pedido pagado por entregar …") con UID, paquetes, total y plazo. Rechaza (y anota) lo que no tenga el formato de la tienda. | **TayGameStore · Llave de eventos** y **Gmail · taygamerstore** |

## Agente: TayGameStore · Cerebro de operaciones

Agente de n8n (modelo `openai/gpt-oss-120b` en Groq, con tu credencial "Groq account") que
actúa como jefe de operaciones, ingeniería y marketing. **Solo lee**: estado en vivo
(`/api/ready`), configuración pública, catálogo real y las tres tablas. No puede cambiar
pedidos, precios ni pagos.

- Pregúntale en el chat del agente: "¿cómo va la tienda?", "¿qué pedidos pagados faltan por
  entregar?", "escríbeme un post para Instagram con los paquetes actuales".
- Tarea programada **Informe diario de la tienda** a las 7:52 a. m. (Bogotá): estado,
  incidentes y pedidos de las últimas 24 h, una idea de publicación (BORRADOR) y siguientes
  pasos.
- Reglas fijas: nunca inventa precios ni datos, nunca confirma pagos, nunca pide contraseñas y
  todo texto de marketing sale como BORRADOR para que lo apruebes.

Queda como **borrador**: actívalo con **Publish** en la pantalla del agente cuando lo hayas
probado.

## Tablas (Data tables)

- **TayGameStore · Pedidos** — un registro por evento (`eventId`): referencia, estado, total,
  paquetes, ID y nickname del jugador. Nunca el correo ni el nombre del cliente.
- **TayGameStore · Incidentes** — fallos de tareas, caídas y recuperaciones, eventos rechazados.
- **TayGameStore · Estado** — último estado conocido de la tienda (lo usa la vigilancia para
  avisarte solo cuando cambia).

Las dos primeras filas de *Incidentes* dicen "PRUEBA de configuración (simulada)": son la
comprobación de la vigilancia hecha al crearla.

## Activar (unos 5 minutos)

En n8n → **Credentials** → **Add credential**:

1. **TayGameStore · Llave de tareas** — tipo *Custom Auth* con plantilla (la que el flujo pide).
   Encabezado `Authorization` con el valor `Bearer ` seguido de `CRON_SECRET`.
2. **TayGameStore · Llave de eventos** — tipo *Header Auth*. Name: `Authorization`. Value:
   `Bearer ` seguido de `EVENTS_WEBHOOK_SECRET`.
3. **Gmail · taygamerstore** — tipo *Gmail OAuth2* → **Sign in with Google** con
   `taygamerstore@gmail.com`. Nunca escribas la contraseña de Gmail en n8n.

Después abre cada flujo, selecciona su credencial en el nodo marcado en rojo y pulsa
**Publish**. Orden recomendado: Pedidos → Tareas → Vigilancia.

> No publiques *Tareas* sin la llave correcta: la tienda responde 404 a llaves equivocadas y
> su escudo anti-abuso puede bloquear temporalmente a quien insiste.

## Lado de la tienda (Render)

| Variable | Valor |
|---|---|
| `EVENTS_WEBHOOK_URL` | `https://taygamestore.app.n8n.cloud/webhook/taygamestore-pedidos` (https obligatorio en producción) |
| `EVENTS_WEBHOOK_SECRET` | llave aleatoria de 32+ caracteres (la misma de la credencial de eventos) |
| `CRON_SECRET` | la misma de la credencial de tareas |

El evento que envía la tienda (`POST`, `Authorization: Bearer …`, `x-tgs-event-id`):

```json
{
  "id": "uuid estable del evento",
  "event": "order.awaiting_verification | order.paid | order.delivered | order.refunded",
  "occurredAt": "2026-10-06T17:00:00.000Z",
  "order": {
    "reference": "TGS-…",
    "status": "PAID",
    "totalCop": 25900,
    "currency": "COP",
    "expiresAt": "plazo para verificar o pagar (o null)",
    "playerUid": "…",
    "nickname": "…",
    "items": [{ "name": "100 + 10 Diamantes", "quantity": 2 }]
  }
}
```

Sale por la misma cola que los correos: se crea en la transacción que cambia el pedido, se envía
al confirmarla y, si n8n no responde 2xx en 5 s, se reintenta (1, 5, 15 y 60 min; tras 5
intentos queda como alerta "Avisos sin enviar" en el panel). No sigue redirecciones, para que la
llave nunca viaje a otra dirección.

## Si ya usas GitHub Actions

`tareas.yml` (GitHub) y el flujo de n8n hacen lo mismo; puedes dejar ambos (las tareas usan
bloqueos y no se pisan) o quitar uno. n8n es más puntual que el cron de GitHub.
