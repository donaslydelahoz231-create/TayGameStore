import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildServer, type Server } from './bootstrap.js';
import { ConfigError, loadConfig } from './config/env.js';

/**
 * Entrada para Vercel Functions (api/index.mjs). La app se construye una vez por instancia y
 * se reutiliza entre peticiones. Sin procesos de fondo: las tareas programadas las dispara
 * Vercel Cron en /api/internal/jobs con `Authorization: Bearer $CRON_SECRET` (ruta de la app).
 */
let starting: Promise<Server> | undefined;

function start(): Promise<Server> {
  starting ??= (async () => {
    const server = await buildServer(loadConfig());
    await server.app.ready();
    return server;
  })();
  // Un fallo de arranque no se queda en caché: la siguiente petición lo reintenta.
  starting.catch(() => {
    starting = undefined;
  });
  return starting;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let server: Server;
  try {
    server = await start();
  } catch (error) {
    // Solo nombres de variables, nunca sus valores (ConfigError ya los formatea así).
    console.error(error instanceof ConfigError ? error.message : 'Fallo al iniciar el servidor');
    sendJson(res, 503, {
      error: { code: 'SERVER_NOT_READY', message: 'El servidor no está configurado todavía.' },
    });
    return;
  }
  // /api/internal/jobs (Vercel Cron) lo atiende la propia app, igual que en Render.
  server.app.server.emit('request', req, res);
}
