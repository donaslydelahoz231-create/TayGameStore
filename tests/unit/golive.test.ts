import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkEnvironment,
  checkRemote,
  deliveryCheck,
  loginCheck,
  report,
} from '../../src/server/cli/golive.js';
import { loadConfig } from '../../src/server/config/env.js';

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
  writeFileSync(path.join(dir, 'cookies.html'), 'Cookies completa.');
  writeFileSync(path.join(dir, 'reembolsos.html'), 'Reembolsos completa.');
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
    expect(lines.join('\n')).toContain('AVISO Sin correo al dueño');
    expect(lines.join('\n')).not.toMatch(/telegram/i);
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
    expect(
      failures(
        checkEnvironment(
          PRODUCTION,
          webRoot('Vende [COMPLETAR:LEGAL_NAME] ([COMPLETAR:SUPPORT_EMAIL])'),
        ),
      ),
    ).toEqual(['Textos legales pendientes (configura en el hosting): terminos.html: LEGAL_NAME']);
    expect(
      failures(
        checkEnvironment(
          { ...PRODUCTION, LEGAL_NAME: 'Tienda Ejemplo' },
          webRoot('Vende [COMPLETAR:LEGAL_NAME]'),
        ),
      ),
    ).toEqual([]);
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

describe('golive:check — acceso de clientes', () => {
  it('con Google y Facebook activos queda OK; sin credenciales avisa cuál falta', () => {
    expect(loginCheck({ google: true, facebook: true })).toEqual({
      level: 'ok',
      label: 'Acceso de clientes: invitado, Google y Facebook',
    });
    const partial = loginCheck({ google: false, facebook: true });
    expect(partial.level).toBe('aviso');
    expect(partial.label).toContain('invitado, Facebook. Sin credenciales en Render: Google');
    expect(loginCheck(undefined).label).toContain('Sin credenciales en Render: Google y Facebook');
  });
});

describe('golive:check — entrega', () => {
  const topup = {
    TOPUP_PROVIDER: 'unipin',
    UNIPIN_PARTNER_ID: 'socio-ficticio-0001',
    UNIPIN_SECRET_KEY: 'llave-ficticia-de-prueba',
    UNIPIN_CATALOG: '{"latam":{"game":"FF","skus":{"ff-110":"D110"}}}',
  };

  it('con UniPin y costos: OK, servidores cubiertos y recordatorio de unipin:check', () => {
    const withCost = {
      ...topup,
      UNIPIN_CATALOG:
        '{"latam":{"game":"FF","skus":{"ff-110":{"denomination":"D110","costCop":3500}}}}',
    };
    expect(deliveryCheck(loadConfig(withCost))).toEqual({
      level: 'ok',
      label: 'Recarga directa UniPin (staging) en: latam. Antes de vender: npm run unipin:check',
    });
  });

  it('con UniPin sin costo de un paquete: aviso, la ganancia no está garantizada', () => {
    expect(deliveryCheck(loadConfig(topup))).toMatchObject({
      level: 'aviso',
      label: expect.stringContaining('ganancia no garantizada): ff-110') as string,
    });
  });

  it('en producción, UniPin en staging no pasa: no entregaría diamantes', () => {
    expect(failures(checkEnvironment({ ...PRODUCTION, ...topup }, webRoot()))).toEqual([
      expect.stringContaining('UNIPIN_ENV: en producción debe ser production'),
    ]);
  });

  it('con PIN o a mano: aviso con la guía de recarga directa', () => {
    expect(deliveryCheck(loadConfig({ PIN_AUTO_DELIVERY: 'true' })).label).toContain(
      'docs/recarga-directa-unipin.md',
    );
    expect(deliveryCheck(loadConfig({})).level).toBe('aviso');
  });

  it('nunca imprime las credenciales de UniPin', () => {
    const lines: string[] = [];
    report(
      'Variables',
      checkEnvironment({ ...PRODUCTION, ...topup, UNIPIN_ENV: 'production' }, webRoot()),
      (l) => lines.push(l),
    );
    expect(lines.join('\n')).not.toContain('llave-ficticia-de-prueba');
    expect(lines.join('\n')).not.toContain('socio-ficticio-0001');
  });
});
