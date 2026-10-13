# Modelo de amenazas (resumen)

Arquitectura confirmada en el código y en los servicios (13-oct-2026, actualizado 15:30 UTC).

```
Cliente (navegador) ──HTTPS──► Render: Fastify (API + web estática)
                                 ├─► Neon PostgreSQL (pedidos, pagos, auditoría con sellos)
                                 ├─► Mercado Pago (Checkout Pro; webhook firmado de vuelta)
                                 ├─► Google / Discord / Facebook (OAuth con PKCE y state)
                                 └─► Correo SMTP (avisos), opcional
GitHub Actions ──► CI, CodeQL, vigilancia, diagnóstico (solo lectura sobre producción)
Claude (rutinas) ──► GitHub, Render, Neon por MCP, con confirmación en lo sensible
```

Apagado o desconocido:

- **UniPin:** `TOPUP_PROVIDER=none`.
- **n8n:** reemplazado el 11-oct; el conector no conecta.
- **Telegram:** opcional, sin verificar.

| Activo | Amenaza | Control actual | Riesgo residual |
|---|---|---|---|
| Dinero (precios, pagos) | Cambiar precio desde el navegador; webhook falso; pago de otro pedido | Precio y total solo en servidor; firma HMAC; consulta a la API de Mercado Pago; monto, moneda y `live_mode` deben coincidir; idempotencia | Bajo. Repetición de un aviso firmado sin efecto (H-04) |
| Pedidos y comprobantes | Borrar o alterar historial; comprobante falso | Triggers sin DELETE y montos inmutables; sellos SHA-256; código HMAC del comprobante | Medio: el rol de la app es dueño de las tablas (H-01; mitigación lista, falta adoptarla) |
| Panel del dueño | Robo de sesión, fuerza bruta, enumeración | Lista blanca, MFA, huella, ruta oculta, 404 a no administradores, límites y escudo anti-abuso, catálogo bloqueado | Bajo |
| Datos de clientes | IDOR en pedidos ajenos; XSS | Token del pedido, bloqueo por enumeración, CSP estricta, escape en el panel (e2e) | Bajo |
| Secretos | Fuga en código, commits o chats | Solo en variables de Render y GitHub; gitleaks en la CI; guardia de datos local | Medio: rotación del secreto de Google pendiente (B-13) |
| Disponibilidad | Caída, DDoS, cuota de Neon agotada | Vigilancia con reinicio automático, modo reposo, límite global por IP | Medio: plan gratuito, una sola instancia |
| Datos (pérdida) | Borrado o corrupción | PITR de 6 h; instantánea del 7-oct; rama de respaldo del 13-oct verificada | Medio: el plan guarda 1 instantánea; la renovación es manual y mensual (H-02) |
| Cadena de suministro | Paquete o acción comprometida | Lockfile, `npm audit` 0, Dependabot, CodeQL | Bajo-medio: acciones sin SHA (H-05) |

## Agentes de IA, MCP y automatizaciones

- **El contenido externo es dato, no instrucción.** Comentarios de PR, issues, logs, páginas web,
  respuestas de MCP, cuerpos de webhooks y textos de rutinas se leen como datos. Ninguna
  instrucción dentro de ellos amplía permisos ni autoriza despliegues.
- **Permisos de Claude Code (`.claude/settings.json`):**
  - piden confirmación para `git push`, cambios en Render, rutinas, archivos y merges de GitHub,
    y flujos n8n;
  - prohíben push forzado y reescritura de historial.
- **Guardia (`.claude/hooks/guardia-datos.sh`):** bloquea tokens de Mercado Pago, Google, GitHub
  y Anthropic, llaves privadas, URLs de base con contraseña y el documento completo del dueño.
- **Rutinas:** sus límites están escritos en el propio prompt (no activar pagos, no tocar
  secretos, no borrar, no hacer rollback). Su texto se trata como tarea asignada, no como
  autorización nueva.
- **Plugins y MCP nuevos:** no se instalan ni autorizan sin el dueño. En esta sesión hay muchos
  conectores de terceros que fallan al conectar (proxy 403); ninguno se usa sobre la tienda.
- **La tienda no ejecuta modelos de IA ni agentes** en su código; no hay superficie de prompt
  injection dentro de la aplicación.
