CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_kind_check" CHECK (kind in ('order_paid_owner', 'order_paid_customer', 'order_delivered_customer', 'order_refunded_customer')),
	CONSTRAINT "notifications_channel_check" CHECK (channel in ('email', 'telegram')),
	CONSTRAINT "notifications_status_check" CHECK (status in ('PENDING', 'SENT', 'FAILED')),
	CONSTRAINT "notifications_attempts_check" CHECK ("notifications"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_order_kind_channel_key" ON "notifications" USING btree ("order_id","kind","channel");--> statement-breakpoint
CREATE INDEX "notifications_pending_idx" ON "notifications" USING btree ("next_attempt_at") WHERE "notifications"."status" = 'PENDING';