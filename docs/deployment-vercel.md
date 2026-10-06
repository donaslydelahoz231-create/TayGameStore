# Despliegue en Vercel (alternativa a Render)

La tienda corre en Vercel como **una sola función** (`api/index.mjs` → `src/server/serverless.ts`)
que sirve la API, las páginas y los estáticos con las mismas cabeceras de seguridad que en Render.
Todo lo demás es igual: mismas variables de entorno, mismo código, mismas pruebas.

| Pieza | En Vercel |
|---|---|
| Build | `sh tools/vercel/build.sh`: `npm run build` y, si hay `DATABASE_URL`, las migraciones |
| Base de datos | PostgreSQL de **Neon** desde *Storage* (añade `DATABASE_URL` al proyecto) |
| Tareas programadas | Vercel Cron llama a `/api/internal/jobs` con `Authorization: Bearer $CRON_SECRET` (en Hobby, una vez al día; en Pro puede ser cada pocos minutos) |
| Rate limiting y escudo | En memoria de cada instancia (como en Render, pero Vercel puede abrir varias) |

## Plan Hobby (gratis) o Pro

El plan **Hobby es para uso personal y no comercial** según las condiciones de Vercel: sirve
para ver y probar la tienda con su servidor real, Google y el **sandbox** de Mercado Pago.
**Para vender** hace falta el plan **Pro** (de pago, con tarjeta) o volver a Render. Revisa las
condiciones y precios vigentes en vercel.com antes de cobrar a clientes.

## Pasos

1. Proyecto conectado al repositorio de GitHub (lo crea Claude con el conector de Vercel, o
   tú en vercel.com → *Add New → Project*). Node 24.
2. **Storage → Create Database → Neon** (plan gratuito) → conéctala al proyecto. Vercel añade
   `DATABASE_URL`; el siguiente despliegue aplica las migraciones.
3. Variables (Settings → Environment Variables): las mismas que en `docs/deployment.md`, más
   `CRON_SECRET` (aleatoria). Con `PUBLIC_BASE_URL=https://<tu-proyecto>.vercel.app`.
   Las URI de redirección de Google, Discord, Facebook y el webhook de Mercado Pago usan esa
   dirección (`/auth/google/callback`, `/api/webhooks/mercadopago`, …).
4. Vigilancia (`docs/autorreparacion.md`): Settings → Git → **Deploy Hooks** → crea uno y
   guárdalo en GitHub como secreto `DEPLOY_HOOK_URL`; `PRODUCTION_URL` como variable.
