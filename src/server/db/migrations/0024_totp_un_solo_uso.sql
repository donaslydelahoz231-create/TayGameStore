-- Código de la app autenticadora de un solo uso (auditoría A–P, hallazgo A-01; RFC 6238 §5.2).
-- - users.mfa_totp_last_step: último paso de 30 s aceptado. El panel rechaza ese código y los
--   anteriores, así un código visto o interceptado no se puede reutilizar dentro de su ventana.
-- Solo agrega una columna que admite nulos: no cambia ni borra datos existentes.
ALTER TABLE "users" ADD COLUMN "mfa_totp_last_step" bigint;
