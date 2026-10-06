import { and, eq } from 'drizzle-orm';
import type { InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditEvents } from '../../src/server/db/schema.js';
import {
  ADMIN_EMAIL,
  createHarness,
  CSRF,
  resetDatabase,
  sessionFor,
  testDatabaseUrl,
  type Harness,
} from '../support/integration.js';

/**
 * Panel oculto y cambio de rol: el panel no existe para quien no es administrador, el dueño
 * puede pasar a ver la tienda como cliente, y volver al panel exige autenticarse de nuevo.
 */
let h: Harness;

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness();
});
afterAll(async () => {
  await h?.close();
});

const inject = (options: InjectOptions) => h.app.inject(options);
const me = async (cookies: Record<string, string>) =>
  (await inject({ method: 'GET', url: '/api/auth/me', cookies })).json<{
    authenticated: boolean;
    admin: unknown;
    adminEntry: string | null;
  }>();

describe('cambio de rol del administrador', () => {
  it('"Ver tienda como cliente" baja la sesión a cliente y revoca la de administración', async () => {
    const admin = await sessionFor(h, { email: ADMIN_EMAIL, admin: true, mfa: true, sub: 'dueño' });
    const res = await inject({
      method: 'POST',
      url: '/api/admin/sesion/cliente',
      cookies: admin.cookie,
      headers: CSRF,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ redirect: '/' });
    const issued = res.cookies.find((c) => c.name === 'tgs_session');
    expect(issued?.value).toBeTruthy();
    expect(issued?.value).not.toBe(admin.cookie.tgs_session);
    const customer = { tgs_session: issued?.value ?? '' };

    // La sesión nueva es de cliente: sin panel, pero sabe dónde está el suyo.
    const profile = await me(customer);
    expect(profile.authenticated).toBe(true);
    expect(profile.admin).toBeNull();
    expect(profile.adminEntry).toBe(h.deps.config.adminPath);
    expect(
      (await inject({ method: 'GET', url: '/api/admin/orders', cookies: customer })).statusCode,
    ).toBe(404);
    // La sesión de administración anterior quedó revocada.
    expect((await me(admin.cookie)).authenticated).toBe(false);

    const [event] = await h.database.db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, 'admin.switch_to_customer'),
          eq(auditEvents.entityId, admin.userId),
        ),
      );
    expect(event).toBeDefined();
  });

  it('cambiar de rol exige ser administrador con la verificación en dos pasos hecha', async () => {
    const customer = await sessionFor(h, { email: 'cliente-rol@example.com' });
    const noMfa = await sessionFor(h, {
      email: ADMIN_EMAIL,
      admin: true,
      mfa: false,
      sub: 'sin-mfa',
    });
    for (const cookies of [{}, customer.cookie]) {
      const res = await inject({
        method: 'POST',
        url: '/api/admin/sesion/cliente',
        cookies,
        headers: CSRF,
      });
      expect(res.statusCode).toBe(404);
    }
    const pending = await inject({
      method: 'POST',
      url: '/api/admin/sesion/cliente',
      cookies: noMfa.cookie,
      headers: CSRF,
    });
    expect(pending.statusCode).toBe(403);
    expect(pending.json<{ error: { code: string } }>().error.code).toBe('MFA_REQUIRED');
  });

  it('la dirección del panel solo se le da al dueño, nunca a clientes ni a ex administradores', async () => {
    const customer = await sessionFor(h, { email: 'otro-cliente@example.com' });
    expect((await me(customer.cookie)).adminEntry).toBeNull();
    const former = await sessionFor(h, {
      email: 'ex-dueño@example.com',
      admin: true,
      mfa: true,
      sub: 'ex-dueño',
    });
    expect((await me(former.cookie)).adminEntry).toBeNull();
    expect((await inject({ method: 'GET', url: '/api/auth/me' })).json()).toEqual({
      authenticated: false,
    });
  });
});
