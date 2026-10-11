# Automatización de TayGameStore (sin n8n)

El 2026-10-11 el dueño pidió dejar n8n (su plan de n8n Cloud dejó de ejecutar flujos el
2026-10-08) por una automatización **gratuita**. Todo quedó repartido entre tres piezas que no
cuestan nada:

| Pieza | Coste | Límite real |
|---|---|---|
| **El propio servidor** (Render) | Gratis | Ninguno propio: corre mientras la tienda esté encendida. |
| **GitHub Actions** (repositorio público) | Gratis | Sin límite de minutos en repositorios públicos. Los horarios pueden retrasarse unos minutos y GitHub pausa los flujos programados tras **60 días sin actividad** en el repositorio (cualquier commit los reactiva). |
| **Rutina diaria de Claude** (claude.ai) | Incluida en tu plan | Una ronda al día. |

## Qué hacía cada flujo de n8n y dónde vive ahora

| n8n | Ahora | Dónde |
|---|---|---|
| **Vigilancia** (cada 5 min) | Comprobación cada 30 min (la base de datos, una vez por hora); si cae, reinicia una vez y abre un issue «incidente» (GitHub te avisa por correo). | `.github/workflows/vigilancia.yml` |
| **Tareas** (cada 10 min) | Las tareas internas del servidor: vencimiento de pedidos, conciliación de pagos con Mercado Pago, reintentos de correos y eventos, limpieza. En reposo corren en una sola tanda cada 30 min para que Neon duerma. | `src/server/services/jobs.ts` |
| Mantener la tienda despierta | Visita a `/api/health` cada 10 min (no toca la base de datos). | `.github/workflows/mantener-activa.yml` |
| **Pedidos** (registro + aviso por Gmail) | El registro es la base de datos de la tienda y el panel de administración (pedidos, pagos, entregas, auditoría). El aviso de «pagado: por entregar» lo envía el servidor por **Telegram** (gratis) y/o por **correo** (Gmail), y el panel lo muestra con sonido. | `src/server/services/notifications.ts`, panel |
| **Errores** | Los flujos de GitHub en rojo te llegan por correo de GitHub; las caídas abren un issue «incidente». | GitHub |
| **Diagnóstico** y **Cerebro** (agentes) | Diagnóstico diario: verificador de producción (`golive:check --url`) y navegador real (burbujas de soporte), con informe en el resumen del flujo. Análisis y arreglos: la rutina diaria de Claude. | `.github/workflows/diagnostico.yml` |
| Prueba tras cada publicación | Web, `/api/health`, `/api/ready`, canales de soporte y navegador real. | `.github/workflows/production-smoke.yml` |

## Lo que tienes que hacer tú (una vez)

1. **Avisos de pedidos pagados al celular (Telegram, gratis):** en Telegram abre **@BotFather** →
   `/newbot` → copia el token. Escríbele un mensaje a tu bot y obtén tu *chat id*. Carga
   `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` en **Render → Environment** (nunca en un chat). Ver
   `docs/salir-a-produccion.md` («Aviso por Telegram»).
2. **Correo** (opcional, gratis con Gmail): contraseña de aplicación de Google en `SMTP_*`.
3. **n8n:** ya no hace falta. Puedes cancelar el plan de n8n Cloud. Los flujos siguen respaldados
   en `infra/n8n/` por si algún día quieres restaurarlos. Si en Render existen `EVENTS_WEBHOOK_URL`
   y `EVENTS_WEBHOOK_SECRET`, bórralas (eran solo para n8n).

## Ver que todo funciona

- GitHub → **Actions**: «Diagnóstico diario» (informe), «Vigilancia y autorreparación»,
  «Mantener la tienda activa», «Production smoke check».
- Para lanzar el diagnóstico cuando quieras: Actions → «Diagnóstico diario» → **Run workflow**.
