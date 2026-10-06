# Publicar la tienda gratis: Render + Neon

Costo: **0**. Necesitas una cuenta de GitHub (ya la tienes) y unos 20 minutos. Todo se hace con
"Iniciar sesión con GitHub"; no se escribe código.

| Pieza | Servicio gratuito | Para qué |
|---|---|---|
| Servidor de la tienda | **Render** (plan Free) | Página, API, pagos, panel |
| Base de datos | **Neon** (plan Free) | Pedidos, catálogo, clientes |
| Tareas cada 10 min | **GitHub Actions** (gratis en repositorios públicos) | Concilia pagos, reintenta correos y mantiene la tienda despierta |

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

## 3. Tareas cada 10 minutos (GitHub)

En GitHub → repositorio `TayGameStore` → *Settings* → *Secrets and variables* → *Actions*:

- Pestaña **Variables** → *New repository variable*: `PRODUCTION_URL` = tu dirección de Render.
- Pestaña **Secrets** → *New repository secret*: `CRON_SECRET` = **el mismo valor** que pusiste
  en Render.

Desde ese momento, cada 10 minutos el flujo **Tareas programadas** llama a la tienda: concilia
pagos cuyo aviso de Mercado Pago no llegó, reintenta correos y, como efecto, la mantiene
despierta. El flujo **Vigilancia** (cada 30 min) abre un aviso en GitHub si la tienda deja de
responder.

## 4. Lo que hay que saber del plan gratuito

- **Se duerme sin tráfico.** Las tareas de GitHub la despiertan cada 10 minutos; aun así, GitHub
  puede retrasar sus flujos, y si coincide, el primer visitante espera cerca de un minuto. Los
  pagos no se pierden: Mercado Pago reintenta su aviso y la tienda consulta el pago cuando el
  cliente vuelve.
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
