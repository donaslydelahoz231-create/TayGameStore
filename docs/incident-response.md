# Respuesta a incidentes y recuperación ante desastres

Para cada incidente: **detectar → contener → recuperar → verificar → comunicar → postmortem**
(documento breve en `docs/postmortems/` con causa, impacto, línea de tiempo y acciones).

| Incidente | Detectar | Contener | Recuperar | Verificar |
|---|---|---|---|---|
| PostgreSQL caído | `/api/ready` 503; health check de Render; errores 5xx | `MAINTENANCE_MODE=true` si dura | Restablecer en Render; si hay corrupción, restaurar backup (abajo) | `/api/ready` 200; conciliar pedidos `Esperando pago` |
| Mercado Pago caído | Errores `PAYMENT_PROVIDER_UNAVAILABLE`; alertas de pagos pendientes | `PAYMENTS_ENABLED=false` si persiste | Reactivar; la conciliación aplica los pagos ocurridos | Sin `NEEDS_REVIEW` inesperados |
| Despliegue defectuoso | 5xx tras deploy; CI | Rollback en Render | Corregir y redesplegar | Suite e2e verde en staging |
| Credencial comprometida | Aviso del proveedor; gitleaks; accesos extraños en Auditoría | Revocar/rotar (ver `deployment.md`); revocar sesiones | Redesplegar con secretos nuevos | Auditoría sin accesos posteriores |
| Corrupción de datos | Inconsistencias en el panel; constraints violadas en logs | `MAINTENANCE_MODE=true` | Restaurar PITR al momento previo y conciliar con Mercado Pago | Totales y pagos coinciden con Mercado Pago |
| Caída del servidor | Health check | Render reinicia | Las tareas programadas reanudan expiración y conciliación | Logs `job finished` |
| Ataque de un usuario malicioso (escaneo, fuerza bruta, CSRF, ráfagas) | Alertas de seguridad del panel; logs `señal de abuso` / `bloqueo automático` | Automático: bloqueo escalonado de la huella de IP (ver `runbook.md`) | Bloqueo manual permanente si persiste; revisar Auditoría de lo que alcanzó a hacer | Sin nuevas alertas; accesos y pedidos normales |
| Saturación (ataque distribuido / DDoS) | Latencias y 5xx; muchas IPs distintas en logs | `MAINTENANCE_MODE=true`; protección DDoS del proveedor o CDN | Retirar el modo mantenimiento cuando baje el tráfico | `/api/ready` 200 y tiempos normales |
| Incidente de pagos (cobro doble, importe incorrecto) | Alertas `NEEDS_REFUND` / revisión | No entregar | Reembolsar en Mercado Pago → Conciliar | Pago `REFUNDED` y orden cerrada |

## Backups y restauración

- Backups automáticos del PostgreSQL gestionado (y PITR si el plan lo ofrece `[A VERIFICAR]`).
- **Un backup no es fiable hasta probar su restauración.** Prueba trimestral: restaurar en una
  base nueva, apuntar un servicio de staging, ejecutar `npm run db:migrate:prod` (no debe haber
  cambios), revisar pedidos recientes y conciliar con Mercado Pago. Registrar fecha y resultado.
- `audit_events` es append-only (trigger en BD): sirve para reconstruir la línea de tiempo.

## Comunicación

Avisar a los clientes afectados por el canal de soporte configurado con la referencia del
pedido. Nunca pedir contraseñas ni datos de tarjeta.
