# Runbook de operación

Panel: `https://<dominio><ADMIN_PATH>`, dirección secreta (Google + allowlist + TOTP); `/admin.html` responde 404. Toda acción queda en
Auditoría.

## Día a día

1. **Alertas** (parte superior de Pedidos, se refresca cada minuto): por verificar, pagados sin
   entregar (+30 min), en revisión, pagos por reembolsar, pagos pendientes (+1 h), webhooks
   inválidos (24 h).
2. **Verificar jugador** (estado *Verificar jugador*): consultar el UID en una fuente legítima;
   registrar nickname y región, o el resultado negativo. Nunca inventar un nickname.
3. **Entregar** (estado *Pagado*): *Reclamar* → *Iniciar entrega* → recargar al UID de la orden
   → escribir la evidencia (id de transacción del proveedor) → *Marcar entregado*.
   Un reclamo sin iniciar se libera solo a los `CLAIM_TIMEOUT_MINUTES`. Si la recarga falla:
   *Marcar fallida* (la orden pasa a revisión).

## Pagos

| Situación | Qué hacer |
|---|---|
| Pedido pagado pero sigue "Esperando pago" | *Conciliar con Mercado Pago*. Si sigue igual, revisar en Mercado Pago la referencia (`external_reference` = referencia TGS) |
| `NEEDS_REFUND` (pago duplicado) | Reembolsar ese pago en el panel de Mercado Pago → *Conciliar* |
| Revisión por importe distinto | No entregar. Reembolsar en Mercado Pago → *Conciliar* → *Cerrar* |
| Revisión por pago tardío (pedido vencido) | Si el jugador sigue siendo correcto: *Reanudar entrega*. Si no: reembolsar y *Cerrar* |
| Disputa / contracargo | Responder en Mercado Pago; no entregar hasta resolverla |
| Webhooks inválidos | Revisar `MP_WEBHOOK_SECRET`; si no coincide con Mercado Pago, actualizar y redesplegar. La conciliación periódica cubre los pagos mientras tanto |

**Nunca** pedir al cliente que pague otra vez sin conciliar antes.

## Interruptores

| Variable | Uso |
|---|---|
| `CHECKOUT_ENABLED=false` | Pausar ventas nuevas |
| `PAYMENTS_ENABLED=false` | Mercado Pago caído o en revisión: los pedidos esperan, nadie paga |
| `FULFILLMENT_ENABLED=false` | Pausar entregas (proveedor de recargas caído) |
| `MAINTENANCE_MODE=true` | Solo lectura (los webhooks siguen entrando) |

## Fraude

Bloqueos (panel → Bloqueos) por correo, UID, hash de IP o cuenta de Google. Los límites por
pedido (5 unidades/paquete, 1.000.000 COP) y de pedidos abiertos los aplica el servidor.

## Usuarios maliciosos: ciclo automático de abuso

El servidor gestiona solo el ciclo **detectar → contener → revisar → expirar**
(`src/server/services/shield.ts`). Cada señal suma puntos a la huella de la IP (hash
irreversible) durante 10 minutos; con 20 puntos, bloqueo automático en **todas** las rutas.

| Señal | Puntos | Ejemplo |
|---|---|---|
| Sondeo de escáner (respuesta 404) | 10 | `/.env`, `/.git/config`, `/wp-login.php`, `*.php`, `../` |
| Petición forjada (CSRF rechazado) | 4 | Formulario de otro sitio contra el checkout |
| Código MFA incorrecto | 4 | Intentos contra el panel |
| Superar un límite (429) | 2 | Ráfagas, bots, inundación |
| 404 en la API | 1 | Probar referencias de pedidos ajenas |

- **Escalado:** 1.er bloqueo 15 min, 2.º 1 h, siguientes 24 h. Caducan solos.
- **Nunca se bloquean:** webhooks de Mercado Pago, `/api/health`, `/api/ready` y un
  administrador con MFA verificado (no te quedas fuera de tu panel).
- **No cuentan** los errores normales de un cliente (UID mal escrito, formulario incompleto):
  muchas personas comparten IP (CGNAT de operadores móviles).
- **Límites:** 600 peticiones/min por IP en cualquier ruta (`RATE_LIMIT_GLOBAL_PER_MINUTE`) más
  los límites propios de cada ruta sensible; 30 s máximos para recibir una petición
  (anti-slowloris); cuerpo máximo 64 KB.
- **MFA por cuenta:** 5 códigos incorrectos en 15 minutos bloquean la verificación de esa
  cuenta durante 15 minutos aunque el atacante cambie de IP (alerta en el panel).

**Qué hace el operador:**

1. Panel → Resumen: alertas "Bloqueos automáticos (24 h)", "IPs bloqueadas ahora" y "MFA
   bloqueado".
2. Panel → Bloqueos: motivo (`auto: probe×2, csrf×3…`), fecha y "Hasta". **Quitar** desbloquea
   al instante (falso positivo, p. ej. un cliente real tras CGNAT).
3. Para un bloqueo **permanente**: quita el automático y añade uno manual de tipo `ip_hash`
   con el mismo valor (pasa el ratón sobre la huella para verla completa) y sin caducidad.
4. "MFA bloqueado" sin haber sido tú: alguien tiene una sesión de Google de un administrador.
   Sigue "Credencial comprometida" en [`incident-response.md`](incident-response.md).
5. Ataque distribuido (muchas IPs) que satura el servicio: `MAINTENANCE_MODE=true` mientras
   tanto y activa la protección DDoS/WAF del proveedor (Render o un CDN delante).
   Un servidor solo no puede frenar un ataque volumétrico.

Ver también: [`incident-response.md`](incident-response.md), [`deployment.md`](deployment.md).
