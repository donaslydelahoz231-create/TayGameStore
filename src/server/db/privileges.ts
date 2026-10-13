import type pg from 'pg';

/**
 * Privilegios mínimos de la aplicación en PostgreSQL (hallazgo H-01, docs/seguridad/).
 *
 * La aplicación no debe conectarse como dueña de las tablas: el dueño puede desactivar los
 * triggers que impiden borrar pedidos o alterar montos. `tgs_app_rw` es un rol de grupo sin
 * login con lo justo para funcionar; el rol con login de la aplicación se hace miembro de él
 * (docs/base-datos-rol-minimo.md). Las migraciones siguen corriendo con el rol dueño.
 */
export const APP_GROUP_ROLE = 'tgs_app_rw';

/** Tablas que la aplicación depura en tiempo de ejecución (sesiones, retos, búsquedas…). */
export const APP_DELETABLE_TABLES = [
  'sessions',
  'oauth_states',
  'webauthn_challenges',
  'mfa_recovery_codes',
  'player_lookups',
  'blocklist',
] as const;

/** Historial de solo agregar: la aplicación lee e inserta, nunca modifica. */
export const APP_APPEND_ONLY_TABLES = ['audit_events', 'audit_seals'] as const;

type Queryable = Pick<pg.Pool | pg.Client, 'query'>;

/** Crea el rol de grupo si no existe. Requiere un rol con CREATEROLE (el dueño en Neon). */
export async function createAppGroupRole(client: Queryable): Promise<void> {
  await client.query(`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_GROUP_ROLE}') THEN
    CREATE ROLE ${APP_GROUP_ROLE} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;`);
}

/**
 * Concede (o vuelve a conceder) los privilegios mínimos a `tgs_app_rw`. Es idempotente y se
 * ejecuta tras cada migración. Sin el rol de grupo no hace nada y devuelve `false`: así una
 * base que todavía no lo adoptó queda igual que antes.
 */
export async function grantAppPrivileges(client: Queryable): Promise<boolean> {
  const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [APP_GROUP_ROLE]);
  if (exists.rowCount === 0) return false;
  const role = APP_GROUP_ROLE;
  await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await client.query(`GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO ${role}`);
  await client.query(`REVOKE UPDATE ON ${APP_APPEND_ONLY_TABLES.join(', ')} FROM ${role}`);
  await client.query(`REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM ${role}`);
  await client.query(`GRANT DELETE ON ${APP_DELETABLE_TABLES.join(', ')} TO ${role}`);
  await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  // Tablas y secuencias que creen migraciones futuras (las crea el rol dueño que migra).
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO ${role}`,
  );
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${role}`,
  );
  return true;
}
