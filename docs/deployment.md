# Despliegue (Render + PostgreSQL gestionado)

> Los nombres exactos de las opciones de Render están marcados `[A VERIFICAR]` en el panel de
> Render: no se han podido comprobar desde el entorno de desarrollo.

## Recursos

- **PostgreSQL gestionado** (≥ 16) con backups automáticos; PITR si el plan lo incluye
  `[A VERIFICAR]`.
- **Web Service** Node 24, **una sola instancia** (el rate limiting es en memoria del proceso).

## Configuración del servicio

| Opción | Valor |
|---|---|
| Build command | `npm ci && npm run build` |
| Pre-deploy command `[A VERIFICAR]` | `npm run db:migrate:prod` (si el plan no lo ofrece: ejecútalo en un *one-off job*/shell antes de promover) |
| Start command | `npm start` |
| Health check path | `/api/ready` |
| Node | 24 (`.nvmrc`) |

Las migraciones **nunca** se ejecutan al arrancar la app y no contienen `DROP` destructivos.

## Variables de entorno (Render → Environment)

Ver `.env.example`. Mínimo en producción: `NODE_ENV=production`, `PUBLIC_BASE_URL=https://…`,
`TRUST_PROXY=1`, `DATABASE_URL` (interna de Render), `ORDER_TOKEN_KEYS`,
`MFA_ENCRYPTION_KEYS`, `IP_HASH_PEPPER`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`ADMIN_EMAILS`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `SUPPORT_*`.
El servidor **no arranca** si falta algo obligatorio o si se intenta `CHECKOUT_ENABLED=true`
sin `PAYMENTS_ENABLED=true`. Los errores de configuración muestran el nombre de la variable,
nunca su valor.

## Orden de puesta en marcha

1. Crear base de datos y servicio con `CHECKOUT_ENABLED=false`, `PAYMENTS_ENABLED=false`.
2. Desplegar; comprobar `/api/health` y `/api/ready`.
3. Google Cloud: cliente OAuth "Aplicación web" con redirección
   `https://<dominio>/auth/google/callback`. Entrar en `/admin.html`, configurar TOTP y guardar
   los códigos de recuperación.
4. Cargar el catálogo real desde el panel (Catálogo).
5. Mercado Pago: credenciales de **prueba**, webhook configurado, checklist de
   `docs/specs/pagos.md`. Activar `PAYMENTS_ENABLED=true` y `CHECKOUT_ENABLED=true` en staging.
6. Credenciales de producción, misma prueba con una compra real de bajo importe y su reembolso.

## Rollback

- Código: "Rollback" al deploy anterior en Render. Las migraciones son solo aditivas, así que
  el código anterior sigue funcionando con el esquema nuevo.
- Ventas: `CHECKOUT_ENABLED=false` (los pedidos y webhooks existentes siguen procesándose).
- Emergencia: `MAINTENANCE_MODE=true` (solo lectura; los webhooks se siguen aceptando).

## Rotación de secretos

| Secreto | Cómo rotar sin cortar el servicio |
|---|---|
| `ORDER_TOKEN_KEYS` | Anteponer `2:<nueva>`; dejar `1:<anterior>` mientras haya pedidos abiertos con enlaces antiguos; retirarla después |
| `MFA_ENCRYPTION_KEYS` | Anteponer la nueva; cada secreto TOTP se re-cifra al usarse; retirar la anterior cuando todos los admin hayan entrado |
| `IP_HASH_PEPPER` | Reemplazar; se pierde la correlación con hashes antiguos (bloqueos por IP) |
| `MP_ACCESS_TOKEN` / `MP_WEBHOOK_SECRET` | Regenerar en Mercado Pago, actualizar la variable y redesplegar |
| `GOOGLE_CLIENT_SECRET` | Crear un secreto nuevo en Google Cloud, actualizar, redesplegar, borrar el anterior |
| `DATABASE_URL` | Rotar la contraseña en Render y redesplegar |
| Sesiones | Revocar desde la BD (`update sessions set revoked_at = now()`) |
