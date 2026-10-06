# Automatización con n8n

Todo está en tu n8n (`taygamestore.app.n8n.cloud`), carpeta **TayGameStore**. Ningún flujo
guarda llaves: cada una va en una **credencial** de n8n que creas tú en la pantalla de n8n.
Los valores están en el archivo `render-variables.env` que te entregué (nunca los pegues en
chats ni en GitHub).

## La lógica general

```
            TIENDA (Render)                                    n8n
 ┌───────────────────────────────────┐       ┌────────────────────────────────────────────┐
 │ Cliente crea pedido ──────────────┼─evento─▶ Pedidos: "1 · Por verificar ID" + Gmail   │
 │ Dueño verifica ID/nickname/región │       │                                            │
 │ Cliente confirma y paga (MP) ─────┼─evento─▶ Pedidos: "3 · Pagado: por entregar" + Gmail│
 │ Dueño entrega en el panel ────────┼─evento─▶ Pedidos: "4 · Entregado"                  │
 │ Reembolso de Mercado Pago ────────┼─evento─▶ Pedidos: "✕ Reembolsado"                 │
 │                                   │       │                                            │
 │ /api/internal/jobs ◀──────────────┼───────┤ Tareas cada 10 min (concilia y reintenta)  │
 │ /api/ready ◀──────────────────────┼───────┤ Vigilancia cada 5 min (avisa si cae)       │
 └───────────────────────────────────┘       │ Errores: cualquier fallo → Incidentes      │
                                             │ Cerebro (agente): lee todo e informa       │
                                             └────────────────────────────────────────────┘
```

La tienda es la única fuente de verdad (pedidos, pagos, entregas). n8n **solo registra, vigila
y avisa**: nunca cambia un pedido ni confirma un pago.

## Flujos

| Flujo | Cuándo | Qué hace | Estado |
|---|---|---|---|
| **TayGameStore · Pedidos** | Cada evento de la tienda | 1) Valida el formato (si no, lo anota en *Incidentes*) y descarta duplicados por `eventId`. 2) Actualiza **una fila por pedido** en *Pedidos* con su etapa y la hora del paso, y guarda el evento en *Eventos*. 3) Si está por verificar o pagado, te escribe por Gmail con ID, paquetes, total y plazo. Si algo falla responde error y la tienda reintenta sola. | Probado: ciclo completo y duplicado. Necesita credenciales para publicarse. |
| **TayGameStore · Tareas cada 10 min** | Cada 10 min | Llama a `/api/internal/jobs`: concilia pagos de Mercado Pago cuyo aviso no llegó, reintenta correos y eventos y mantiene despierta la tienda (Render Free). | Necesita su llave para publicarse. |
| **TayGameStore · Vigilancia cada 5 min** | Cada 5 min | Consulta `/api/ready` (60 s de espera y un reintento). Solo cuando la tienda **cae o se recupera**: guarda el estado, lo anota en *Incidentes* y te escribe. | **Publicado.** Gmail en pausa hasta conectarlo. |
| **TayGameStore · Errores** | Cuando otro flujo falla | Flujo de error de los tres anteriores: anota el fallo en *Incidentes* y te escribe con el enlace a la ejecución. | **Publicado.** Gmail en pausa hasta conectarlo. |

## Tablas (Data tables)

- **TayGameStore · Pedidos** — una fila por pedido (`referencia`): `etapa` actual
  (`1 · Por verificar ID`, `2 · Esperando pago`, `3 · Pagado: por entregar`, `4 · Entregado`,
  `✕ Reembolsado`…), total, ID y nickname del jugador, paquetes, plazo (`venceEn`) y la hora de
  cada paso (`porVerificarEn`, `pagadoEn`, `entregadoEn`, `reembolsadoEn`). Nunca el correo ni
  el nombre del cliente.
- **TayGameStore · Eventos** — historial: un registro por evento recibido (`eventId`).
- **TayGameStore · Incidentes** — caídas y recuperaciones, tareas fallidas, eventos rechazados y
  fallos de cualquier flujo.
- **TayGameStore · Estado** — último estado de la tienda (la vigilancia avisa solo al cambiar).

## Agente: TayGameStore · Cerebro de operaciones

Agente de n8n (modelo `openai/gpt-oss-120b` en Groq, con tu credencial "Groq account") que
actúa como jefe de operaciones, ingeniería y marketing. **Solo lee**: estado en vivo,
configuración pública, catálogo real y las cuatro tablas. No puede cambiar pedidos, precios ni
pagos.

- Pregúntale: "¿qué pedidos tengo por verificar o por entregar?", "¿cómo va la tienda?",
  "escríbeme un post para Instagram con los paquetes actuales".
- **Informe diario** a las 7:52 a. m. (Bogotá): lo que requiere acción ya, estado, incidentes,
  ventas de las últimas 24 h, una idea de publicación (BORRADOR) y siguientes pasos.
- Queda como **borrador**: actívalo con **Publish** en la pantalla del agente cuando lo hayas
  probado.

## Activar lo que falta (unos 5 minutos)

En n8n → **Credentials** → **Add credential**:

1. **Gmail · taygamerstore** — tipo _Gmail OAuth2_ → **Sign in with Google** con
   `taygamerstore@gmail.com`. Nunca escribas la contraseña de Gmail en n8n.
2. **TayGameStore · Llave de eventos** — tipo _Header Auth_. Name: `Authorization`. Value:
   `Bearer ` seguido de `EVENTS_WEBHOOK_SECRET`.
3. **TayGameStore · Llave de tareas** — tipo _Custom Auth_ con plantilla (la que pide el nodo).
   Encabezado `Authorization` con el valor `Bearer ` seguido de `CRON_SECRET`.

Después:

- **Pedidos**: elige las credenciales 1 y 2 en sus nodos → **Publish**.
- **Tareas**: elige la credencial 3 → **Publish**.
- **Vigilancia** y **Errores**: elige la credencial 1 en el nodo de Gmail, actívalo (clic
  derecho → _Activate_) → **Publish**.

> No publiques _Tareas_ sin la llave correcta: la tienda responde 404 a llaves equivocadas y su
> escudo anti-abuso puede bloquear temporalmente a quien insiste.

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
    "status": "estado actual del pedido al enviar",
    "totalCop": 25900,
    "currency": "COP",
    "expiresAt": "plazo para verificar o pagar (o null)",
    "playerUid": "…",
    "nickname": "… o null si aún no se verificó",
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
