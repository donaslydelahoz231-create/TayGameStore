import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../db/client.js';
import { playerLookups } from '../db/schema.js';
import type { PlayerLookupResult, PlayerVerifier } from '../integrations/player/verifier.js';
import { AppError } from '../plugins/errors.js';
import type { ServiceDeps } from './context.js';

/** Vigencia de una consulta de jugador antes de usarla en el checkout. */
const LOOKUP_TTL_MS = 30 * 60_000;
const LOOKUP_TIMEOUT_MS = 8_000;

export const lookupSchema = z.strictObject({
  game: z.literal('freefire'),
  uid: z.string().regex(/^\d{6,12}$/),
});

export const playerLookupRefSchema = z.strictObject({
  ref: z.uuid(),
  /** Nickname que el cliente vio y confirmó ("Sí, es mi cuenta"). */
  nickname: z.string().min(1).max(60),
});

/** Dueño de una consulta: usuario con sesión o navegador invitado. */
export function ownerKeyOf(userId: string | undefined, guestHash: string | undefined) {
  if (userId) return `u:${userId}`;
  if (guestHash) return `g:${guestHash}`;
  return undefined;
}

const unavailable = () =>
  new AppError(
    'PLAYER_LOOKUP_UNAVAILABLE',
    503,
    'No pudimos consultar el ID ahora. Nuestro equipo lo verificará al crear tu pedido.',
  );

export async function lookupPlayer(
  deps: ServiceDeps,
  verifier: PlayerVerifier | undefined,
  input: z.infer<typeof lookupSchema>,
  ownerKey: string,
): Promise<{ lookupRef: string; nickname: string; region: string; expiresAt: string }> {
  if (!verifier) throw unavailable();
  let result: PlayerLookupResult;
  try {
    result = await verifier.lookup(input, AbortSignal.timeout(LOOKUP_TIMEOUT_MS));
  } catch (error) {
    deps.log.warn({ err: error, provider: verifier.name }, 'player lookup failed');
    result = { status: 'UNAVAILABLE', reason: 'provider_error' };
  }
  if (result.status === 'UNAVAILABLE') throw unavailable();
  if (result.status === 'NOT_FOUND') {
    // Mensaje genérico: no confirma ni niega nada más allá del ID consultado.
    throw new AppError('PLAYER_NOT_FOUND', 422, 'No encontramos ese ID de jugador. Revísalo.');
  }
  const expiresAt = new Date(deps.now().getTime() + LOOKUP_TTL_MS);
  const [row] = await deps.db
    .insert(playerLookups)
    .values({
      ownerKey,
      game: input.game,
      playerUid: input.uid,
      provider: verifier.name,
      nickname: result.nickname.slice(0, 60),
      region: result.region.slice(0, 60),
      expiresAt,
    })
    .returning();
  if (!row) throw new Error('no se guardó la consulta');
  return {
    lookupRef: row.id,
    nickname: row.nickname,
    region: row.region,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Usa una consulta en el checkout: debe ser del mismo dueño, del mismo juego y UID, vigente,
 * no usada, y con el nickname que el cliente confirmó. Se marca usada (CAS) en la transacción.
 */
export async function consumeLookup(
  tx: Tx,
  input: {
    ref: string;
    nickname: string;
    ownerKey: string | undefined;
    game: string;
    uid: string;
    now: Date;
  },
) {
  const expired = () =>
    new AppError(
      'PLAYER_LOOKUP_EXPIRED',
      409,
      'La verificación del jugador caducó o no coincide. Vuelve a consultar el ID.',
    );
  if (!input.ownerKey) throw expired();
  const [row] = await tx
    .update(playerLookups)
    .set({ usedAt: input.now })
    .where(
      and(
        eq(playerLookups.id, input.ref),
        eq(playerLookups.ownerKey, input.ownerKey),
        eq(playerLookups.game, input.game),
        eq(playerLookups.playerUid, input.uid),
        eq(playerLookups.nickname, input.nickname),
        gt(playerLookups.expiresAt, input.now),
        isNull(playerLookups.usedAt),
      ),
    )
    .returning();
  if (!row) throw expired();
  return row;
}

/** Limpieza: consultas caducadas (no contienen más que UID, nickname y región). */
export async function purgeExpiredLookups(deps: ServiceDeps): Promise<number> {
  const removed = await deps.db
    .delete(playerLookups)
    .where(lt(playerLookups.expiresAt, new Date(deps.now().getTime() - 24 * 3_600_000)))
    .returning({ id: playerLookups.id });
  return removed.length;
}
