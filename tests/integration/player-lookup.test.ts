import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { orders, playerLookups } from '../../src/server/db/schema.js';
import { cleanup } from '../../src/server/services/jobs.js';
import type { ApiErrorBody } from '../../src/shared/errors.js';
import {
  createHarness,
  CSRF,
  resetDatabase,
  seedProducts,
  sessionFor,
  testDatabaseUrl,
  type Harness,
} from '../support/integration.js';

let h: Harness;

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness();
  await seedProducts(h);
});

afterAll(async () => {
  await h?.close();
});

beforeEach(() => {
  h.clock.now = new Date();
});

const randomIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
const inject = (options: InjectOptions) => h.app.inject({ remoteAddress: randomIp(), ...options });

let counter = 1000;
/** UID que el doble del proveedor encuentra (empieza por 9). */
const foundUid = () => `9${String((counter += 1)).padStart(8, '0')}`;

const guestCookie = (res: LightMyRequestResponse): Record<string, string> => {
  const cookie = res.cookies.find((c) => c.name === 'tgs_guest');
  return cookie ? { tgs_guest: cookie.value } : {};
};

interface LookupJson {
  lookupRef: string;
  nickname: string;
  region: string;
  expiresAt: string;
}

async function lookup(uid: string, cookies: Record<string, string> = {}) {
  return inject({
    method: 'POST',
    url: '/api/player/lookup',
    headers: CSRF,
    cookies,
    payload: { game: 'freefire', uid },
  });
}

async function checkout(
  uid: string,
  cookies: Record<string, string>,
  playerLookup?: { ref: string; nickname: string },
) {
  return inject({
    method: 'POST',
    url: '/api/checkout',
    headers: CSRF,
    cookies,
    payload: {
      checkoutKey: randomUUID(),
      game: 'freefire',
      playerUid: uid,
      customerName: 'Cliente Prueba',
      customerEmail: `c${counter}-${randomUUID().slice(0, 6)}@example.com`,
      acceptTerms: true,
      termsVersion: '2026-10-05',
      items: [{ sku: 'ff-110', quantity: 1 }],
      ...(playerLookup ? { playerLookup } : {}),
    },
  });
}

/** Consulta como invitado y devuelve la cookie del navegador para reutilizarla. */
async function guestLookup(uid = foundUid()) {
  const res = await lookup(uid);
  expect(res.statusCode).toBe(200);
  return { uid, cookies: guestCookie(res), result: res.json<LookupJson>() };
}

const errorCode = (res: LightMyRequestResponse) => res.json<ApiErrorBody>().error.code;

describe('consulta de jugador (estilo LootBar)', () => {
  it('encuentra el jugador y devuelve nickname, región y una referencia temporal', async () => {
    const { uid, cookies, result } = await guestLookup();
    expect(cookies.tgs_guest).toBeTruthy();
    expect(result.nickname).toBe(`Jugador${uid.slice(-4)}`);
    expect(result.region).toBe('Colombia');
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('ID inexistente → 422 PLAYER_NOT_FOUND; proveedor caído → 503 PLAYER_LOOKUP_UNAVAILABLE', async () => {
    const missing = await lookup('812345678');
    expect(missing.statusCode).toBe(422);
    expect(errorCode(missing)).toBe('PLAYER_NOT_FOUND');
    const down = await lookup('712345678');
    expect(down.statusCode).toBe(503);
    expect(errorCode(down)).toBe('PLAYER_LOOKUP_UNAVAILABLE');
  });

  it('valida el UID y exige la cabecera CSRF', async () => {
    expect((await lookup('12ab')).statusCode).toBe(400);
    expect((await lookup('123')).statusCode).toBe(400);
    const noCsrf = await inject({
      method: 'POST',
      url: '/api/player/lookup',
      payload: { game: 'freefire', uid: foundUid() },
    });
    expect(noCsrf.statusCode).toBe(403);
  });

  it('checkout con la consulta confirmada → la orden nace lista para pagar', async () => {
    const { uid, cookies, result } = await guestLookup();
    const res = await checkout(uid, cookies, { ref: result.lookupRef, nickname: result.nickname });
    expect(res.statusCode).toBe(201);
    const order = res.json<{
      order: { status: string; verification: { status: string; nickname: string | null } };
    }>().order;
    expect(order.status).toBe('AWAITING_PAYMENT');
    expect(order.verification.status).toBe('CONFIRMED');
    expect(order.verification.nickname).toBe(result.nickname);

    const [lookupRow] = await h.database.db
      .select()
      .from(playerLookups)
      .where(eq(playerLookups.id, result.lookupRef));
    expect(lookupRow?.usedAt).not.toBeNull();
  });

  it('la consulta es de un solo uso', async () => {
    const { uid, cookies, result } = await guestLookup();
    const ref = { ref: result.lookupRef, nickname: result.nickname };
    expect((await checkout(uid, cookies, ref)).statusCode).toBe(201);
    const reused = await checkout(uid, cookies, ref);
    expect(reused.statusCode).toBe(409);
    expect(errorCode(reused)).toBe('PLAYER_LOOKUP_EXPIRED');
  });

  it('rechaza (409) otro navegador, otro UID, otro nickname o una consulta caducada', async () => {
    const { uid, cookies, result } = await guestLookup();
    const ref = { ref: result.lookupRef, nickname: result.nickname };

    const otherBrowser = await checkout(uid, {}, ref);
    expect(otherBrowser.statusCode).toBe(409);
    expect(await checkout(foundUid(), cookies, ref)).toMatchObject({ statusCode: 409 });
    expect(
      await checkout(uid, cookies, { ref: result.lookupRef, nickname: 'OtroNick' }),
    ).toMatchObject({ statusCode: 409 });

    h.clock.now = new Date(Date.now() + 31 * 60_000);
    const expired = await checkout(uid, cookies, ref);
    expect(expired.statusCode).toBe(409);
    expect(errorCode(expired)).toBe('PLAYER_LOOKUP_EXPIRED');

    // Ningún intento fallido creó órdenes para ese UID.
    const rows = await h.database.db.select().from(orders).where(eq(orders.playerUid, uid));
    expect(rows).toHaveLength(0);
  });

  it('un usuario con sesión consulta y compra con la misma sesión', async () => {
    const { cookie } = await sessionFor(h, { email: 'lookup@example.com' });
    const uid = foundUid();
    const res = await lookup(uid, cookie);
    expect(res.statusCode).toBe(200);
    const result = res.json<LookupJson>();
    const created = await checkout(uid, cookie, {
      ref: result.lookupRef,
      nickname: result.nickname,
    });
    expect(created.statusCode).toBe(201);
  });

  it('sin consulta, el pedido sigue el flujo de verificación manual', async () => {
    const res = await checkout(foundUid(), {});
    expect(res.statusCode).toBe(201);
    expect(res.json<{ order: { status: string } }>().order.status).toBe('AWAITING_VERIFICATION');
  });

  it('la limpieza borra consultas caducadas hace más de un día', async () => {
    const { result } = await guestLookup();
    h.clock.now = new Date(Date.now() + 2 * 24 * 3_600_000);
    await cleanup(h.deps);
    const rows = await h.database.db
      .select()
      .from(playerLookups)
      .where(eq(playerLookups.id, result.lookupRef));
    expect(rows).toHaveLength(0);
  });
});

describe('consulta de jugador sin proveedor configurado', () => {
  let bare: Harness;

  beforeAll(async () => {
    bare = await createHarness({}, { playerVerifier: false });
  });

  afterAll(async () => {
    await bare?.close();
  });

  it('responde 503 y /api/config lo anuncia para usar el flujo manual', async () => {
    const res = await bare.app.inject({
      method: 'POST',
      url: '/api/player/lookup',
      headers: CSRF,
      remoteAddress: randomIp(),
      payload: { game: 'freefire', uid: foundUid() },
    });
    expect(res.statusCode).toBe(503);
    expect(errorCode(res)).toBe('PLAYER_LOOKUP_UNAVAILABLE');
    const config = await bare.app.inject({ method: 'GET', url: '/api/config' });
    expect(config.json<{ playerLookup: boolean }>().playerLookup).toBe(false);
    const withVerifier = await h.app.inject({ method: 'GET', url: '/api/config' });
    expect(withVerifier.json<{ playerLookup: boolean }>().playerLookup).toBe(true);
  });
});
