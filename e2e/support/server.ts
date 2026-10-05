/**
 * Servidor para las pruebas end-to-end. SOLO PRUEBAS:
 * - base de datos PostgreSQL desechable (nombre terminado en _test), reiniciada al arrancar;
 * - catálogo de ejemplo del HTML original;
 * - Mercado Pago sustituido por el doble de pruebas, con una página local que simula el
 *   checkout y envía el webhook firmado;
 * - rutas /__e2e__/ para hacer de operador (verificar jugador, entregar).
 * Nunca se usa en producción ni se importa desde src/.
 */
import { eq } from 'drizzle-orm';
import { buildAppWithDeps } from '../../src/server/app.js';
import { loadConfig } from '../../src/server/config/env.js';
import { createDatabase } from '../../src/server/db/client.js';
import { orders, products, sessions, users } from '../../src/server/db/schema.js';
import { randomToken, sha256 } from '../../src/server/lib/crypto.js';
import { EXAMPLE_FREEFIRE_PRODUCTS } from '../../src/server/db/seeds/catalog-example.js';
import { fulfillmentAction, verifyPlayer } from '../../src/server/services/admin.js';
import { FakePaymentGateway } from '../../tests/support/fake-gateway.js';
import { FakePlayerVerifier } from '../../tests/support/fake-player-verifier.js';
import { resetDatabase } from '../../tests/support/integration.js';

const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}`;
const url = process.env.E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) {
  console.error(
    'Define E2E_DATABASE_URL (o TEST_DATABASE_URL) con una base cuyo nombre termine en _test.',
  );
  process.exit(1);
}

await resetDatabase(url);
const database = createDatabase({ url, poolMax: 5 });
await database.db.insert(products).values(EXAMPLE_FREEFIRE_PRODUCTS);
const [operator] = await database.db
  .insert(users)
  .values({
    googleSub: 'e2e-operator',
    email: 'operador@example.com',
    emailVerified: true,
    role: 'admin',
  })
  .returning();
if (!operator) throw new Error('sin operador');

const gateway = new FakePaymentGateway(`${BASE}/__e2e__/mercadopago`);
const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: process.env.E2E_LOG_LEVEL ?? 'warn',
  PORT: String(PORT),
  PUBLIC_BASE_URL: BASE,
  SERVE_WEB: 'true',
  WEB_DIST_DIR: 'dist/web',
  CHECKOUT_ENABLED: 'true',
  PAYMENTS_ENABLED: 'true',
  MP_ACCESS_TOKEN: 'TEST-e2e-sin-uso',
  MP_WEBHOOK_SECRET: 'secreto-e2e-sin-uso',
  JOBS_ENABLED: 'false',
  SUPPORT_EMAIL: 'soporte@example.com',
  // Credenciales ficticias SOLO para habilitar la allowlist en pruebas; no hay cliente Google.
  GOOGLE_CLIENT_ID: 'e2e-sin-uso.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'e2e-sin-uso-secreto',
  ADMIN_EMAILS: 'operador@example.com',
});
const { app, deps } = await buildAppWithDeps({
  config,
  database,
  db: database.db,
  paymentGateway: gateway,
  // Doble del proveedor: UID 9… encontrado, 8… inexistente, otro → caído (flujo manual).
  playerVerifier: new FakePlayerVerifier(),
});
if (!deps) throw new Error('sin dependencias');

async function orderIdByRef(ref: string): Promise<string> {
  const [row] = await database.db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.publicRef, ref));
  if (!row) throw new Error('orden no encontrada');
  return row.id;
}

/** Página que hace de checkout de Mercado Pago: aprueba el pago, envía el webhook y vuelve. */
app.get('/__e2e__/mercadopago', async (request, reply) => {
  const { pref_id: preferenceId, status } = request.query as { pref_id?: string; status?: string };
  const preference = preferenceId ? gateway.findPreference(preferenceId) : undefined;
  if (!preference) return reply.code(404).send('preferencia desconocida');
  const paymentId = String(Date.now());
  gateway.setPayment({
    id: paymentId,
    externalReference: preference.input.orderRef,
    amount: preference.input.totalCop,
    status: status ?? 'approved',
  });
  await app.inject({
    method: 'POST',
    url: `/api/webhooks/mercadopago?data.id=${paymentId}&type=payment`,
    headers: { 'x-signature': 'firma-valida', 'x-request-id': `e2e-${paymentId}` },
    payload: { type: 'payment', data: { id: paymentId } },
  });
  return reply.redirect(preference.input.returnUrl);
});

app.post('/__e2e__/verify', async (request) => {
  const { ref, nickname, region } = request.body as {
    ref: string;
    nickname: string;
    region: string;
  };
  await verifyPlayer(
    deps,
    await orderIdByRef(ref),
    { result: 'VERIFIED', nickname, region },
    { type: 'admin', userId: operator.id },
  );
  return { ok: true };
});

app.post('/__e2e__/deliver', async (request) => {
  const { ref } = request.body as { ref: string };
  const id = await orderIdByRef(ref);
  const actor = { type: 'admin' as const, userId: operator.id };
  for (const action of [{ action: 'claim' as const }, { action: 'start' as const }]) {
    await fulfillmentAction(deps, id, action, actor);
  }
  await fulfillmentAction(deps, id, { action: 'deliver', evidence: 'Entrega e2e' }, actor);
  return { ok: true };
});

/** Sesión de administración ya verificada con MFA (simula Google + TOTP). */
app.post('/__e2e__/admin-session', async () => {
  const token = randomToken();
  await database.db.insert(sessions).values({
    tokenHash: sha256(token),
    userId: operator.id,
    isAdmin: true,
    mfaVerifiedAt: new Date(),
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  await database.db
    .update(users)
    .set({ mfaEnabledAt: new Date() })
    .where(eq(users.id, operator.id));
  return { token };
});

await app.listen({ host: '127.0.0.1', port: PORT });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app
      .close()
      .then(() => database.close())
      .then(() => process.exit(0));
  });
}
