# Publicar la tienda gratis: Render + Neon

Costo: **0**. Necesitas una cuenta de GitHub (ya la tienes) y unos 20 minutos. Todo se hace con
"Iniciar sesión con GitHub"; no se escribe código.

| Pieza | Servicio gratuito | Para qué |
|---|---|---|
| Servidor de la tienda | **Render** (plan Free) | Página, API, pagos, panel |
| Base de datos | **Neon** (plan Free) | Pedidos, catálogo, clientes |
| Tareas del servidor | Programador interno de TayGameStore | Gestiona expiración de pedidos, conciliación y avisos; entra en modo reposo para limitar el uso de Neon |
| Vigilancia cada 30 min | **GitHub Actions** (gratis en repositorios públicos) | Comprueba `/api/ready` y registra incidentes |

## 1. Base de datos en Neon

1. Entra a **neon.tech** → *Sign up* → **Continue with GitHub**.
2. Crea un proyecto: nombre `taygamestore`, versión de PostgreSQL **16**, región **AWS US East**
   (la más cercana a Colombia entre las disponibles).
3. En *Connection Details* copia la cadena de conexión (empieza por `postgresql://` y termina en
   `?sslmode=require`). Es un **secreto**: no la pegues en chats ni en GitHub.

## 2. Tienda en Render

1. En el README del repositorio pulsa **Deploy to Render** (o entra a render.com → *New* →
   *Blueprint* y elige el repositorio `TayGameStore`). Inicia sesión con GitHub y autoriza el
   repositorio.
2. Render lee `render.yaml` y te pide los valores marcados como secretos. Pega los del archivo
   `render-variables.env` que te entregué (claves ya generadas) y, en `DATABASE_URL`, la cadena
   de Neon. Lo que aún no tengas (Google, Mercado Pago, `SMTP_PASS`) se deja vacío por ahora.
3. Pulsa **Apply**. La primera compilación tarda unos minutos y crea las tablas en Neon.
4. Render te da una dirección como `https://taygamestore.onrender.com`. Si es distinta de la que
   pusiste en `PUBLIC_BASE_URL`, corrígela en *Environment* y guarda (se vuelve a desplegar).
5. Comprueba en el navegador: `https://<tu-dirección>/api/ready` debe decir `"status":"ready"`.

## 3. Vigilancia e incidentes (GitHub Actions)

La vigilancia consulta `https://taygamestore.onrender.com/api/ready` cada 30 minutos por defecto; no necesita `PRODUCTION_URL` para el dominio actual. Si el dominio cambia, configura esa variable en GitHub Actions.

Si deseas recuperación automática por redespliegue, crea el secreto `RENDER_DEPLOY_HOOK_URL` con la URL privada del Deploy Hook de Render. Sin ese secreto, la vigilancia registra el incidente y avisa sin reiniciar el servicio. Habilítalo solo después de aceptar ese comportamiento y comprobar la política de recuperación.

**No configures `PRODUCTION_URL` solo para arreglar la vigilancia.** Esa variable también activa la condición de ejecución del workflow `Tareas programadas`. Este workflow permanece en espera intencional para evitar consumo adicional en Neon Free; el servidor ya dispone de un programador interno.

Solo si decides activar el workflow de respaldo de tareas: configura `PRODUCTION_URL` y el secreto `CRON_SECRET` con el mismo valor que el servidor, revisa el consumo de cómputo de Neon y valida en staging que los trabajos idempotentes no dupliquen conciliaciones, correos ni entregas. No lo actives como arreglo automático sin esas verificaciones.

## 4. Lo que hay que saber del plan gratuito

- **Se duerme sin tráfico.** El programador interno entra en modo reposo cuando no hay trabajo pendiente para reducir el consumo de Neon. La vigilancia de GitHub Actions revisa cada 30 minutos y puede despertar la base de datos durante la comprobación; no mantiene la tienda despierta continuamente. Mercado Pago reintenta sus notificaciones y la tienda concilia pagos cuando corresponde.
- **Horas gratuitas al mes.** Render da un cupo mensual de horas gratuitas por cuenta; según su
  documentación actual alcanza para un servicio encendido todo el mes. Revísalo en
  render.com/pricing: si se agotara, el servicio se detiene hasta el mes siguiente.
- **Neon gratuito** tiene límites de almacenamiento y cómputo (neon.tech/pricing). Una tienda que
  empieza queda muy por debajo.
- **Despliegues**: en el plan gratuito, al publicar una versión nueva hay unos segundos sin
  servicio.

Revisa las condiciones de uso vigentes de Render y Neon antes de vender.

## 5. Cuando lleguen las ventas

Pasar a un plan de pago de Render (no se duerme, despliegue sin corte): en `render.yaml` cambia
`plan: free` por `plan: starter` y mueve `npm run db:migrate:prod` del `buildCommand` a
`preDeployCommand` (ver `docs/deployment.md`). La base de datos puede seguir en Neon.

Luego sigue `docs/salir-a-produccion.md`: Google OAuth y `ADMIN_EMAILS`, correo (`SMTP_PASS`),
Mercado Pago en producción y textos legales. Para comprobarlo todo desde fuera:

```bash
npm run golive:check -- --url https://<tu-dirección>
```
