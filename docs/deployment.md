# Despliegue (Render + PostgreSQL gestionado)

> Lo hace el propietario con sus cuentas: Claude no tiene (ni debe tener) acceso a Render,
> Google Cloud, Mercado Pago ni al dominio. Los nombres de menús de esos paneles cambian con el
> tiempo; donde no se pudieron comprobar desde el entorno de desarrollo dice `[A VERIFICAR]`.

## 1. Render con el Blueprint (`render.yaml`)

El repositorio incluye [`render.yaml`](../render.yaml) (validado por
`tests/unit/render-blueprint.test.ts` contra la configuración real del servidor):

| Recurso | Configuración |
|---|---|
| Web Service | Node 24, plan `starter` (el gratuito se suspende y rompería webhooks y tareas), **1 instancia** (rate limiting en memoria), región `virginia` (la más cercana a Colombia) `[A VERIFICAR]` |
| Build | `npm ci --include=dev && npm run build` — con `NODE_ENV=production` npm omitiría Vite y TypeScript |
| Pre-deploy | `npm run db:migrate:prod` (migraciones solo aditivas; nunca al arrancar) |
| Health check | `/api/ready` (comprueba la base de datos) |
| PostgreSQL 16 | plan de pago con backups (`basic-256mb` `[A VERIFICAR]`), sin acceso desde Internet (`ipAllowList: []`) |

Pasos: Render → **New → Blueprint** → elige este repositorio → Render pide los valores marcados
`sync: false` (secretos). Genera las claves en tu computador:

```bash
node -e "console.log('1:'+require('crypto').randomBytes(32).toString('base64'))"  # ORDER_TOKEN_KEYS
node -e "console.log('1:'+require('crypto').randomBytes(32).toString('base64'))"  # MFA_ENCRYPTION_KEYS (otra)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"       # IP_HASH_PEPPER
```

El Blueprint arranca con `CHECKOUT_ENABLED=false`, `PAYMENTS_ENABLED=false` y `MP_MODE=sandbox`.
El servidor **no arranca** si falta una variable obligatoria (muestra el nombre, nunca el valor).

## 2. Dominio

1. Compra el dominio en un registrador.
2. Render → servicio → **Settings → Custom Domains** → añade `tudominio.com` y `www.tudominio.com`.
3. Crea en tu DNS los registros que Render indique (CNAME a `…onrender.com` para `www`; para el
   dominio raíz, el registro que muestre Render). Render emite el certificado HTTPS.
4. `PUBLIC_BASE_URL=https://tudominio.com` (sin barra final) y redeploy.

## 3. Google OAuth (acceso de administración y clientes)

1. [Google Cloud Console](https://console.cloud.google.com/) → crea un proyecto.
2. **Pantalla de consentimiento / Google Auth Platform** `[A VERIFICAR nombre del menú]`: tipo
   *Externo*, nombre de la app, correo de soporte, dominio autorizado `tudominio.com`, enlaces a
   `https://tudominio.com/privacidad.html` y `/terminos.html`. Ámbitos: `openid`, `email`,
   `profile`. Publica la app (en modo *Testing* solo entran los usuarios de prueba).
3. **Credenciales → Crear ID de cliente OAuth → Aplicación web**. URI de redirección autorizada:
   `https://tudominio.com/auth/google/callback` (y la de staging si la usas).
4. Copia ID y secreto a `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`; tu correo en
   `ADMIN_EMAILS` y una dirección secreta para el panel en `ADMIN_PATH` (por ejemplo
   `/gestion-k7Q2x9LmP4vR`: `/` y de 12 a 64 letras, números, `-` o `_`; inventa la tuya y no la
   compartas). Sin `ADMIN_PATH` el servidor no arranca en producción si hay `ADMIN_EMAILS`.
5. Entra a `https://tudominio.com<ADMIN_PATH>` (tu dirección secreta), configura el TOTP y **guarda los códigos de
   recuperación** fuera del computador.

### Discord y Facebook (acceso de clientes, opcional)

Cada red aparece como **Disponible** en la tienda solo cuando sus dos variables están puestas;
si no, el botón queda deshabilitado (nunca hay un acceso de mentira). Nunca dan acceso de
administración: el panel exige Google + `ADMIN_EMAILS` + TOTP.

- **Discord** ([documentación](https://docs.discord.com/developers/topics/oauth2)):
  [Developer Portal](https://discord.com/developers/applications) → New Application →
  **OAuth2** → copia *Client ID* y *Client Secret* (`DISCORD_CLIENT_ID`,
  `DISCORD_CLIENT_SECRET`) → *Redirects*: `https://tudominio.com/auth/discord/callback`.
  Ámbitos que pide la tienda: `identify email`.
- **Facebook** ([flujo manual](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/)):
  [Meta for Developers](https://developers.facebook.com/apps) → crea una app de tipo
  consumidor → producto **Inicio de sesión con Facebook** → *URI de redireccionamiento de
  OAuth válidos*: `https://tudominio.com/auth/facebook/callback` → copia el *Identificador de
  la app* y la *Clave secreta* (`FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`). Pon la app en modo
  **Activo** (en desarrollo solo entran los evaluadores). Revisa la versión vigente de la Graph
  API y ajusta `FACEBOOK_GRAPH_VERSION` si hace falta.

**Vincular cuentas:** con la sesión abierta, "Mi cuenta → Cuentas vinculadas → Vincular …".
Una cuenta de red social pertenece a un solo usuario y **nunca se une por correo** (evita que
alguien se apodere de una cuenta ajena con un correo sin verificar).

**VK ID** no está incluido: migró a un protocolo nuevo cuya documentación oficial no se pudo
verificar; se puede añadir con esa documentación y una app registrada.

## 4. Catálogo y precios reales

En el panel (`ADMIN_PATH`) → **Catálogo**: crea cada paquete (SKU, nombre, unidades, precio en COP, promo
opcional con fecha de fin, orden). Los precios los decides tú; `npm run db:seed:dev` solo carga
los del HTML original como **ejemplo** y no se usa en producción. El servidor recalcula todo al
crear el pedido: el navegador nunca decide el precio.

## 5. Textos legales

`src/web/terminos.html` y `src/web/privacidad.html` son **borradores técnicos** que describen
cómo funciona la tienda. Completa cada `[COMPLETAR: …]`, haz que un abogado revise los puntos
`[REVISAR CON ABOGADO]`, pon en `TERMS_VERSION` la misma fecha de los términos y despliega.
**Garantía:** en producción, con `CHECKOUT_ENABLED=true`, el servidor no arranca si alguna de
las dos páginas falta o conserva "[COMPLETAR". Única excepción: con `PAYMENTS_ENABLED=true` y
`MP_MODE=sandbox` (pagos de prueba, sin dinero real) se puede probar la compra completa antes
de terminar los textos; al pasar a `MP_MODE=production` el bloqueo vuelve a aplicarse.

## 6. Orden de puesta en marcha

1. Blueprint aplicado → `/api/health` y `/api/ready` responden 200.
2. Dominio + `PUBLIC_BASE_URL` → Google OAuth → TOTP del administrador.
3. Catálogo real cargado desde el panel.
4. **Sandbox** de Mercado Pago completo: [`sandbox-mercadopago.md`](sandbox-mercadopago.md)
   (`MP_MODE=sandbox`, credenciales de la cuenta vendedora de prueba, webhook del dominio).
   Activa `PAYMENTS_ENABLED=true` y luego `CHECKOUT_ENABLED=true`.
5. Textos legales completos y revisados.
6. Producción: credenciales reales, `MP_MODE=production`, webhook con su clave, una compra real
   de bajo importe y su reembolso. El panel debe decir "Mercado Pago: PRODUCCIÓN".

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
