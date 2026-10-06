import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkEnvironment, checkRemote, report } from '../../src/server/cli/golive.js';

const key32 = `1:${Buffer.alloc(32, 7).toString('base64')}`;
const PRODUCTION: Record<string, string> = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://u:p@db:5432/taygamestore',
  PUBLIC_BASE_URL: 'https://tienda.example.com',
  ORDER_TOKEN_KEYS: key32,
  MFA_ENCRYPTION_KEYS: key32,
  IP_HASH_PEPPER: 'p'.repeat(40),
  GOOGLE_CLIENT_ID: 'cliente.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'secreto-google-relleno',
  ADMIN_EMAILS: 'dueno@example.com',
  ADMIN_PATH: '/gestion-relleno-0000',
  CHECKOUT_ENABLED: 'true',
  PAYMENTS_ENABLED: 'true',
  MP_MODE: 'production',
  MP_ACCESS_TOKEN: 'APP_USR-relleno-produccion',
  MP_WEBHOOK_SECRET: 'secreto-webhook-relleno',
  SUPPORT_EMAIL: 'soporte@example.com',
};

function webRoot(legal = 'Términos completos.') {
  const dir = mkdtempSync(path.join(tmpdir(), 'tgs-golive-'));
  writeFileSync(path.join(dir, 'terminos.html'), legal);
  writeFileSync(path.join(dir, 'privacidad.html'), 'Privacidad completa.');
  return dir;
}

const failures = (checks: { level: string; label: string }[]) =>
  checks.filter((c) => c.level === 'falta').map((c) => c.label);

describe('golive:check — variables del servidor', () => {
  it('producción completa: nada obligatorio falta; avisa de lo que es manual', () => {
    const checks = checkEnvironment(PRODUCTION, webRoot());
    expect(failures(checks)).toEqual([]);
    const lines: string[] = [];
    expect(report('Variables', checks, (l) => lines.push(l))).toBe(true);
    expect(lines.join('\n')).toContain('AVISO Entrega manual');
    expect(lines.join('\n')).toContain('AVISO Sin TELEGRAM_BOT_TOKEN');
    expect(lines.join('\n')).toContain('AVISO Sin SMTP_HOST');
    // Nunca imprime valores de las variables.
    for (const value of Object.values(PRODUCTION).filter((v) => v.length > 12)) {
      expect(lines.join('\n')).not.toContain(value);
    }
  });

  it('sandbox o credencial TEST- no están listas para cobrar dinero real', () => {
    expect(failures(checkEnvironment({ ...PRODUCTION, MP_MODE: 'sandbox' }, webRoot()))).toEqual([
      expect.stringContaining('MP_MODE debe ser production'),
    ]);
    expect(
      failures(
        checkEnvironment({ ...PRODUCTION, MP_ACCESS_TOKEN: 'TEST-123456789-relleno' }, webRoot()),
      ),
    ).toEqual([expect.stringContaining('credencial de prueba')]);
  });

  it('ventas apagadas, textos legales pendientes o configuración inválida se marcan', () => {
    expect(
      failures(checkEnvironment({ ...PRODUCTION, CHECKOUT_ENABLED: 'false' }, webRoot())),
    ).toEqual([expect.stringContaining('CHECKOUT_ENABLED')]);
    expect(failures(checkEnvironment(PRODUCTION, webRoot('Razón social: [COMPLETAR]')))).toEqual([
      expect.stringContaining('terminos.html'),
    ]);
    const invalid = checkEnvironment({ ...PRODUCTION, ADMIN_PATH: '' }, webRoot());
    expect(invalid.at(-1)?.level).toBe('aviso');
    expect(failures(invalid)).toEqual([expect.stringContaining('ADMIN_PATH')]);
  });
});

type Route = { status: number; body?: unknown; headers?: Record<string, string> };
function fakeSite(routes: Record<string, Route>): typeof fetch {
  return async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const route = routes[url.pathname + url.search] ?? routes[url.pathname] ?? { status: 404 };
    return new Response(route.body === undefined ? '' : JSON.stringify(route.body), {
      status: route.status,
      headers: route.headers,
    });
  };
}

const LIVE: Record<string, Route> = {
  '/': {
    status: 200,
    headers: {
      'content-security-policy': "default-src 'self'",
      'strict-transport-security': 'max-age=1',
    },
  },
  '/api/ready': { status: 200, body: { status: 'ready' } },
  '/api/config': {
    status: 200,
    body: {
      maintenanceMode: false,
      checkoutEnabled: true,
      paymentsEnabled: true,
      paymentsMode: 'production',
    },
  },
  '/api/catalog': { status: 200, body: { products: [{ sku: 'ff-110' }] } },
};

describe('golive:check — tienda publicada', () => {
  it('tienda lista: todo OK y recuerda la URL del webhook', async () => {
    const checks = await checkRemote('https://tienda.example.com', fakeSite(LIVE));
    expect(failures(checks)).toEqual([]);
    expect(checks.map((c) => c.label).join('\n')).toContain(
      'https://tienda.example.com/api/webhooks/mercadopago',
    );
  });

  it('detecta modo prueba, catálogo vacío, panel público y sin https', async () => {
    const checks = await checkRemote(
      'https://tienda.example.com',
      fakeSite({
        ...LIVE,
        '/api/config': {
          status: 200,
          body: { ...(LIVE['/api/config']?.body as object), paymentsMode: 'sandbox' },
        },
        '/api/catalog': { status: 200, body: { products: [] } },
        '/admin.html': { status: 200 },
      }),
    );
    expect(failures(checks)).toEqual([
      expect.stringContaining('modo "sandbox"'),
      expect.stringContaining('catálogo está vacío'),
      expect.stringContaining('/admin.html responde'),
    ]);
    expect(failures(await checkRemote('http://tienda.example.com', fakeSite(LIVE)))).toEqual([
      'La tienda debe publicarse con https',
    ]);
  });

  it('un sitio caído se informa sin lanzar errores', async () => {
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    expect(failures(await checkRemote('https://tienda.example.com', down))).toEqual([
      'https://tienda.example.com no responde',
    ]);
  });
});
