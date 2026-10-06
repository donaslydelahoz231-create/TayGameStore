import type { FastifyPluginAsync } from 'fastify';
import type { AppConfig } from '../../config/env.js';
import { safeEqual } from '../../lib/crypto.js';
import { AppError } from '../../plugins/errors.js';
import type { ServiceDeps } from '../../services/context.js';
import { JOB_NAMES, runJob } from '../../services/jobs.js';

export interface JobRoutesOptions {
  config: AppConfig;
  deps: ServiceDeps | undefined;
}

/**
 * Tareas programadas por HTTP: `/api/internal/jobs` con `Authorization: Bearer $CRON_SECRET`.
 * Lo llaman Vercel Cron y el flujo de GitHub `tareas.yml` (cada 10 minutos), en cualquier
 * hosting. Sin CRON_SECRET o con otro valor responde 404 como cualquier ruta inexistente (y el
 * escudo cuenta el intento). Cada tarea toma su lock en PostgreSQL: llamarla mientras el
 * scheduler del proceso también corre no duplica nada.
 */
export const jobRoutes: FastifyPluginAsync<JobRoutesOptions> = async (app, { config, deps }) => {
  const handler = async (
    request: { headers: { authorization?: string | undefined } },
    reply: { header(name: string, value: string): unknown; code(status: number): unknown },
  ) => {
    const secret = config.cronSecret;
    if (!secret || !safeEqual(request.headers.authorization ?? '', `Bearer ${secret}`)) {
      throw new AppError('NOT_FOUND', 404, 'Recurso no encontrado.');
    }
    reply.header('cache-control', 'no-store');
    if (!deps) {
      reply.code(503);
      return { error: { code: 'NO_DATABASE', message: 'Base de datos no configurada.' } };
    }
    const results: Record<string, number | null | 'error'> = {};
    for (const name of JOB_NAMES) {
      try {
        results[name] = await runJob(deps, name);
      } catch (error) {
        app.log.error({ err: error, job: name, alert: 'job_failed' }, 'job failed');
        results[name] = 'error';
      }
    }
    // Si alguna tarea falla, 500: el flujo de GitHub queda en rojo y el dueño lo ve.
    const failed = Object.values(results).includes('error');
    if (failed) reply.code(500);
    return { ok: !failed, results };
  };
  app.get('/api/internal/jobs', handler);
};
