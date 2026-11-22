import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { notifications, orders } from '../../src/server/db/schema.js';
import { deliverNotifications } from '../../src/server/services/notifications.js';
import {
  createHarness,
  CSRF,
  resetDatabase,
  seedProducts,
  testDatabaseUrl,
  type Harness,
} from '../support/integration.js';

/**
 * Antispam del WhatsApp del dueño (pedido del dueño, 2026-11-19: «contra spam»): aunque alguien
 * cree e informe pedidos en masa, en una hora le llegan como máximo OWNER_WHATSAPP_MAX_PER_HOUR
 * mensajes. Los demás no se pierden ni gastan intentos: salen cuando la hora deja espacio. El
 * WhatsApp está simulado (nada sale a la red) y todos los datos son ficticios.
 */

const ENV = {
  PLAYER_VERIFICATION: 'customer',
  NEQUI_MANUAL_ENABLED: 'true',
  NEQUI_MANUAL_PHONE: '300 123 4567',
  NEQUI_MANUAL_BREB_KEY: '@tiendaprueba',
  NEQUI_MANUAL_HOLDER: 'Tienda de Prueba',
  OWNER_WHATSAPP_MAX_PER_HOUR: '2',
};

let h: Harness;
let seq = 0;
let uid = 830000000;

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness(ENV, { ownerWhatsApp: true });
  await seedProducts(h);
});
afterAll(async () => {
  await h?.close();
});

const inject = (options: InjectOptions) =>
  h.app.inject({ remoteAddress: `10.79.0.${(++seq % 200) + 1}`, ...options });
const guestCookie = (res: LightMyRequestResponse): Record<string, string> => {
  const cookie = res.cookies.find((c) => c.name === 'tgs_guest');
  return cookie ? { tgs_guest: cookie.value } : {};
};

/** Crea un pedido y lo informa como pagado por Nequi (lo que dispara el WhatsApp del dueño). */
async function paidByNequi(): Promise<string> {
  const playerUid = String((uid += 1));
  const res = await inject({
    method: 'POST',
    url: '/api/checkout',
    headers: CSRF,
    payload: {
      checkoutKey: randomUUID(),
      game: 'freefire',
      playerUid,
      confirmedPlayerUid: playerUid,
      playerServer: 'latam',
      customerName: 'Cliente Ficticio Tope',
      customerEmail: `tope-${randomUUID().slice(0, 8)}@example.com`,
      acceptTerms: true,
      termsVersion: '2026-10-05',
      items: [{ sku: 'ff-110', quantity: 1 }],
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  const ref = res.json<{ order: { reference: string } }>().order.reference;
  const cookies = guestCookie(res);
  const post = (path: string, payload?: object) =>
    inject({
      method: 'POST',
      url: `/api/orders/${ref}${path}`,
      headers: CSRF,
      cookies,
      ...(payload ? { payload } : {}),
    });
  expect((await post('/nequi')).statusCode).toBe(200);
  const reported = await post('/nequi/report', { senderLast4: '1234' });
  expect(reported.statusCode, reported.body).toBe(200);
  await h.settle();
  const [row] = await h.database.db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.publicRef, ref));
  return row?.id ?? '';
}

const whatsappRow = async (orderId: string) => {
  const [row] = await h.database.db
    .select({
      status: notifications.status,
      attempts: notifications.attempts,
      lastError: notifications.lastError,
    })
    .from(notifications)
    .where(and(eq(notifications.orderId, orderId), eq(notifications.channel, 'whatsapp')));
  return row;
};

describe('antispam: tope de avisos por WhatsApp al dueño por hora', () => {
  it('pasado el tope, el aviso espera su turno sin perderse ni gastar intentos', async () => {
    const first = await paidByNequi();
    const second = await paidByNequi();
    const third = await paidByNequi();
    expect(h.ownerWhatsApp.sent).toHaveLength(2);
    expect((await whatsappRow(first))?.status).toBe('SENT');
    expect((await whatsappRow(second))?.status).toBe('SENT');
    expect(await whatsappRow(third)).toEqual({
      status: 'PENDING',
      attempts: 0,
      lastError: 'Tope antispam de WhatsApp por hora: espera su turno',
    });
    // Dentro de la misma hora sigue esperando, aunque la cola pase varias veces.
    h.clock.now = new Date(h.clock.now.getTime() + 10 * 60_000);
    await deliverNotifications(h.deps);
    expect(h.ownerWhatsApp.sent).toHaveLength(2);
    expect((await whatsappRow(third))?.attempts).toBe(0);
    // Pasada la hora, sale; el pedido siempre estuvo completo en el panel, la hoja y el correo.
    h.clock.now = new Date(h.clock.now.getTime() + 55 * 60_000);
    await deliverNotifications(h.deps);
    expect(h.ownerWhatsApp.sent).toHaveLength(3);
    expect(await whatsappRow(third)).toEqual({ status: 'SENT', attempts: 1, lastError: null });
  });
});
