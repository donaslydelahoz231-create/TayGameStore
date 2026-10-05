import { and, eq, gt, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { blocklist } from '../db/schema.js';
import { audit, SYSTEM_ACTOR, type ServiceDeps } from './context.js';

/**
 * Escudo anti-abuso: ciclo detección → contención → revisión → expiración.
 *
 * - Detección: cada señal de comportamiento malicioso suma puntos a la huella de IP (hash con
 *   pepper; nunca la IP en claro) dentro de una ventana deslizante.
 * - Contención: al superar el umbral, bloqueo automático escalonado (15 min → 1 h → 24 h),
 *   guardado en `blocklist` (sobrevive a reinicios) y aplicado a TODAS las rutas.
 * - Revisión: queda auditado con alerta; el operador lo ve en el panel y puede quitarlo o
 *   volverlo permanente.
 * - Expiración: los bloqueos automáticos caducan solos; la limpieza borra los vencidos.
 *
 * Solo cuentan señales que un cliente legítimo casi nunca produce (sondeos de escáneres,
 * CSRF, ráfagas por encima del límite, enumeración de recursos, códigos MFA erróneos): las
 * IP compartidas (CGNAT de operadores móviles) hacen que bloquear por errores comunes sea más
 * dañino que útil. En memoria del proceso: válido para UNA instancia, como el rate limiting.
 */
export type StrikeKind = 'probe' | 'csrf' | 'rate_limited' | 'not_found' | 'mfa_failed';

export const STRIKE_WEIGHTS: Readonly<Record<StrikeKind, number>> = {
  probe: 10,
  csrf: 4,
  mfa_failed: 4,
  rate_limited: 2,
  not_found: 1,
};

export interface ShieldOptions {
  windowMs: number;
  threshold: number;
  /** Duración de cada bloqueo sucesivo de la misma huella; el último se repite. */
  blockStepsMs: readonly number[];
  /** Tope de huellas vigiladas: rotar IPs no puede agotar la memoria. */
  maxTracked: number;
  /** Cada cuánto se recargan los bloqueos de la base de datos (cambios del panel). */
  refreshMs: number;
}

export const DEFAULT_SHIELD_OPTIONS: ShieldOptions = {
  windowMs: 10 * 60_000,
  threshold: 20,
  blockStepsMs: [15 * 60_000, 60 * 60_000, 24 * 60 * 60_000],
  maxTracked: 50_000,
  refreshMs: 30_000,
};

interface Tracked {
  events: { at: number; weight: number; kind: StrikeKind }[];
  lastAt: number;
}

export interface StrikeResult {
  score: number;
  blockedUntil: Date | undefined;
}

/**
 * Rutas que solo pide un escáner de vulnerabilidades: esta tienda no tiene PHP, WordPress,
 * paneles de base de datos ni archivos ocultos publicados. Solo cuenta si la respuesta es 404.
 */
const PROBE_PATTERNS: readonly RegExp[] = [
  /\/\.(env|git|svn|hg|ht|aws|ssh|docker|vscode|idea|ds_store)/,
  /\/wp-(admin|login|content|includes|json)|\/wordpress\//,
  /\.(php\d?|aspx?|jsp|cgi|pl|cfm|bak|old|sql|tar|gz|zip|7z)(\/|$)/,
  /\/(phpmyadmin|pma|myadmin|adminer|xmlrpc|cgi-bin|boaform|hnap1|vendor\/phpunit)/,
  /\/(actuator|server-status|server-info|console|solr|jenkins|manager\/html)(\/|$)/,
  /\/etc\/(passwd|shadow)|\/proc\/self|win\.ini/,
  /(\.\.|%2e%2e|%252e)(\/|\\|%2f|%5c)/,
];

export function isProbePath(rawUrl: string): boolean {
  const path = (rawUrl.split('?')[0] ?? '').toLowerCase();
  return PROBE_PATTERNS.some((pattern) => pattern.test(path));
}

export class AbuseShield {
  private readonly tracked = new Map<string, Tracked>();
  private readonly offenses = new Map<string, number>();
  private readonly blocked = new Map<string, number>();
  private lastRefresh = 0;

  constructor(
    private readonly deps: Pick<ServiceDeps, 'now' | 'log'> & Partial<Pick<ServiceDeps, 'db'>>,
    private readonly options: ShieldOptions = DEFAULT_SHIELD_OPTIONS,
  ) {}

  /** ¿Está bloqueada esta huella ahora? Sin base de datos: solo memoria. */
  isBlocked(ipHash: string): boolean {
    const until = this.blocked.get(ipHash);
    if (until === undefined) return false;
    if (until > this.deps.now().getTime()) return true;
    this.blocked.delete(ipHash);
    return false;
  }

  /** Suma una señal; si se supera el umbral, bloquea (y lo persiste y audita). */
  async strike(
    ipHash: string,
    kind: StrikeKind,
    detail: { path?: string } = {},
  ): Promise<StrikeResult> {
    const now = this.deps.now().getTime();
    if (this.isBlocked(ipHash))
      return { score: 0, blockedUntil: new Date(this.blocked.get(ipHash) ?? now) };
    const entry = this.tracked.get(ipHash) ?? { events: [], lastAt: now };
    entry.events = entry.events.filter((e) => now - e.at < this.options.windowMs);
    entry.events.push({ at: now, weight: STRIKE_WEIGHTS[kind], kind });
    entry.lastAt = now;
    this.tracked.delete(ipHash);
    this.tracked.set(ipHash, entry); // reinsertar = más reciente al final (orden LRU)
    this.evictIfNeeded();

    const score = entry.events.reduce((total, e) => total + e.weight, 0);
    this.deps.log.warn(
      { security: kind, ip: ipHash.slice(0, 12), score, path: detail.path?.slice(0, 120) },
      'señal de abuso',
    );
    if (score < this.options.threshold) return { score, blockedUntil: undefined };

    const offense = (this.offenses.get(ipHash) ?? 0) + 1;
    this.offenses.set(ipHash, offense);
    const steps = this.options.blockStepsMs;
    const durationMs = steps[Math.min(offense, steps.length) - 1] ?? steps[steps.length - 1] ?? 0;
    const until = new Date(now + durationMs);
    this.blocked.set(ipHash, until.getTime());
    this.tracked.delete(ipHash);
    const summary = summarize(entry.events);
    this.deps.log.warn(
      {
        security: 'auto_block',
        ip: ipHash.slice(0, 12),
        offense,
        until: until.toISOString(),
        summary,
      },
      'bloqueo automático',
    );
    await this.persistBlock(ipHash, until, offense, summary);
    return { score, blockedUntil: until };
  }

  /** Recarga los bloqueos de IP vigentes (manuales y automáticos) desde la base de datos. */
  async refresh(force = false): Promise<void> {
    const db = this.deps.db;
    const now = this.deps.now();
    if (!db || (!force && now.getTime() - this.lastRefresh < this.options.refreshMs)) return;
    this.lastRefresh = now.getTime();
    const rows = await db
      .select({ value: blocklist.value, expiresAt: blocklist.expiresAt })
      .from(blocklist)
      .where(
        and(
          eq(blocklist.kind, 'ip_hash'),
          or(isNull(blocklist.expiresAt), gt(blocklist.expiresAt, now)),
        ),
      );
    this.blocked.clear();
    for (const row of rows) {
      this.blocked.set(
        row.value,
        row.expiresAt ? row.expiresAt.getTime() : Number.POSITIVE_INFINITY,
      );
    }
  }

  /** Para el panel y las pruebas. */
  stats(): { tracked: number; blocked: number } {
    return { tracked: this.tracked.size, blocked: this.blocked.size };
  }

  /** El Map conserva el orden de inserción y cada señal reinserta su huella: se descartan las
   * más antiguas hasta volver al tope. */
  private evictIfNeeded(): void {
    for (const key of this.tracked.keys()) {
      if (this.tracked.size <= this.options.maxTracked) break;
      this.tracked.delete(key);
    }
  }

  private async persistBlock(ipHash: string, until: Date, offense: number, summary: string) {
    const db = this.deps.db;
    if (!db) return;
    try {
      const reason = `auto: ${summary} (bloqueo nº ${offense})`;
      // Un bloqueo manual permanente (expires_at nulo) nunca se acorta.
      const [row] = await db
        .insert(blocklist)
        .values({ kind: 'ip_hash', value: ipHash, reason, expiresAt: until })
        .onConflictDoUpdate({
          target: [blocklist.kind, blocklist.value],
          set: { reason, expiresAt: until },
          setWhere: isNotNull(blocklist.expiresAt),
        })
        .returning({ id: blocklist.id });
      await audit(db, SYSTEM_ACTOR, {
        entityType: 'blocklist',
        // Sin fila: ya había un bloqueo manual permanente para esta huella.
        entityId: row?.id ?? `ip:${ipHash.slice(0, 16)}`,
        action: 'security.auto_block',
        data: { alert: true, offense, until: until.toISOString(), summary },
      });
    } catch (error) {
      // El bloqueo en memoria ya está activo: un fallo de la BD no lo deshace.
      this.deps.log.error({ err: error }, 'no se pudo guardar el bloqueo automático');
    }
  }
}

function summarize(events: readonly { kind: StrikeKind }[]): string {
  const counts = new Map<StrikeKind, number>();
  for (const e of events) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  return [...counts].map(([kind, n]) => `${kind}×${n}`).join(', ');
}

/** Limpieza: bloqueos caducados hace más de 30 días (los recientes quedan como historial). */
export async function purgeExpiredBlocks(deps: ServiceDeps): Promise<number> {
  const cutoff = new Date(deps.now().getTime() - 30 * 24 * 3_600_000);
  const removed = await deps.db
    .delete(blocklist)
    .where(and(isNotNull(blocklist.expiresAt), lt(blocklist.expiresAt, cutoff)))
    .returning({ id: blocklist.id });
  return removed.length;
}
