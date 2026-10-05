import type { FastifyInstance } from 'fastify';
import { buildApp, type AppDependencies } from '../src/server/app.js';
import { loadConfig, type AppConfig } from '../src/server/config/env.js';

export function testConfig(env: Record<string, string> = {}): AppConfig {
  return loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...env });
}

export async function buildTestApp(
  options: { env?: Record<string, string> } & Omit<AppDependencies, 'config'> = {},
): Promise<FastifyInstance> {
  const { env, ...deps } = options;
  return buildApp({ config: testConfig(env), ...deps });
}

/** Cabecera anti-CSRF que el frontend envía en toda petición que modifica estado. */
export const CSRF = { 'x-tgs-csrf': '1' } as const;
