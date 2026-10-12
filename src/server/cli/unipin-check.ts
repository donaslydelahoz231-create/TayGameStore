import type { AppConfig } from '../config/env.js';
import {
  classifyCreate,
  classifyInquiry,
  classifyValidate,
  UNIPIN_PATHS,
  type UniPinTopupProvider,
} from '../integrations/topup/unipin.js';

/**
 * Comprobación de la recarga directa con UniPin contra su API real, antes de activarla:
 *
 *   npm run unipin:check                                  credenciales, juegos y catálogo
 *   npm run unipin:check -- --uid <ID>                    además valida un ID (no cobra)
 *   npm run unipin:check -- --uid <ID> --compra-prueba    solo staging: recarga de prueba
 *
 * Confirma lo que el código no pudo verificar sin credenciales de socio: que la firma es
 * aceptada, que los códigos de juego y denominación de UNIPIN_CATALOG existen, qué campos pide
 * UniPin para el ID y la forma de sus respuestas. Nunca imprime credenciales; de las respuestas
 * muestra solo los nombres de los campos. La compra de prueba se niega fuera de staging.
 */

export interface CheckIo {
  out(line: string): void;
}

export class CheckUsageError extends Error {}

/** Todos los valores de una clave, a cualquier profundidad. */
export function collect(value: unknown, key: string, found: unknown[] = []): unknown[] {
  if (Array.isArray(value)) {
    for (const item of value) collect(item, key, found);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === key) found.push(v);
      collect(v, key, found);
    }
  }
  return found;
}

/** ¿Aparece este texto como valor en algún lugar de la respuesta? */
function containsValue(value: unknown, wanted: string): boolean {
  if (typeof value === 'string' || typeof value === 'number') return String(value) === wanted;
  if (Array.isArray(value)) return value.some((item) => containsValue(item, wanted));
  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => containsValue(item, wanted));
  }
  return false;
}

/** Estructura de una respuesta sin sus valores: `status, game_list[game_code, name]`. */
export function shape(value: unknown, depth = 0): string {
  if (depth > 2) return '…';
  if (Array.isArray(value)) return value.length ? `[${shape(value[0], depth + 1)}]` : '[]';
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([k, v]) => (v && typeof v === 'object' ? `${k}${shape(v, depth + 1)}` : k))
      .join(', ');
  }
  return '';
}

export async function runUnipinCheck(
  args: string[],
  config: AppConfig,
  makeProvider: (topup: NonNullable<AppConfig['topup']>) => UniPinTopupProvider,
  io: CheckIo,
): Promise<boolean> {
  const topup = config.topup;
  if (!topup) {
    throw new CheckUsageError(
      'Recarga directa apagada: define TOPUP_PROVIDER=unipin, UNIPIN_PARTNER_ID, UNIPIN_SECRET_KEY y UNIPIN_CATALOG.',
    );
  }
  const uidAt = args.indexOf('--uid');
  const uid = uidAt >= 0 ? args[uidAt + 1] : undefined;
  if (uidAt >= 0 && !/^\d{6,12}$/.test(uid ?? '')) {
    throw new CheckUsageError('--uid debe ser un ID de jugador de 6 a 12 dígitos.');
  }
  const purchase = args.includes('--compra-prueba');
  if (purchase && !uid) throw new CheckUsageError('--compra-prueba necesita --uid <ID>.');
  if (purchase && topup.env !== 'staging') {
    throw new CheckUsageError(
      'La compra de prueba solo corre con UNIPIN_ENV=staging: en producción gastaría saldo real.',
    );
  }

  const provider = makeProvider(topup);
  let ok = true;
  const fail = (line: string) => {
    ok = false;
    io.out(`FALLA  ${line}`);
  };
  io.out(`UniPin ${topup.env} · ${topup.baseUrl}`);

  // 1. Credenciales y lista de juegos.
  const list = await provider.call(UNIPIN_PATHS.list, {});
  if (!list.ok) {
    fail(
      `lista de juegos: ${list.uncertain ? list.reason : `error ${list.code}`} (702 o http_401/403: socio o llave incorrectos)`,
    );
    return false;
  }
  const codes = collect(list.body, 'game_code').map(String);
  io.out(`OK     firma aceptada · ${codes.length} juegos`);
  io.out(`       respuesta: ${shape(list.body)}`);
  const freeFire = codes.filter((code) => /free\s*fire|ff/i.test(code));
  if (freeFire.length) io.out(`       códigos que parecen Free Fire: ${freeFire.join(', ')}`);

  // 2. Cada servidor del catálogo: juego, denominaciones y campos del ID.
  for (const [server, region] of Object.entries(topup.catalog)) {
    if (codes.length && !codes.includes(region.game)) {
      fail(`${server}: el juego ${region.game} no está en la lista de UniPin`);
      continue;
    }
    const detail = await provider.call(UNIPIN_PATHS.detail, { game_code: region.game });
    if (!detail.ok) {
      fail(
        `${server}: detalle de ${region.game}: ${detail.uncertain ? detail.reason : `error ${detail.code}`}`,
      );
      continue;
    }
    const missing = Object.entries(region.skus)
      .map(([sku, entry]) => [sku, entry.denomination] as const)
      .filter(([, denomination]) => !containsValue(detail.body, denomination));
    if (missing.length) {
      fail(
        `${server}: denominaciones que UniPin no lista: ${missing.map(([sku, d]) => `${sku}→${d}`).join(', ')}`,
      );
    } else {
      io.out(
        `OK     ${server}: ${region.game} con sus ${Object.keys(region.skus).length} paquetes`,
      );
    }
    const fieldNames = collect(collect(detail.body, 'fields'), 'name').map(String);
    io.out(`       respuesta: ${shape(detail.body)}`);
    if (fieldNames.length) {
      const line = `campos que pide UniPin: ${fieldNames.join(', ')} (la tienda envía «${region.uidField}»)`;
      if (fieldNames.includes(region.uidField)) io.out(`OK     ${server}: ${line}`);
      else fail(`${server}: ${line}; ajusta uidField en UNIPIN_CATALOG`);
    }
  }

  // 3. Validar un ID (no cobra).
  if (!uid) {
    io.out('—      para validar un ID: npm run unipin:check -- --uid <tu ID>');
    return ok;
  }
  const [server, region] = Object.entries(topup.catalog)[0] ?? [];
  if (!server || !region) return ok;
  const reply = await provider.call(UNIPIN_PATHS.validate, {
    game_code: region.game,
    fields: { [region.uidField]: uid },
  });
  const validated = classifyValidate(reply);
  io.out(`       respuesta de validar: ${reply.ok ? shape(reply.body) : '(error)'}`);
  if (validated.kind !== 'ok') {
    fail(
      `validar ${uid} en ${server}: ${validated.kind === 'failed' ? `error ${validated.code}` : validated.reason}`,
    );
    return false;
  }
  io.out(
    `OK     UniPin reconoce el ID ${uid}${validated.username ? ` (${validated.username})` : ''}`,
  );
  if (!purchase) return ok;

  // 4. Solo staging: recarga de prueba y consulta, para confirmar la forma de las respuestas.
  const [sku, entry] = Object.entries(region.skus)[0] ?? [];
  const denomination = entry?.denomination;
  if (!sku || !denomination) return ok;
  const referenceNo = `TGS-PRUEBA-${Date.now()}`;
  const created = await provider.call(UNIPIN_PATHS.create, {
    game_code: region.game,
    validation_token: validated.token,
    reference_no: referenceNo,
    denomination_id: denomination,
  });
  io.out(`       respuesta de crear: ${created.ok ? shape(created.body) : '(error)'}`);
  const result = classifyCreate(created);
  if (result.kind !== 'success') {
    fail(
      `recarga de prueba ${referenceNo} (${sku}): ${result.kind}${'code' in result ? ` ${result.code}` : ''}`,
    );
    return false;
  }
  io.out(`OK     recarga de prueba ${referenceNo}: transacción ${result.transaction}`);
  const inquiry = await provider.call(UNIPIN_PATHS.inquiry, { reference_no: referenceNo });
  io.out(`       respuesta de consultar: ${inquiry.ok ? shape(inquiry.body) : '(error)'}`);
  const checked = classifyInquiry(inquiry);
  if (checked.kind === 'success') io.out(`OK     la consulta confirma la recarga ${referenceNo}`);
  else
    fail(
      `la consulta no confirma ${referenceNo}: ${'reason' in checked ? checked.reason : checked.kind}`,
    );
  return ok;
}
