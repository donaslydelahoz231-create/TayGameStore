import { randomBytes, randomInt } from 'node:crypto';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { customerProfiles, userIdentities, users, type CustomerProfileKind } from '../db/schema.js';
import { SheetsError } from '../integrations/sheets/google-sheets.js';
import { AppError } from '../plugins/errors.js';
import type { ServiceDeps } from './context.js';
import { sheetText } from './notifications.js';
import { isUniqueViolation } from './orders.js';

/**
 * Nombre de usuario (alias) de cada cliente: invitado (cookie del navegador) o con cuenta (Google
 * o Facebook). Nace al azar y el cliente lo puede cambiar. Es un alias: nunca el nombre real ni el
 * correo, así que puede ir a la hoja de Google sin exponer datos personales.
 *
 * La hoja es un registro auxiliar: cada creación o cambio de nombre sube `sheet_version` y la fila
 * se escribe en segundo plano (y la reintenta la tarea programada si Google falla).
 */

export const HANDLE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;

/** Cuerpo de `PATCH /api/profile`. El contenido se valida aparte, con mensajes claros. */
export const renameProfileSchema = z.strictObject({ handle: z.string().max(60) });

/** Perfiles de invitado nuevos por conexión (hash de IP) en 24 h: frena a quien los fabrica. */
export const GUEST_PROFILES_PER_IP_PER_DAY = 20;

/**
 * Partes de nombre que nadie fuera de la tienda puede usar: evitan que un cliente se haga pasar
 * por el dueño, el soporte o un medio de pago. Se comparan sin `_` y leyendo los números como
 * letras (4dm1n = admin).
 */
const RESERVED_PARTS = [
  'admin',
  'taygame',
  'soporte',
  'support',
  'moderador',
  'moderator',
  'staff',
  'oficial',
  'official',
  'dueno',
  'owner',
  'garena',
  'freefire',
  'nequi',
  'mercadopago',
  'sistema',
  'system',
  'webmaster',
];
/** «Tay» y «TGS» solos o seguidos de números (Tay, Tay_1, TGS2…): son la tienda. */
const RESERVED_PREFIX = /^(tay|tgs)(?![a-z])/;
const LEET: Record<string, string> = { '0': 'o', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b' };

/** El nombre sin `_` tal cual y leyendo sus números como letras (con 1 = i y con 1 = l). */
function readings(handle: string): string[] {
  const base = handle.toLowerCase().replace(/_/g, '');
  const swap = (one: string) => base.replace(/[0-9]/g, (d) => (d === '1' ? one : (LEET[d] ?? d)));
  return [base, swap('i'), swap('l')];
}

export type HandleProblem = 'format' | 'reserved' | 'digits';

/** Por qué un nombre no sirve, o `undefined` si sirve. `allowReserved`: solo el dueño. */
export function handleProblem(
  handle: string,
  options: { allowReserved?: boolean } = {},
): HandleProblem | undefined {
  if (!HANDLE_PATTERN.test(handle)) return 'format';
  // Un número largo puede ser un celular o un documento: nunca en un alias.
  if (/[0-9]{7,}/.test(handle)) return 'digits';
  if (options.allowReserved) return undefined;
  const reserved = readings(handle).some(
    (text) => RESERVED_PREFIX.test(text) || RESERVED_PARTS.some((part) => text.includes(part)),
  );
  return reserved ? 'reserved' : undefined;
}

const HANDLE_MESSAGES: Record<HandleProblem, string> = {
  format: 'Usa de 3 a 20 caracteres: letras sin tildes, números o _, y que empiece por una letra.',
  reserved: 'Ese nombre está reservado para la tienda. Elige otro.',
  digits: 'No pongas números de celular ni de documento en tu nombre de usuario.',
};

const NOUNS = [
  'Fenix', 'Lobo', 'Tigre', 'Halcon', 'Dragon', 'Pantera', 'Cobra', 'Puma',
  'Aguila', 'Tiburon', 'Rayo', 'Cometa', 'Titan', 'Ninja', 'Vikingo', 'Samurai',
  'Jaguar', 'Condor', 'Cuervo', 'Leon', 'Zorro', 'Buho', 'Orca', 'Grifo',
]; // prettier-ignore
/** Adjetivos sin género: combinan con cualquier sustantivo («PanteraVeloz», «LoboVeloz»). */
const ADJECTIVES = [
  'Veloz', 'Feroz', 'Audaz', 'Letal', 'Fugaz', 'Tenaz', 'Voraz', 'Rebelde', 'Salvaje',
  'Leal', 'Agil', 'Estelar', 'Lunar', 'Solar', 'Brutal', 'Glacial', 'Imparable', 'Invencible',
]; // prettier-ignore

/** Nombre al azar, p. ej. «HalconFugaz482». Siempre cumple `handleProblem`. */
export function randomHandle(): string {
  const noun = NOUNS[randomInt(NOUNS.length)] ?? 'Jugador';
  const adjective = ADJECTIVES[randomInt(ADJECTIVES.length)] ?? 'Veloz';
  return `${noun}${adjective}${randomInt(10, 1000)}`;
}

export const HANDLE_WORDS = { nouns: NOUNS, adjectives: ADJECTIVES } as const;

/** Base32 de Crockford (sin I, L, O ni U): el código no se confunde al leerlo. */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function randomCode(): string {
  const bytes = randomBytes(8);
  let code = 'U-';
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

/** Dueño del perfil: la cuenta con sesión o, sin sesión, el navegador invitado. */
export interface ProfileOwner {
  userId?: string | undefined;
  guestHash?: string | undefined;
  ipHash: string;
  /** El dueño de la tienda (rol admin en la allowlist) puede usar nombres reservados. */
  isStoreOwner?: boolean | undefined;
}

export interface PublicProfile {
  handle: string;
  kind: CustomerProfileKind;
}

type ProfileRow = typeof customerProfiles.$inferSelect;

const publicProfile = (row: ProfileRow): PublicProfile => ({ handle: row.handle, kind: row.kind });

function ownerFilter(owner: ProfileOwner) {
  if (owner.userId) return eq(customerProfiles.userId, owner.userId);
  if (owner.guestHash) return eq(customerProfiles.guestHash, owner.guestHash);
  throw new Error('perfil sin dueño');
}

async function findProfile(deps: ServiceDeps, owner: ProfileOwner) {
  const [row] = await deps.db.select().from(customerProfiles).where(ownerFilter(owner)).limit(1);
  return row;
}

/** El perfil del cliente; si no tiene, lo crea con un nombre al azar. */
export async function ensureProfile(
  deps: ServiceDeps,
  owner: ProfileOwner,
): Promise<{ profile: PublicProfile; created: boolean }> {
  const existing = await findProfile(deps, owner);
  if (existing) return { profile: publicProfile(existing), created: false };
  const guest = !owner.userId;
  if (guest) {
    const since = new Date(deps.now().getTime() - 24 * 3_600_000);
    const [recent] = await deps.db
      .select({ total: sql<number>`count(*)::int` })
      .from(customerProfiles)
      .where(
        and(
          eq(customerProfiles.createdIpHash, owner.ipHash),
          gt(customerProfiles.createdAt, since),
        ),
      );
    if ((recent?.total ?? 0) >= GUEST_PROFILES_PER_IP_PER_DAY) {
      throw new AppError(
        'RATE_LIMITED',
        429,
        'Se crearon demasiados perfiles de invitado desde esta conexión. Entra con Google o inténtalo mañana.',
      );
    }
  }
  // Un nombre al azar puede chocar con otro (o dos pestañas crean el perfil a la vez): se
  // reintenta con otro nombre, y si el perfil ya apareció, se usa ese.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const handle = randomHandle();
    const [row] = await deps.db
      .insert(customerProfiles)
      .values({
        code: randomCode(),
        kind: guest ? 'guest' : 'account',
        userId: owner.userId ?? null,
        guestHash: guest ? (owner.guestHash ?? null) : null,
        handle,
        handleKey: handle.toLowerCase(),
        createdIpHash: guest ? owner.ipHash : null,
        // Con el reloj de la aplicación, el mismo que compara la cola (no el de la base).
        sheetNextAttemptAt: deps.now(),
      })
      .onConflictDoNothing()
      .returning();
    if (row) {
      syncProfileSoon(deps, row.id);
      return { profile: publicProfile(row), created: true };
    }
    const raced = await findProfile(deps, owner);
    if (raced) return { profile: publicProfile(raced), created: false };
  }
  throw new Error('no se pudo asignar un nombre de usuario');
}

/** Cambia el nombre de usuario del cliente (único sin distinguir mayúsculas). */
export async function renameProfile(
  deps: ServiceDeps,
  owner: ProfileOwner,
  input: z.infer<typeof renameProfileSchema>,
): Promise<PublicProfile> {
  const handle = input.handle.trim();
  const problem = handleProblem(handle, { allowReserved: owner.isStoreOwner === true });
  if (problem) throw new AppError('HANDLE_NOT_ALLOWED', 400, HANDLE_MESSAGES[problem]);
  await ensureProfile(deps, owner);
  const current = await findProfile(deps, owner);
  if (!current) throw new Error('perfil no encontrado tras crearlo');
  if (current.handle === handle) return publicProfile(current);
  const now = deps.now();
  try {
    const [row] = await deps.db
      .update(customerProfiles)
      .set({
        handle,
        handleKey: handle.toLowerCase(),
        renames: sql`${customerProfiles.renames} + 1`,
        renamedAt: now,
        sheetVersion: sql`${customerProfiles.sheetVersion} + 1`,
        sheetAttempts: 0,
        sheetNextAttemptAt: now,
        sheetLastError: null,
        updatedAt: now,
      })
      .where(eq(customerProfiles.id, current.id))
      .returning();
    if (!row) throw new Error('perfil no encontrado al renombrar');
    syncProfileSoon(deps, row.id);
    return publicProfile(row);
  } catch (error) {
    if (isUniqueViolation(error, 'customer_profiles_handle_key')) {
      throw new AppError(
        'HANDLE_TAKEN',
        409,
        'Ese nombre de usuario ya está en uso. Prueba con otro.',
      );
    }
    throw error;
  }
}

// --- Pestaña «Usuarios» de la hoja de Google ---------------------------------------------------

/** Encabezados de la pestaña «Usuarios» (fila 1; ver docs/google-sheets.md). */
export const USER_SHEET_COLUMNS = [
  'Código',
  'Usuario',
  'Tipo',
  'Creado (Colombia)',
  'Último cambio de nombre (Colombia)',
  'Cambios de nombre',
  'Actualizado (Colombia)',
] as const;

const bogotaTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Bogota',
  dateStyle: 'short',
  timeStyle: 'short',
});

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  facebook: 'Facebook',
  discord: 'Discord',
};

/** «Invitado» o «Cuenta (Google)», «Cuenta (Google + Facebook)»… */
export function profileKindLabel(kind: CustomerProfileKind, providers: readonly string[]): string {
  if (kind === 'guest') return 'Invitado';
  const names = providers.map((provider) => PROVIDER_LABELS[provider] ?? provider);
  return names.length ? `Cuenta (${names.join(' + ')})` : 'Cuenta';
}

/** Fila de un cliente: solo el alias y fechas. Nunca correo, nombre real, IP ni cookie. */
export function userSheetRow(
  profile: {
    code: string;
    handle: string;
    kind: CustomerProfileKind;
    renames: number;
    renamedAt: Date | null;
    createdAt: Date;
  },
  providers: readonly string[],
  updatedAt: Date,
): (string | number)[] {
  return [
    profile.code,
    sheetText(profile.handle),
    profileKindLabel(profile.kind, providers),
    bogotaTime.format(profile.createdAt),
    profile.renamedAt ? bogotaTime.format(profile.renamedAt) : '',
    profile.renames,
    bogotaTime.format(updatedAt),
  ];
}

/**
 * Mientras una pasada escribe la fila, la reserva (`sheet_lease_until`) impide que otra la tome,
 * aunque el cliente cambie el nombre: así dos escrituras de la misma fila nunca compiten y la
 * última en llegar a la hoja siempre es la más nueva.
 */
const LEASE_MS = 5 * 60_000;
const BACKOFF_MINUTES = [1, 5, 15, 60];
const RATE_LIMIT_WAIT_MS = 60_000;
const RATE_LIMIT_JITTER_MS = 120_000;
/** Tope de una pasada (las filas van de a una, por la cuota de Google por minuto). */
const PASS_BUDGET_MS = 20_000;

type ClaimedProfile = {
  id: string;
  code: string;
  kind: CustomerProfileKind;
  user_id: string | null;
  handle: string;
  renames: number;
  renamed_at: Date | string | null;
  created_at: Date | string;
  sheet_version: number;
  sheet_attempts: number;
};

/** Escribe (o reescribe) en segundo plano la fila del cliente en la hoja. Nunca lanza. */
export function syncProfileSoon(deps: ServiceDeps, profileId: string): void {
  if (!deps.sheets) return;
  const task = syncProfilesToSheet(deps, { profileId }).catch((error: unknown) => {
    deps.log.error({ err: error }, 'perfiles: envío inmediato a la hoja falló');
  });
  deps.background?.(task);
}

async function providersByUser(deps: ServiceDeps, userIds: string[]) {
  const result = new Map<string, string[]>();
  if (!userIds.length) return result;
  const add = (userId: string, provider: string) =>
    result.set(userId, [...(result.get(userId) ?? []), provider]);
  const accounts = await deps.db
    .select({ id: users.id, googleSub: users.googleSub })
    .from(users)
    .where(inArray(users.id, userIds));
  for (const account of accounts) if (account.googleSub) add(account.id, 'google');
  const identities = await deps.db
    .select({ userId: userIdentities.userId, provider: userIdentities.provider })
    .from(userIdentities)
    .where(inArray(userIdentities.userId, userIds))
    .orderBy(userIdentities.provider);
  for (const identity of identities) add(identity.userId, identity.provider);
  return result;
}

/**
 * Escribe en la pestaña «Usuarios» las filas pendientes (de un perfil o de todos). Nunca lanza:
 * si Google falla, la fila se reintenta más tarde. Sin hoja configurada no hace nada (ni consulta
 * la base), y al conectarla se escriben también los clientes que ya existían.
 */
export async function syncProfilesToSheet(
  deps: ServiceDeps,
  options: { profileId?: string; limit?: number } = {},
): Promise<number> {
  const { sent, rearmed } = await syncPass(deps, options);
  // Un cliente cambió el nombre mientras se escribía su fila: se reescribe enseguida con el
  // nombre nuevo. Una sola pasada extra: nunca un bucle.
  return rearmed ? sent + (await syncPass(deps, options)).sent : sent;
}

async function syncPass(
  deps: ServiceDeps,
  options: { profileId?: string; limit?: number },
): Promise<{ sent: number; rearmed: boolean }> {
  const sheets = deps.sheets;
  if (!sheets) return { sent: 0, rearmed: false };
  const now = deps.now();
  const byId = options.profileId ? sql`and id = ${options.profileId}` : sql``;
  let claimed: ClaimedProfile[];
  try {
    const result = await deps.db.execute<ClaimedProfile>(sql`
      update customer_profiles
         set sheet_attempts = sheet_attempts + 1,
             sheet_lease_until = ${new Date(now.getTime() + LEASE_MS)}
       where id in (
         select id from customer_profiles
          where sheet_synced_version < sheet_version
            and sheet_next_attempt_at <= ${now}
            and (sheet_lease_until is null or sheet_lease_until <= ${now}) ${byId}
          order by created_at
          limit ${options.limit ?? 20}
          for update skip locked)
      returning id, code, kind, user_id, handle, renames, renamed_at, created_at,
                sheet_version, sheet_attempts`);
    claimed = result.rows;
  } catch (error) {
    deps.log.error({ err: error }, 'perfiles: no se pudo reservar la cola de la hoja');
    return { sent: 0, rearmed: false };
  }
  if (!claimed.length) return { sent: 0, rearmed: false };

  const providers = await providersByUser(
    deps,
    claimed.flatMap((row) => (row.user_id ? [row.user_id] : [])),
  );
  const started = Date.now();
  let sent = 0;
  let throttled = false;
  let rearmed = false;
  // La fila vuelve a la cola sin gastar un intento (cuota de Google o fin de la pasada).
  const release = (row: ClaimedProfile, waitMs: number) =>
    deps.db
      .update(customerProfiles)
      .set({
        sheetAttempts: sql`greatest(${customerProfiles.sheetAttempts} - 1, 0)`,
        sheetNextAttemptAt: new Date(deps.now().getTime() + waitMs),
        sheetLeaseUntil: null,
      })
      .where(eq(customerProfiles.id, row.id));

  for (const row of claimed) {
    if (throttled) {
      await release(row, RATE_LIMIT_WAIT_MS + randomInt(RATE_LIMIT_JITTER_MS));
      continue;
    }
    if (Date.now() - started > PASS_BUDGET_MS) {
      await release(row, 0);
      continue;
    }
    try {
      await sheets.upsertRow(
        'users',
        userSheetRow(
          {
            code: row.code,
            handle: row.handle,
            kind: row.kind,
            renames: row.renames,
            renamedAt: row.renamed_at ? new Date(row.renamed_at) : null,
            createdAt: new Date(row.created_at),
          },
          row.user_id ? (providers.get(row.user_id) ?? []) : [],
          deps.now(),
        ),
      );
      sent += 1;
      const [saved] = await deps.db
        .update(customerProfiles)
        .set({
          sheetSyncedVersion: sql`greatest(${customerProfiles.sheetSyncedVersion}, ${row.sheet_version})`,
          sheetAttempts: 0,
          sheetLastError: null,
          sheetLeaseUntil: null,
        })
        .where(eq(customerProfiles.id, row.id))
        .returning({ version: customerProfiles.sheetVersion });
      // El cliente cambió el nombre mientras se escribía: la fila sigue pendiente.
      if (saved && saved.version > row.sheet_version) rearmed = true;
    } catch (error) {
      if (error instanceof SheetsError && error.status === 429) {
        throttled = true;
        await release(row, RATE_LIMIT_WAIT_MS + randomInt(RATE_LIMIT_JITTER_MS));
        continue;
      }
      // Solo el mensaje propio del adaptador: nunca credenciales ni URLs con tokens.
      const reason = error instanceof Error ? error.message.slice(0, 300) : 'error';
      const waitMinutes = BACKOFF_MINUTES[row.sheet_attempts - 1] ?? 60;
      await deps.db
        .update(customerProfiles)
        .set({
          sheetLastError: reason,
          sheetNextAttemptAt: new Date(deps.now().getTime() + waitMinutes * 60_000),
          sheetLeaseUntil: null,
        })
        .where(eq(customerProfiles.id, row.id));
      deps.log.warn(
        { profileCode: row.code, attempts: row.sheet_attempts, reason },
        'perfiles: la fila de la hoja no se pudo escribir; se reintentará',
      );
    }
  }
  if (throttled) {
    deps.log.warn(
      { alert: 'sheets_rate_limited' },
      'Google Sheets pidió esperar (cuota por minuto): filas de usuarios aplazadas',
    );
  }
  return { sent, rearmed: rearmed && !throttled };
}
