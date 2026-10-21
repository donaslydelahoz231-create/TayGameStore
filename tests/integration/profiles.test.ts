import { eq } from 'drizzle-orm';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { customerProfiles } from '../../src/server/db/schema.js';
import {
  SheetsError,
  type OrderSheetLog,
  type SheetTab,
} from '../../src/server/integrations/sheets/google-sheets.js';
import { runJob } from '../../src/server/services/jobs.js';
import {
  GUEST_PROFILES_PER_IP_PER_DAY,
  HANDLE_PATTERN,
  syncProfilesToSheet,
  USER_SHEET_COLUMNS,
} from '../../src/server/services/profiles.js';
import {
  ADMIN_EMAIL,
  createHarness,
  CSRF,
  resetDatabase,
  sessionFor,
  testDatabaseUrl,
  type Harness,
} from '../support/integration.js';

/** Pestaña «Usuarios» simulada: una fila por código (columna A); falla o pide esperar a pedido. */
class UsersSheet implements OrderSheetLog {
  users: (string | number)[][] = [];
  writes: (string | number)[][] = [];
  failing = false;
  rateLimited = false;
  /** Si existe, cada escritura espera a que se abra (Google lento). */
  gate: Promise<void> | undefined;
  onWrite: (() => void) | undefined;
  async appendRow(): Promise<void> {
    throw new Error('la pestaña «Usuarios» solo se reescribe por código');
  }
  async upsertRow(tab: SheetTab, values: readonly (string | number)[]): Promise<void> {
    if (tab !== 'users') return;
    if (this.rateLimited) throw new SheetsError('Google Sheets no aceptó la fila', 429);
    if (this.failing) throw new Error('Google Sheets no disponible (simulado)');
    this.onWrite?.();
    await this.gate;
    this.writes.push([...values]);
    const index = this.users.findIndex((row) => row[0] === values[0]);
    if (index < 0) this.users.push([...values]);
    else this.users[index] = [...values];
  }
}

const sheet = new UsersSheet();
let h: Harness;
let ipCounter = 0;
const freshIp = () => {
  ipCounter += 1;
  return `10.77.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
};
const inject = (options: InjectOptions) => h.app.inject({ remoteAddress: freshIp(), ...options });

const guestCookie = (res: LightMyRequestResponse): Record<string, string> => {
  const cookie = res.cookies.find((c) => c.name === 'tgs_guest');
  return cookie ? { tgs_guest: cookie.value } : {};
};

async function newGuest() {
  const res = await inject({ method: 'POST', url: '/api/profile', headers: CSRF });
  expect(res.statusCode).toBe(200);
  return {
    cookies: guestCookie(res),
    profile: res.json<{ profile: { handle: string; kind: string } }>().profile,
  };
}

const rename = (cookies: Record<string, string>, handle: unknown, remoteAddress?: string) =>
  inject({
    method: 'PATCH',
    url: '/api/profile',
    headers: CSRF,
    cookies,
    payload: { handle },
    ...(remoteAddress ? { remoteAddress } : {}),
  });

const rowOf = (code: string) => sheet.users.find((row) => row[0] === code);
async function codeOf(handle: string) {
  const [row] = await h.database.db
    .select()
    .from(customerProfiles)
    .where(eq(customerProfiles.handleKey, handle.toLowerCase()));
  if (!row) throw new Error(`sin perfil ${handle}`);
  return row;
}

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness({}, { sheets: sheet });
});

afterAll(async () => {
  await h?.close();
});

beforeEach(() => {
  h.clock.now = new Date();
  sheet.failing = false;
  sheet.rateLimited = false;
  sheet.gate = undefined;
  sheet.onWrite = undefined;
  sheet.writes = [];
});

describe('nombre de usuario de invitados y cuentas', () => {
  it('el invitado recibe un nombre al azar, que se conserva en su navegador', async () => {
    const first = await newGuest();
    expect(first.profile.kind).toBe('guest');
    expect(first.profile.handle).toMatch(HANDLE_PATTERN);
    expect(first.cookies.tgs_guest).toBeTruthy();

    const again = await inject({
      method: 'POST',
      url: '/api/profile',
      headers: CSRF,
      cookies: first.cookies,
    });
    expect(again.json<{ profile: { handle: string } }>().profile.handle).toBe(first.profile.handle);
    // Otro navegador: otro nombre.
    const other = await newGuest();
    expect(other.profile.handle).not.toBe(first.profile.handle);
  });

  it('la cuenta de Google recibe su propio nombre al azar (nunca su nombre real ni su correo)', async () => {
    const { cookie } = await sessionFor(h, { email: 'perfil-cuenta@example.com' });
    const res = await inject({
      method: 'POST',
      url: '/api/profile',
      headers: CSRF,
      cookies: cookie,
    });
    expect(res.statusCode).toBe(200);
    const { profile } = res.json<{ profile: { handle: string; kind: string } }>();
    expect(profile.kind).toBe('account');
    expect(profile.handle).toMatch(HANDLE_PATTERN);
    expect(profile.handle.toLowerCase()).not.toContain('perfil');
    // Con sesión no se crea cookie de invitado.
    expect(guestCookie(res)).toEqual({});
  });

  it('dos pestañas que piden el nombre a la vez obtienen el mismo perfil', async () => {
    const { cookies } = await newGuest();
    const { userId, cookie } = await sessionFor(h, { email: 'perfil-paralelo@example.com' });
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        inject({ method: 'POST', url: '/api/profile', headers: CSRF, cookies: cookie }),
      ),
    );
    const handles = new Set(
      results.map((r) => r.json<{ profile: { handle: string } }>().profile.handle),
    );
    expect(handles.size).toBe(1);
    const rows = await h.database.db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, userId));
    expect(rows).toHaveLength(1);
    expect(cookies.tgs_guest).toBeTruthy();
  });

  it('el cliente cambia su nombre; el nuevo vale para la próxima visita', async () => {
    const { cookies } = await newGuest();
    const res = await rename(cookies, '  ElReyDelFF  ');
    expect(res.statusCode).toBe(200);
    expect(res.json<{ profile: { handle: string } }>().profile.handle).toBe('ElReyDelFF');
    const again = await inject({ method: 'POST', url: '/api/profile', headers: CSRF, cookies });
    expect(again.json<{ profile: { handle: string } }>().profile.handle).toBe('ElReyDelFF');
    const row = await codeOf('ElReyDelFF');
    expect(row.renames).toBe(1);
    expect(row.renamedAt).not.toBeNull();
  });

  it('dos clientes no pueden tener el mismo nombre (sin distinguir mayúsculas)', async () => {
    const a = await newGuest();
    const b = await newGuest();
    expect((await rename(a.cookies, 'PumaLetal77')).statusCode).toBe(200);
    const taken = await rename(b.cookies, 'pumaletal77');
    expect(taken.statusCode).toBe(409);
    expect(taken.json<{ error: { code: string } }>().error.code).toBe('HANDLE_TAKEN');
    // El dueño del nombre sí puede cambiarle las mayúsculas.
    expect((await rename(a.cookies, 'PUMALETAL77')).statusCode).toBe(200);
  });

  it('rechaza nombres reservados, con formato inválido o con números largos', async () => {
    const { cookies } = await newGuest();
    for (const [handle, code] of [
      ['TayGameStore', 'HANDLE_NOT_ALLOWED'],
      ['Soporte_TGS', 'HANDLE_NOT_ALLOWED'],
      ['4dm1n', 'HANDLE_NOT_ALLOWED'],
      ['X4dm1n', 'HANDLE_NOT_ALLOWED'],
      ['Lobo 3001234567', 'HANDLE_NOT_ALLOWED'],
      ['Lobo3001234567', 'HANDLE_NOT_ALLOWED'],
      ['<img src=x onerror=alert(1)>', 'HANDLE_NOT_ALLOWED'],
      ['=IMPORTXML("x")', 'HANDLE_NOT_ALLOWED'],
    ] as const) {
      const res = await rename(cookies, handle);
      expect(res.statusCode, handle).toBe(400);
      expect(res.json<{ error: { code: string } }>().error.code, handle).toBe(code);
    }
    for (const payload of [
      { handle: 5 },
      { handle: 'x'.repeat(61) },
      { handle: 'Lobo', admin: true },
    ]) {
      const res = await inject({
        method: 'PATCH',
        url: '/api/profile',
        headers: CSRF,
        cookies,
        payload,
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('solo el dueño de la tienda puede usar un nombre reservado', async () => {
    const owner = await sessionFor(h, { email: ADMIN_EMAIL, admin: true, sub: 'perfil-dueno' });
    const res = await rename(owner.cookie, 'TayGameStore');
    expect(res.statusCode).toBe(200);
    // Un administrador que no está en la lista del dueño no puede.
    const other = await sessionFor(h, { email: 'otro-admin@example.com', admin: true });
    expect((await rename(other.cookie, 'TayOficial')).statusCode).toBe(400);
  });

  it('sin la cabecera anti-CSRF no se crea ni se cambia el nombre', async () => {
    const created = await inject({ method: 'POST', url: '/api/profile' });
    expect(created.statusCode).toBe(403);
    const { cookies } = await newGuest();
    const changed = await inject({
      method: 'PATCH',
      url: '/api/profile',
      cookies,
      payload: { handle: 'SinCsrf' },
    });
    expect(changed.statusCode).toBe(403);
    const crossSite = await inject({
      method: 'PATCH',
      url: '/api/profile',
      headers: { ...CSRF, origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
      cookies,
      payload: { handle: 'SinCsrf' },
    });
    expect(crossSite.statusCode).toBe(403);
  });

  it('una misma conexión no puede fabricar perfiles de invitado sin límite', async () => {
    const remoteAddress = '10.99.99.99';
    for (let i = 0; i < GUEST_PROFILES_PER_IP_PER_DAY; i += 1) {
      const res = await h.app.inject({
        method: 'POST',
        url: '/api/profile',
        headers: CSRF,
        remoteAddress,
      });
      expect(res.statusCode).toBe(200);
    }
    const blocked = await h.app.inject({
      method: 'POST',
      url: '/api/profile',
      headers: CSRF,
      remoteAddress,
    });
    expect(blocked.statusCode).toBe(429);
    // Al día siguiente vuelve a poder.
    h.clock.now = new Date(Date.now() + 25 * 3_600_000);
    const tomorrow = await h.app.inject({
      method: 'POST',
      url: '/api/profile',
      headers: CSRF,
      remoteAddress,
    });
    expect(tomorrow.statusCode).toBe(200);
  });
});

describe('pestaña «Usuarios» de la hoja', () => {
  it('cada cliente nuevo queda en la hoja; un cambio de nombre reescribe su misma fila', async () => {
    const { cookies, profile } = await newGuest();
    await h.settle();
    const row = await codeOf(profile.handle);
    const written = rowOf(row.code);
    expect(written).toHaveLength(USER_SHEET_COLUMNS.length);
    expect(written?.slice(0, 3)).toEqual([row.code, profile.handle, 'Invitado']);
    expect(written?.[5]).toBe(0);

    const before = sheet.users.length;
    expect((await rename(cookies, 'CondorEstelar5')).statusCode).toBe(200);
    await h.settle();
    expect(sheet.users).toHaveLength(before);
    expect(rowOf(row.code)?.slice(0, 3)).toEqual([row.code, 'CondorEstelar5', 'Invitado']);
    expect(rowOf(row.code)?.[5]).toBe(1);
    const saved = await codeOf('CondorEstelar5');
    expect(saved.sheetSyncedVersion).toBe(saved.sheetVersion);
  });

  it('la cuenta aparece con su proveedor y sin correo ni nombre real', async () => {
    const { cookie } = await sessionFor(h, { email: 'hoja-cuenta@example.com' });
    const res = await inject({
      method: 'POST',
      url: '/api/profile',
      headers: CSRF,
      cookies: cookie,
    });
    await h.settle();
    const { handle } = res.json<{ profile: { handle: string } }>().profile;
    const row = await codeOf(handle);
    const written = rowOf(row.code);
    expect(written?.[2]).toBe('Cuenta (Google)');
    expect(JSON.stringify(written)).not.toContain('example.com');
  });

  it('si Google falla, la fila se reintenta más tarde sin perder el cambio', async () => {
    sheet.failing = true;
    const { profile } = await newGuest();
    await h.settle();
    let row = await codeOf(profile.handle);
    expect(rowOf(row.code)).toBeUndefined();
    expect(row.sheetSyncedVersion).toBe(0);
    expect(row.sheetLastError).toContain('no disponible');
    expect(row.sheetLeaseUntil).toBeNull();

    sheet.failing = false;
    // Antes del reintento programado no se vuelve a llamar a Google.
    expect(await syncProfilesToSheet(h.deps, { profileId: row.id })).toBe(0);
    h.clock.now = new Date(Date.now() + 2 * 60_000);
    expect(await syncProfilesToSheet(h.deps, { profileId: row.id })).toBe(1);
    row = await codeOf(profile.handle);
    expect(rowOf(row.code)?.[1]).toBe(profile.handle);
    expect(row.sheetLastError).toBeNull();
    expect(row.sheetAttempts).toBe(0);
  });

  it('si Google pide esperar (cuota), la fila se aplaza sin gastar un intento', async () => {
    sheet.rateLimited = true;
    const { profile } = await newGuest();
    await h.settle();
    const row = await codeOf(profile.handle);
    expect(row.sheetAttempts).toBe(0);
    expect(row.sheetSyncedVersion).toBe(0);
    expect(row.sheetNextAttemptAt.getTime()).toBeGreaterThan(h.clock.now.getTime());
    sheet.rateLimited = false;
    h.clock.now = new Date(Date.now() + 4 * 60_000);
    await syncProfilesToSheet(h.deps, { profileId: row.id });
    expect(rowOf(row.code)?.[1]).toBe(profile.handle);
  });

  it('un cambio de nombre mientras se escribe la fila termina con el nombre nuevo en la hoja', async () => {
    const { cookies } = await newGuest();
    await h.settle();
    sheet.writes = [];
    let open: () => void = () => undefined;
    sheet.gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    let reached: () => void = () => undefined;
    const writing = new Promise<void>((resolve) => {
      reached = resolve;
    });
    sheet.onWrite = () => reached();
    expect((await rename(cookies, 'OrcaVoraz1')).statusCode).toBe(200);
    await writing; // la escritura de «OrcaVoraz1» está en camino (Google lento)
    sheet.onWrite = undefined;
    // Una segunda escritura que se colara ahora llegaría a la hoja antes que la primera.
    sheet.gate = undefined;
    expect((await rename(cookies, 'OrcaVoraz2')).statusCode).toBe(200);
    // Margen para que una segunda escritura (que no debe existir) llegue antes que la primera.
    for (let waited = 0; waited < 500 && !sheet.writes.length; waited += 25) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(sheet.writes).toEqual([]);
    open();
    await h.settle();
    const row = await codeOf('OrcaVoraz2');
    expect(rowOf(row.code)?.[1]).toBe('OrcaVoraz2');
    expect(sheet.writes.map((w) => w[1])).toEqual(['OrcaVoraz1', 'OrcaVoraz2']);
    expect(row.sheetSyncedVersion).toBe(row.sheetVersion);
  });

  it('la tarea programada escribe los clientes que quedaron pendientes', async () => {
    sheet.failing = true;
    const { profile } = await newGuest();
    await h.settle();
    sheet.failing = false;
    h.clock.now = new Date(Date.now() + 2 * 60_000);
    await runJob(h.deps, 'sendNotifications');
    const row = await codeOf(profile.handle);
    expect(rowOf(row.code)?.[1]).toBe(profile.handle);
  });
});
