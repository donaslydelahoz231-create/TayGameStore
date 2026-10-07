import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { buildAppWithDeps } from '../../src/server/app.js';
import { loadConfig } from '../../src/server/config/env.js';
import { createDatabase, type Database } from '../../src/server/db/client.js';
import { runMigrations } from '../../src/server/db/migrate.js';
import { products, sessions, users } from '../../src/server/db/schema.js';
import type { GoogleClient, GoogleIdentity } from '../../src/server/integrations/google/oidc.js';
import { randomToken, sha256 } from '../../src/server/lib/crypto.js';
import type { ServiceDeps } from '../../src/server/services/context.js';
import { FakePaymentGateway } from './fake-gateway.js';
import { RecordingEventSink } from './fake-event-sink.js';
import { RecordingMailer } from './fake-mailer.js';
import { RecordingOwnerNotifier } from './fake-notifier.js';
import { FakePlayerVerifier } from './fake-player-verifier.js';
import { FakeSocialClient } from './fake-social.js';
import type { AbuseShield } from '../../src/server/services/shield.js';

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url)
    throw new Error(
      'TEST_DATABASE_URL no está definida: las pruebas de integración necesitan PostgreSQL.',
    );
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith('_test')) {
    throw new Error(
      `Por seguridad, la base de pruebas debe terminar en "_test" (recibido: ${name}).`,
    );
  }
  return url;
}

/** Borra y recrea el esquema de la base de pruebas. */
export async function resetDatabase(url: string): Promise<void> {
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(
    'drop schema if exists drizzle cascade; drop schema public cascade; create schema public;',
  );
  await admin.end();
  await runMigrations(url);
}

export class FakeGoogle implements GoogleClient {
  identity: GoogleIdentity = {
    sub: 'g-1',
    email: 'cliente@example.com',
    emailVerified: true,
    name: 'Cliente',
  };
  lastNonce: string | undefined;
  authorizationUrl(input: { state: string; nonce: string }): string {
    return `https://accounts.google.com/o/oauth2/v2/auth?state=${input.state}&nonce=${input.nonce}`;
  }
  async exchangeCode(input: { nonce: string }): Promise<GoogleIdentity> {
    this.lastNonce = input.nonce;
    return this.identity;
  }
}

export interface Harness {
  app: FastifyInstance;
  deps: ServiceDeps;
  database: Database;
  gateway: FakePaymentGateway;
  notifier: RecordingOwnerNotifier;
  mailer: RecordingMailer;
  /** Webhook de eventos (n8n); solo conectado con `{ events: true }`. */
  events: RecordingEventSink;
  google: FakeGoogle;
  verifier: FakePlayerVerifier;
  shield: AbuseShield;
  routes: readonly string[];
  discord: FakeSocialClient;
  facebook: FakeSocialClient;
  clock: { now: Date };
  close(): Promise<void>;
}

export const ADMIN_EMAIL = 'admin@example.com';

export async function createHarness(
  env: Record<string, string> = {},
  options: { playerVerifier?: boolean; events?: boolean } = {},
): Promise<Harness> {
  const url = testDatabaseUrl();
  const database = createDatabase({ url, poolMax: 10 });
  const gateway = new FakePaymentGateway();
  const notifier = new RecordingOwnerNotifier();
  const mailer = new RecordingMailer();
  const events = new RecordingEventSink();
  const google = new FakeGoogle();
  const verifier = new FakePlayerVerifier();
  const discord = new FakeSocialClient('discord');
  const facebook = new FakeSocialClient('facebook');
  const clock = { now: new Date() };
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    PUBLIC_BASE_URL: 'http://localhost:3000',
    CHECKOUT_ENABLED: 'true',
    PROMO_SCHEDULE: 'always',
    // Las pruebas existentes cubren la verificación por el equipo; la del cliente se pide aparte.
    PLAYER_VERIFICATION: 'operator',
    PAYMENTS_ENABLED: 'true',
    MP_MODE: 'sandbox',
    MP_ACCESS_TOKEN: 'TEST-token-de-prueba',
    MP_WEBHOOK_SECRET: 'secreto-de-prueba',
    GOOGLE_CLIENT_ID: 'cliente.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'secreto-google-prueba',
    ADMIN_EMAILS: `${ADMIN_EMAIL},admin2@example.com`,
    JOBS_ENABLED: 'false',
    ...env,
  });
  const { app, deps, shield, routes } = await buildAppWithDeps({
    config,
    database,
    db: database.db,
    paymentGateway: gateway,
    googleClient: google,
    socialClients: { discord, facebook },
    playerVerifier: options.playerVerifier === false ? undefined : verifier,
    ownerNotifier: notifier,
    mailer,
    eventSink: options.events ? events : undefined,
    now: () => clock.now,
  });
  if (!deps) throw new Error('sin dependencias');
  return {
    app,
    deps,
    database,
    gateway,
    notifier,
    mailer,
    events,
    google,
    verifier,
    shield,
    routes,
    discord,
    facebook,
    clock,
    close: async () => {
      await app.close();
      await database.close();
    },
  };
}

export async function seedProducts(h: Harness): Promise<void> {
  await h.database.db
    .insert(products)
    .values([
      {
        sku: 'ff-110',
        game: 'freefire',
        name: '100 + 10 Diamantes',
        units: 110,
        priceCop: 4000,
        promoPriceCop: 3800,
        sortOrder: 1,
      },
      {
        sku: 'ff-341',
        game: 'freefire',
        name: '310 + 31 Diamantes',
        units: 341,
        priceCop: 11000,
        sortOrder: 2,
      },
      {
        sku: 'ff-6160',
        game: 'freefire',
        name: '5.600 + 560 Diamantes',
        units: 6160,
        priceCop: 150000,
        sortOrder: 3,
      },
      {
        sku: 'ff-big',
        game: 'freefire',
        name: 'Paquete grande',
        units: 20000,
        priceCop: 300000,
        sortOrder: 4,
      },
      {
        sku: 'ff-off',
        game: 'freefire',
        name: 'Inactivo',
        units: 1,
        priceCop: 1000,
        active: false,
        sortOrder: 9,
      },
    ])
    .onConflictDoNothing();
}

/** Crea un usuario y una sesión directamente en la BD (equivale a un login de Google). */
export async function sessionFor(
  h: Harness,
  options: { email: string; admin?: boolean; mfa?: boolean; sub?: string },
): Promise<{ cookie: Record<string, string>; userId: string }> {
  const [user] = await h.database.db
    .insert(users)
    .values({
      googleSub: options.sub ?? `sub-${options.email}`,
      email: options.email,
      emailVerified: true,
      role: options.admin ? 'admin' : 'customer',
      mfaEnabledAt: options.mfa ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: users.googleSub,
      set: { role: options.admin ? 'admin' : 'customer' },
    })
    .returning();
  if (!user) throw new Error('sin usuario');
  const token = randomToken();
  await h.database.db.insert(sessions).values({
    tokenHash: sha256(token),
    userId: user.id,
    isAdmin: options.admin ?? false,
    mfaVerifiedAt: options.mfa ? new Date() : null,
    expiresAt: new Date(Date.now() + 7 * 24 * 3_600_000),
  });
  return { cookie: { tgs_session: token }, userId: user.id };
}

export const CSRF = { 'x-tgs-csrf': '1' } as const;
