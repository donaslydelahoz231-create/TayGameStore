CREATE TABLE "inventory_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"code_enc" text NOT NULL,
	"code_hash" text NOT NULL,
	"status" text DEFAULT 'AVAILABLE' NOT NULL,
	"order_id" uuid,
	"cost_cop" bigint,
	"source" text,
	"created_by" uuid,
	"assigned_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_codes_status_check" CHECK (status in ('AVAILABLE', 'ASSIGNED', 'USED', 'VOID')),
	CONSTRAINT "inventory_codes_cost_check" CHECK ("inventory_codes"."cost_cop" is null or "inventory_codes"."cost_cop" > 0),
	CONSTRAINT "inventory_codes_order_check" CHECK (("inventory_codes"."status" in ('ASSIGNED', 'USED')) = ("inventory_codes"."order_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "inventory_codes" ADD CONSTRAINT "inventory_codes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_codes" ADD CONSTRAINT "inventory_codes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_codes" ADD CONSTRAINT "inventory_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_codes_hash_key" ON "inventory_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "inventory_codes_stock_idx" ON "inventory_codes" USING btree ("product_id","status","created_at");--> statement-breakpoint
CREATE INDEX "inventory_codes_order_idx" ON "inventory_codes" USING btree ("order_id") WHERE "inventory_codes"."order_id" is not null;--> statement-breakpoint
CREATE INDEX "inventory_codes_created_by_idx" ON "inventory_codes" USING btree ("created_by") WHERE "inventory_codes"."created_by" is not null;