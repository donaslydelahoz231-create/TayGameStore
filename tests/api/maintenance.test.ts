import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorBody } from '../../src/shared/errors.js';
import { requireCheckoutEnabled } from '../../src/server/plugins/maintenance.js';
import { buildTestApp, CSRF, testConfig } from '../helpers.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function appWithTestRoutes(env: Record<string, string>): Promise<FastifyInstance> {
  const instance = await buildTestApp({ env });
  const { flags } = testConfig(env);
  instance.post('/test/write', () => ({ ok: true }));
  instance.post('/api/webhooks/test', () => ({ received: true }));
  instance.post('/test/checkout', { preHandler: requireCheckoutEnabled(flags) }, () => ({
    ok: true,
  }));
  return instance;
}

describe('modo mantenimiento', () => {
  it('bloquea escrituras con 503 MAINTENANCE_MODE', async () => {
    app = await appWithTestRoutes({ MAINTENANCE_MODE: 'true' });
    const res = await app.inject({ method: 'POST', url: '/test/write', headers: CSRF });
    expect(res.statusCode).toBe(503);
    expect(res.json<ApiErrorBody>().error.code).toBe('MAINTENANCE_MODE');
  });

  it('permite lecturas y health', async () => {
    app = await appWithTestRoutes({ MAINTENANCE_MODE: 'true' });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
  });

  it('sigue aceptando webhooks (no se pierden notificaciones de pagos)', async () => {
    app = await appWithTestRoutes({ MAINTENANCE_MODE: 'true' });
    const res = await app.inject({ method: 'POST', url: '/api/webhooks/test' });
    expect(res.statusCode).toBe(200);
  });

  it('no permite eludir la exención con rutas manipuladas', async () => {
    app = await appWithTestRoutes({ MAINTENANCE_MODE: 'true' });
    const res = await app.inject({ method: 'POST', url: '/api/webhooks/../../test/write' });
    expect(res.statusCode).toBe(503);
  });

  it('no interfiere cuando está desactivado', async () => {
    app = await appWithTestRoutes({});
    const res = await app.inject({ method: 'POST', url: '/test/write', headers: CSRF });
    expect(res.statusCode).toBe(200);
  });
});

describe('CHECKOUT_ENABLED', () => {
  it('rechaza compras con 503 CHECKOUT_DISABLED por defecto', async () => {
    app = await appWithTestRoutes({});
    const res = await app.inject({ method: 'POST', url: '/test/checkout', headers: CSRF });
    expect(res.statusCode).toBe(503);
    expect(res.json<ApiErrorBody>().error.code).toBe('CHECKOUT_DISABLED');
  });

  it('permite la ruta cuando está habilitado (solo fuera de producción)', async () => {
    app = await appWithTestRoutes({ CHECKOUT_ENABLED: 'true' });
    const res = await app.inject({ method: 'POST', url: '/test/checkout', headers: CSRF });
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /api/config', () => {
  it('expone los interruptores sin secretos', async () => {
    app = await buildTestApp({
      env: { MAINTENANCE_MODE: 'true', DATABASE_URL: 'postgres://u:secreto@h/db' },
    });
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      maintenanceMode: true,
      checkoutEnabled: false,
      paymentsEnabled: false,
      paymentsMode: null,
      // Cada método por su lado: sin Mercado Pago ni Nequi configurados, ninguno disponible.
      paymentMethods: { mercadopago: false, nequiManual: false, nequiPush: false },
      auth: { google: false, facebook: false },
      playerLookup: false,
      // Sin proveedor de consulta, el cliente confirma su propio ID (valor por defecto).
      playerVerification: 'customer',
      // Sin ORDER_CHANNEL, el pedido se paga en línea como siempre (pedidos por WhatsApp apagados).
      orderChannel: 'checkout',
      // Sin pedido por WhatsApp no se publica ninguna cuenta de pago.
      orderPayment: null,
      emailUpdates: false,
      support: { whatsapp: null, email: null },
      termsVersion: '2026-10-05',
      // Sin LEGAL_DELIVERY_TIME la tienda dice «el plazo indicado en los términos».
      deliveryTime: null,
      // Horario público de la promo (por defecto, fines de semana en hora de Colombia).
      promo: {
        schedule: 'weekends',
        timeZone: 'America/Bogota',
        active: expect.any(Boolean) as boolean,
        startsAt: expect.stringMatching(/T05:00:00\.000Z$/) as string,
        endsAt: expect.stringMatching(/T05:00:00\.000Z$/) as string,
      },
      limits: { maxUnitsPerProduct: 5, maxOrderTotalCop: 1000000 },
    });
    expect(res.body).not.toContain('secreto');
  });
});

describe('GET /api/config · cuenta Nequi del pedido por WhatsApp', () => {
  // Valores ficticios: celular de 3 y nueve ceros, llave y titular de ejemplo.
  const NEQUI = {
    NEQUI_MANUAL_ENABLED: 'true',
    NEQUI_MANUAL_BREB_KEY: '@tienda-prueba',
    NEQUI_MANUAL_PHONE: '3000000000',
    NEQUI_MANUAL_HOLDER: 'Titular Ficticio',
  };
  const WHATSAPP = { SUPPORT_WHATSAPP: '+570000000000' };
  const configWith = async (env: Record<string, string>) => {
    app = await buildTestApp({ env });
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    expect(res.statusCode).toBe(200);
    return res.json<{ orderChannel: string; orderPayment: unknown }>();
  };

  it('con el pago en línea (checkout) no publica la cuenta aunque Nequi esté activo', async () => {
    const body = await configWith({ ...NEQUI, ...WHATSAPP });
    expect(body.orderChannel).toBe('checkout');
    expect(body.orderPayment).toBeNull();
    expect(JSON.stringify(body)).not.toContain('@tienda-prueba');
    expect(JSON.stringify(body)).not.toContain('3000000000');
  });

  it('con «ambos» o «whatsapp» publica llave, celular y titular para el paso de pago', async () => {
    for (const channel of ['ambos', 'whatsapp']) {
      await app?.close();
      const body = await configWith({ ...NEQUI, ...WHATSAPP, ORDER_CHANNEL: channel });
      expect(body.orderChannel).toBe(channel);
      expect(body.orderPayment).toEqual({
        nequi: { brebKey: '@tienda-prueba', phone: '3000000000', holder: 'Titular Ficticio' },
      });
    }
  });

  it('solo publica lo que el dueño configuró (sin celular ni titular, solo la llave)', async () => {
    const body = await configWith({
      NEQUI_MANUAL_ENABLED: 'true',
      NEQUI_MANUAL_BREB_KEY: '@tienda-prueba',
      ...WHATSAPP,
      ORDER_CHANNEL: 'ambos',
    });
    expect(body.orderPayment).toEqual({
      nequi: { brebKey: '@tienda-prueba', phone: null, holder: null },
    });
  });

  it('con WhatsApp pero sin Nequi activo no hay cuenta (el cliente la pide por el chat)', async () => {
    const body = await configWith({ ...WHATSAPP, ORDER_CHANNEL: 'ambos' });
    expect(body.orderPayment).toBeNull();
  });
});
