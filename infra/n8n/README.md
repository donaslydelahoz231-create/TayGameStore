# Copia de los flujos de n8n

Respaldo de los flujos de TayGameStore en `taygamestore.app.n8n.cloud` (carpeta «TayGameStore»),
exportados el 2026-10-07. Sin secretos: las credenciales aparecen solo por nombre e id, y la huella
de la llave de eventos de **Pedidos** está reemplazada por un marcador.

| Archivo | Flujo |
|---|---|
| `pedidos.json` | Pedidos: recibe los eventos de la tienda (llave por huella SHA-256) |
| `vigilancia.json` | Vigilancia cada 5 min (`/api/health`; `/api/ready` una vez por hora) |
| `errores.json` | Errores: incidentes y aviso por Gmail |
| `diagnostico.json` | Diagnóstico integral (herramienta de los agentes) |
| `tareas.json` | Tareas: respaldo apagado a propósito (no publicar) |

## Restaurar un flujo

1. n8n → **Create workflow** → menú **⋯** → **Import from file** → el `.json`.
2. Conecta la credencial de Gmail de la cuenta de la tienda en los nodos de Gmail.
3. Solo en **Pedidos**: en el nodo **¿Llave correcta?** pon la huella de la llave actual
   (`printf 'Bearer %s' "<EVENTS_WEBHOOK_SECRET>" | sha256sum`, en tu equipo). Nunca la escribas
   en un chat ni en Git.
4. **Publish**. Si el flujo importado tiene otro id, actualiza `EVENTS_WEBHOOK_URL` solo si cambió
   la ruta del webhook (`taygamestore-pedidos`).
