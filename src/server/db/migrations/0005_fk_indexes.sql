CREATE INDEX "blocklist_created_by_idx" ON "blocklist" USING btree ("created_by") WHERE "blocklist"."created_by" is not null;--> statement-breakpoint
CREATE INDEX "fulfillments_claimed_by_idx" ON "fulfillments" USING btree ("claimed_by") WHERE "fulfillments"."claimed_by" is not null;--> statement-breakpoint
CREATE INDEX "fulfillments_delivered_by_idx" ON "fulfillments" USING btree ("delivered_by") WHERE "fulfillments"."delivered_by" is not null;--> statement-breakpoint
CREATE INDEX "oauth_states_link_user_idx" ON "oauth_states" USING btree ("link_user_id") WHERE "oauth_states"."link_user_id" is not null;--> statement-breakpoint
CREATE INDEX "order_items_product_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "orders_verified_by_idx" ON "orders" USING btree ("verified_by") WHERE "orders"."verified_by" is not null;--> statement-breakpoint
CREATE INDEX "payments_attempt_idx" ON "payments" USING btree ("attempt_id") WHERE "payments"."attempt_id" is not null;