CREATE TABLE "blocklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocklist_kind_check" CHECK (kind in ('email', 'uid', 'ip_hash', 'google_sub'))
);
--> statement-breakpoint
CREATE TABLE "fulfillments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"mode" text DEFAULT 'manual' NOT NULL,
	"status" text NOT NULL,
	"claimed_by" uuid,
	"claimed_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"delivered_by" uuid,
	"evidence" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fulfillments_status_check" CHECK (status in ('READY_FOR_FULFILLMENT', 'CLAIMED', 'DELIVERING', 'DELIVERED', 'FAILED', 'CANCELLED')),
	CONSTRAINT "fulfillments_mode_check" CHECK (mode in ('manual', 'provider')),
	CONSTRAINT "fulfillments_claim_check" CHECK ("fulfillments"."status" not in ('CLAIMED', 'DELIVERING') or ("fulfillments"."claimed_by" is not null and "fulfillments"."claimed_at" is not null)),
	CONSTRAINT "fulfillments_delivered_check" CHECK ("fulfillments"."status" <> 'DELIVERED' or ("fulfillments"."evidence" is not null and "fulfillments"."delivered_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "mfa_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"code_verifier" text NOT NULL,
	"nonce" text NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_states_purpose_check" CHECK (purpose in ('customer', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"units" integer NOT NULL,
	"list_price_cop" bigint NOT NULL,
	"unit_price_cop" bigint NOT NULL,
	"quantity" integer NOT NULL,
	"line_total_cop" bigint NOT NULL,
	CONSTRAINT "order_items_quantity_check" CHECK ("order_items"."quantity" between 1 and 5),
	CONSTRAINT "order_items_price_check" CHECK ("order_items"."unit_price_cop" > 0 and "order_items"."unit_price_cop" <= "order_items"."list_price_cop"),
	CONSTRAINT "order_items_line_check" CHECK ("order_items"."line_total_cop" = "order_items"."unit_price_cop" * "order_items"."quantity")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_ref" text NOT NULL,
	"checkout_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text NOT NULL,
	"game" text NOT NULL,
	"player_uid" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"user_id" uuid,
	"guest_hash" text,
	"access_token_hash" text NOT NULL,
	"access_token_key_version" integer NOT NULL,
	"subtotal_cop" bigint NOT NULL,
	"discount_cop" bigint NOT NULL,
	"total_cop" bigint NOT NULL,
	"currency" text DEFAULT 'COP' NOT NULL,
	"terms_version" text NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"verification_status" text NOT NULL,
	"verified_nickname" text,
	"verified_region" text,
	"verification_note" text,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"receipt_code" text NOT NULL,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_status_check" CHECK (status in ('AWAITING_VERIFICATION', 'REJECTED', 'AWAITING_PAYMENT', 'PAID', 'DELIVERING', 'DELIVERED', 'NEEDS_REVIEW', 'EXPIRED', 'REFUNDED')),
	CONSTRAINT "orders_verification_status_check" CHECK (verification_status in ('PENDING', 'VERIFIED', 'NOT_FOUND', 'AMBIGUOUS', 'BLOCKED_ACCOUNT', 'CONFIRMED', 'DECLINED_BY_CUSTOMER')),
	CONSTRAINT "orders_game_check" CHECK (game in ('freefire')),
	CONSTRAINT "orders_uid_check" CHECK ("orders"."player_uid" ~ '^[0-9]{6,12}$'),
	CONSTRAINT "orders_currency_check" CHECK ("orders"."currency" = 'COP'),
	CONSTRAINT "orders_totals_check" CHECK ("orders"."subtotal_cop" > 0 and "orders"."discount_cop" >= 0 and "orders"."total_cop" = "orders"."subtotal_cop" - "orders"."discount_cop" and "orders"."total_cop" > 0 and "orders"."total_cop" <= 1000000),
	CONSTRAINT "orders_payment_requires_confirmation_check" CHECK ("orders"."status" not in ('AWAITING_PAYMENT', 'PAID', 'DELIVERING', 'DELIVERED') or "orders"."confirmed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text DEFAULT 'mercadopago' NOT NULL,
	"status" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"preference_id" text,
	"checkout_url" text,
	"amount_cop" bigint NOT NULL,
	"currency" text DEFAULT 'COP' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_attempts_status_check" CHECK (status in ('CREATING', 'OPEN', 'CLOSED', 'EXPIRED', 'FAILED')),
	CONSTRAINT "payment_attempts_amount_check" CHECK ("payment_attempts"."amount_cop" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"provider" text DEFAULT 'mercadopago' NOT NULL,
	"dedupe_key" text NOT NULL,
	"request_id" text,
	"topic" text NOT NULL,
	"resource_id" text NOT NULL,
	"status" text DEFAULT 'RECEIVED' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "payment_events_status_check" CHECK (status in ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"attempt_id" uuid,
	"provider" text DEFAULT 'mercadopago' NOT NULL,
	"provider_payment_id" text NOT NULL,
	"status" text NOT NULL,
	"provider_status" text NOT NULL,
	"provider_status_detail" text,
	"amount_cop" bigint NOT NULL,
	"currency" text NOT NULL,
	"amount_matches" boolean NOT NULL,
	"is_order_payment" boolean DEFAULT false NOT NULL,
	"approved_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_status_check" CHECK (status in ('PENDING', 'APPROVED', 'DECLINED', 'REFUNDED', 'DISPUTED', 'NEEDS_REFUND', 'UNKNOWN'))
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"game" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"tag" text DEFAULT '' NOT NULL,
	"units" integer NOT NULL,
	"price_cop" bigint NOT NULL,
	"promo_price_cop" bigint,
	"promo_ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_game_check" CHECK (game in ('freefire')),
	CONSTRAINT "products_units_check" CHECK ("products"."units" > 0),
	CONSTRAINT "products_price_check" CHECK ("products"."price_cop" > 0 and "products"."price_cop" <= 1000000),
	CONSTRAINT "products_promo_check" CHECK ("products"."promo_price_cop" is null or ("products"."promo_price_cop" > 0 and "products"."promo_price_cop" < "products"."price_cop"))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"mfa_verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_sub" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"name" text,
	"role" text DEFAULT 'customer' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"mfa_secret_enc" text,
	"mfa_enabled_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_check" CHECK (role in ('customer', 'admin')),
	CONSTRAINT "users_status_check" CHECK (status in ('active', 'disabled'))
);
--> statement-breakpoint
ALTER TABLE "blocklist" ADD CONSTRAINT "blocklist_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_claimed_by_users_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_delivered_by_users_id_fk" FOREIGN KEY ("delivered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blocklist_kind_value_key" ON "blocklist" USING btree ("kind","value");--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillments_order_key" ON "fulfillments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "fulfillments_status_idx" ON "fulfillments" USING btree ("status","claimed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mfa_recovery_codes_user_code_key" ON "mfa_recovery_codes" USING btree ("user_id","code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_product_key" ON "order_items" USING btree ("order_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_public_ref_key" ON "orders" USING btree ("public_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_checkout_key_key" ON "orders" USING btree ("checkout_key");--> statement-breakpoint
CREATE INDEX "orders_status_expires_idx" ON "orders" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_guest_idx" ON "orders" USING btree ("guest_hash","created_at");--> statement-breakpoint
CREATE INDEX "orders_email_idx" ON "orders" USING btree ("customer_email","status");--> statement-breakpoint
CREATE INDEX "orders_uid_idx" ON "orders" USING btree ("player_uid","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_idempotency_key" ON "payment_attempts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_preference_key" ON "payment_attempts" USING btree ("provider","preference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_one_open_per_order" ON "payment_attempts" USING btree ("order_id") WHERE "payment_attempts"."status" in ('CREATING', 'OPEN');--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_dedupe_key" ON "payment_events" USING btree ("provider","dedupe_key");--> statement-breakpoint
CREATE INDEX "payment_events_status_idx" ON "payment_events" USING btree ("status","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_payment_key" ON "payments" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_order_payment" ON "payments" USING btree ("order_id") WHERE "payments"."is_order_payment";--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_key" ON "products" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "products_game_idx" ON "products" USING btree ("game","active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_sub_key" ON "users" USING btree ("google_sub");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");