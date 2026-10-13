# Rol de base de datos con privilegios mínimos (H-01)

Hoy la tienda se conecta a Neon como `neondb_owner`, que es el dueño de las tablas y puede
desactivar los triggers que impiden borrar pedidos o alterar montos. Con este cambio, la
aplicación usa un rol sin propiedad, `tgs_app`, y el dueño queda solo para las migraciones.

**Estado:** código listo y probado. En producción **no se ha cambiado nada**: el rol no existe y
el código no hace nada hasta que el dueño siga estos pasos. Requiere su autorización porque
cambia un secreto (`DATABASE_URL`) y los privilegios de la base.

## Qué puede y qué no puede el rol de la aplicación

| Acción | `tgs_app` |
|---|---|
| Leer, crear y actualizar pedidos, pagos, productos, usuarios | Sí |
| Agregar eventos al historial y sellos | Sí (solo agregar) |
| Depurar sesiones, estados OAuth, retos WebAuthn, códigos MFA, búsquedas de jugador, bloqueos | Sí |
| Borrar o vaciar pedidos, pagos, productos o el historial | No |
| Editar el historial o los sellos | No |
| Desactivar triggers, borrar o crear tablas | No (no es dueño) |

Lista exacta en `src/server/db/privileges.ts`. Se vuelve a aplicar sola tras cada migración,
solo si el rol de grupo `tgs_app_rw` existe.

## Evidencia (13-oct-2026)

- **Local (PostgreSQL 16):** las 210 pruebas de integración pasan con la app conectada como rol
  mínimo. La CI hace lo mismo desde ahora (`TEST_APP_DATABASE_URL` en `ci.yml`).
- **Rama de prueba de Neon (PostgreSQL 18, copia de producción):** con `tgs_app_rw`:
  - lee 1 pedido y 24 eventos, y tiene `UPDATE` en pedidos y `DELETE` en sesiones;
  - `ALTER TABLE orders DISABLE TRIGGER ALL` falla con «must be owner of table orders»;
  - `UPDATE audit_events` falla con «permission denied»;
  - no tiene `DELETE` en pedidos, `TRUNCATE` en pagos ni `CREATE` en el esquema.
- **Producción:** el rol `tgs_app_rw` no existe (comprobado en solo lectura), así que el cambio
  de código es inerte.

## Pasos para el dueño (con autorización; unos 15 minutos)

Antes de empezar, el respaldo `respaldo-2026-10-13` (rama de Neon) ya existe.

1. **Desplegar primero este código** (el commit que agrega `MIGRATION_DATABASE_URL`).
2. **Crear los roles en Neon.** Ve a Neon → SQL Editor, rama `production`, base `neondb`, y
   ejecuta:

   ```sql
   CREATE ROLE tgs_app_rw NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
   CREATE ROLE tgs_app LOGIN IN ROLE tgs_app_rw PASSWORD 'CLAVE_NUEVA';
   ```

   `CLAVE_NUEVA`:
   - Genérala tú: 32 o más letras y números, sin símbolos, para no tener que codificarla en la
     URL.
   - Neon exige claves fuertes para roles creados con SQL.
   - No la pegues en ningún chat.

   Los permisos de `tgs_app_rw` los concede el siguiente despliegue.
3. **Cambiar las variables en Render** (Environment):
   - Crea `MIGRATION_DATABASE_URL` con el **valor actual** de `DATABASE_URL` (el dueño).
   - Cambia `DATABASE_URL` por la misma URL, con usuario `tgs_app` y la clave nueva. El host, la
     base y `?sslmode=require` no cambian.
4. **Redesplegar.** La compilación migra con `MIGRATION_DATABASE_URL` y aplica los permisos; la
   tienda arranca con `tgs_app`.
5. **Verificar:**
   - `/api/ready` responde bien y «Production smoke check» está en verde.
   - En Neon, `SELECT usename, count(*) FROM pg_stat_activity WHERE datname = 'neondb' GROUP BY 1`
     muestra `tgs_app` como rol de la tienda.
   - Una compra de prueba del flujo normal funciona.

**Si algo falla:**

- En Render, vuelve a poner en `DATABASE_URL` el valor de `MIGRATION_DATABASE_URL` y redespliega.
- Los roles creados no estorban y pueden quedarse.

## Riesgo residual y siguiente paso

- **Qué protege:** consultas de la app (por ejemplo, una inyección SQL) o un error de código ya
  no pueden quitar las protecciones de la base.
- **Qué no protege:** `MIGRATION_DATABASE_URL` sigue en las variables de Render, que el proceso
  puede leer. Quien ejecute código en el servidor podría usarla.
- **Fase 2 (opcional):**
  - migrar desde GitHub Actions, con la URL del dueño como secreto de GitHub;
  - dejar en Render solo la URL de `tgs_app`.

  Requiere otro cambio de flujo y autorización.
