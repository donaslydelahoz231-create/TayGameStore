CREATE TABLE "topups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"unit_index" integer NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"provider" text DEFAULT 'unipin' NOT NULL,
	"reference_no" text NOT NULL,
	"game_code" text NOT NULL,
	"denomination_id" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"provider_transaction" text,
	"error_code" text,
	"checks" integer DEFAULT 0 NOT NULL,
	"next_check_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topups_status_check" CHECK (status in ('PENDING', 'SENT', 'SUCCESS', 'FAILED', 'UNCERTAIN')),
	CONSTRAINT "topups_provider_check" CHECK (provider in ('unipin')),
	CONSTRAINT "topups_unit_check" CHECK ("topups"."unit_index" between 1 and 5 and "topups"."attempt" between 1 and 20),
	CONSTRAINT "topups_success_check" CHECK ("topups"."status" <> 'SUCCESS' or "topups"."provider_transaction" is not null)
);
--> statement-breakpoint
ALTER TABLE "fulfillments" DROP CONSTRAINT "fulfillments_claim_check";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_check";--> statement-breakpoint
ALTER TABLE "topups" ADD CONSTRAINT "topups_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topups" ADD CONSTRAINT "topups_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "topups_reference_key" ON "topups" USING btree ("provider","reference_no");--> statement-breakpoint
CREATE UNIQUE INDEX "topups_unit_attempt_key" ON "topups" USING btree ("order_item_id","unit_index","attempt");--> statement-breakpoint
CREATE INDEX "topups_order_idx" ON "topups" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "topups_check_idx" ON "topups" USING btree ("next_check_at") WHERE "topups"."status" in ('PENDING', 'SENT', 'UNCERTAIN');--> statement-breakpoint
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_claim_check" CHECK ("fulfillments"."status" not in ('CLAIMED', 'DELIVERING') or "fulfillments"."mode" = 'provider' or ("fulfillments"."claimed_by" is not null and "fulfillments"."claimed_at" is not null));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK (kind in ('order_paid_owner', 'order_paid_customer', 'order_delivered_customer', 'order_refunded_customer', 'order_paid_event', 'order_delivered_event', 'order_refunded_event', 'order_verification_event', 'topup_problem_owner'));