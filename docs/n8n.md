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
| **TayGameStore · Tareas cada 10 min** | Cada 10 min | Llama a `/api/internal/jobs`: concilia pagos de Mercado Pago cuyo aviso no llegó, reintenta correos y eventos y mantiene despierta la tienda (Render Free). | Respaldo opcional (la tienda ya lo hace sola). Necesita su llave para publicarse. |
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

## Agentes IA (organización por función)

| Agente | Función | Herramientas |
|---|---|---|
| **Cerebro de operaciones** | Director: reparte cada pregunta al especialista y une las respuestas. Informe diario 7:52 a. m. | Todas las de lectura + `diagnostico_integral` + los 3 especialistas como sub-agentes |
| **Infraestructura y autorreparación** | Estado, caídas, errores de n8n; causa → solución con su habilidad **"Fallas y soluciones"** (13 fallas conocidas y su arreglo) | `diagnostico_integral`, estado en vivo, Incidentes, Estado |
| **Operación de pedidos** | Pedidos por verificar/entregar ordenados por urgencia, línea de tiempo de un pedido, ventas | Pedidos, Eventos, catálogo |
| **Marketing y ventas** | Publicaciones y campañas con precios reales, siempre como BORRADOR | Catálogo, configuración pública, Pedidos |

Todos **solo leen**: no cambian pedidos, precios ni pagos, nunca piden contraseñas y no
inventan datos. Están publicados; se usan desde la pantalla de Agentes de n8n.

## Autorreparación: qué se arregla solo y qué necesita al dueño

| Situación | Qué pasa |
|---|---|
| La tienda se durmió (Render Free) | La Vigilancia la despierta cada 5 min (60 s de espera y un reintento) |
| Un evento de pedido no llegó a n8n | La tienda lo reintenta sola (1, 5, 15, 60 min) |
| Un aviso de Mercado Pago no llegó | La conciliación interna consulta el pago cada 2 min |
| Un flujo falla en producción | El flujo **Errores** lo anota en *Incidentes* y avisa (Gmail al conectarlo) |
| Falta una credencial o variable | No se repara sola: el **Diagnóstico integral** la marca como PENDIENTE y el agente de Infraestructura dice dónde configurarla |

El flujo **TayGameStore · Diagnóstico integral** revisa todo junto (tienda, base de datos,
catálogo, pagos, login, correos, soporte, verificación de ID, webhook de Pedidos y latidos) y
devuelve cada punto como OK, PENDIENTE o FALLA. Lo usan los agentes.

**Tareas cada 10 min** es un respaldo opcional: la tienda ya ejecuta sus tareas con su
programador interno. No lo publiques ni lo pruebes sin su credencial (daría "Credentials not
found").

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
