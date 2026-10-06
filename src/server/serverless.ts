import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildServer, type Server } from './bootstrap.js';
import { ConfigError, loadConfig } from './config/env.js';
import { safeEqual } from './lib/crypto.js';
import { JOB_NAMES, runJob } from './services/jobs.js';

/**
 * Entrada para Vercel Functions (api/index.mjs). La app se construye una vez por instancia y
 * se reutiliza entre peticiones. Sin procesos de fondo: las tareas programadas las dispara
 * Vercel Cron en /api/internal/jobs con `Authorization: Bearer $CRON_SECRET`.
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

const JOBS_PATH = '/api/internal/jobs';

async function runJobs(server: Server, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization ?? '';
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' } });
    return;
  }
  if (!server.deps) {
    sendJson(res, 503, {
      error: { code: 'NO_DATABASE', message: 'Base de datos no configurada.' },
    });
    return;
  }
  const results: Record<string, number | null | 'error'> = {};
  for (const name of JOB_NAMES) {
    try {
      results[name] = await runJob(server.deps, name);
    } catch (error) {
      server.app.log.error({ err: error, job: name, alert: 'job_failed' }, 'job failed');
      results[name] = 'error';
    }
  }
  sendJson(res, 200, { ok: true, results });
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
  const path = (req.url ?? '/').split('?')[0];
  if (path === JOBS_PATH) {
    await runJobs(server, req, res);
    return;
  }
  server.app.server.emit('request', req, res);
}
