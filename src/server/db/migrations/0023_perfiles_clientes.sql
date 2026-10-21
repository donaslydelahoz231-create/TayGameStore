-- Nombres de usuario de los clientes (pedido del dueño, 2026-10-21).
-- - customer_profiles: un alias por cliente, invitado (cookie del navegador, guardada como hash)
--   o con cuenta (Google/Facebook). Nace al azar y el cliente lo puede cambiar; único sin
--   distinguir mayúsculas. Es un alias público: nunca el nombre real ni el correo.
-- - sheet_version / sheet_synced_version: la fila del cliente en la pestaña «Usuarios» de la hoja
--   de Google está por escribir mientras la primera sea mayor.
-- Solo agrega una tabla: no cambia ni borra datos existentes.
CREATE TABLE "customer_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"user_id" uuid,
	"guest_hash" text,
	"handle" text NOT NULL,
	"handle_key" text NOT NULL,
	"renames" integer DEFAULT 0 NOT NULL,
	"renamed_at" timestamp with time zone,
	"created_ip_hash" text,
	"sheet_version" integer DEFAULT 1 NOT NULL,
	"sheet_synced_version" integer DEFAULT 0 NOT NULL,
	"sheet_attempts" integer DEFAULT 0 NOT NULL,
	"sheet_next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sheet_lease_until" timestamp with time zone,
	"sheet_last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_profiles_kind_check" CHECK (kind in ('guest', 'account')),
	CONSTRAINT "customer_profiles_owner_check" CHECK (("customer_profiles"."kind" = 'account' and "customer_profiles"."user_id" is not null and "customer_profiles"."guest_hash" is null) or ("customer_profiles"."kind" = 'guest' and "customer_profiles"."guest_hash" is not null and "customer_profiles"."user_id" is null)),
	CONSTRAINT "customer_profiles_handle_check" CHECK ("customer_profiles"."handle" ~ '^[A-Za-z][A-Za-z0-9_]{2,19}$' and "customer_profiles"."handle_key" = lower("customer_profiles"."handle")),
	CONSTRAINT "customer_profiles_code_check" CHECK ("customer_profiles"."code" ~ '^U-[0-9A-Z]{8}$'),
	CONSTRAINT "customer_profiles_counters_check" CHECK ("customer_profiles"."renames" >= 0 and "customer_profiles"."sheet_attempts" >= 0 and "customer_profiles"."sheet_synced_version" >= 0 and "customer_profiles"."sheet_synced_version" <= "customer_profiles"."sheet_version")
);
--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_profiles_code_key" ON "customer_profiles" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_profiles_handle_key" ON "customer_profiles" USING btree ("handle_key");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_profiles_user_key" ON "customer_profiles" USING btree ("user_id") WHERE "customer_profiles"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_profiles_guest_key" ON "customer_profiles" USING btree ("guest_hash") WHERE "customer_profiles"."guest_hash" is not null;--> statement-breakpoint
CREATE INDEX "customer_profiles_guest_ip_idx" ON "customer_profiles" USING btree ("created_ip_hash","created_at") WHERE "customer_profiles"."created_ip_hash" is not null;--> statement-breakpoint
CREATE INDEX "customer_profiles_sheet_due_idx" ON "customer_profiles" USING btree ("sheet_next_attempt_at") WHERE "customer_profiles"."sheet_synced_version" < "customer_profiles"."sheet_version";