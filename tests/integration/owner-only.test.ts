import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createHarness,
  resetDatabase,
  sessionFor,
  testDatabaseUrl,
  type Harness,
} from '../support/integration.js';

/**
 * Garantías de propiedad: solo el dueño administra y nadie puede desviar el dinero desde la
 * plataforma. Las credenciales de Mercado Pago y la lista de administradores viven SOLO en
 * variables de entorno del servidor; ninguna ruta las lee ni las cambia.
 */
let h: Harness;

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness();
});
afterAll(async () => {
  await h?.close();
});

/** Rutas de administración aprobadas. Añadir una exige revisarla y actualizar esta lista. */
const APPROVED_ADMIN_ROUTES = [
  'DELETE /api/admin/blocklist/:id',
  'GET /api/admin/alerts',
  'GET /api/admin/audit',
  'GET /api/admin/blocklist',
  'GET /api/admin/orders',
  'GET /api/admin/orders/:id',
  'GET /api/admin/products',
  'POST /api/admin/blocklist',
  'POST /api/admin/mfa/enable',
  'POST /api/admin/mfa/setup',
  'POST /api/admin/mfa/verify',
  'POST /api/admin/orders/:id/fulfillment',
  'POST /api/admin/orders/:id/reconcile',
  'POST /api/admin/orders/:id/review',
  'POST /api/admin/orders/:id/verification',
  'POST /api/admin/products',
  'PUT /api/admin/products/:id',
];

function adminRoutes(): string[] {
  return [...new Set(h.routes.filter((r) => r.includes(' /api/admin')))].sort();
}

describe('solo el propietario administra; el dinero no se puede desviar', () => {
  it('las rutas de administración son exactamente las aprobadas', () => {
    expect(adminRoutes()).toEqual(APPROVED_ADMIN_ROUTES);
  });

  it('ninguna ruta expone ni modifica credenciales, cuentas de cobro o administradores', () => {
    const tree = h.routes.join('\n').toLowerCase();
    for (const word of [
      'credential',
      'token',
      'secret',
      'payout',
      'withdraw',
      'retiro',
      'bank',
      'nequi',
      'admins',
      'users',
      'roles',
      'config/',
    ]) {
      expect(tree, word).not.toContain(word);
    }
  });

  it('las respuestas públicas nunca incluyen las credenciales de Mercado Pago', async () => {
    const config = await h.app.inject({ method: 'GET', url: '/api/config' });
    const mp = h.deps.config.mercadoPago;
    expect(config.body).not.toContain(mp?.accessToken ?? 'sin-token');
    expect(config.body).not.toContain(mp?.webhookSecret ?? 'sin-secreto');
  });

  it('un usuario con sesión normal, aunque su correo esté en la lista, no es administrador', async () => {
    const { cookie } = await sessionFor(h, { email: 'admin@example.com', admin: false });
    const res = await h.app.inject({ method: 'GET', url: '/api/admin/orders', cookies: cookie });
    expect([401, 403]).toContain(res.statusCode);
  });
});
