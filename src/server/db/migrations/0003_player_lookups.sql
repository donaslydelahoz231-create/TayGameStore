CREATE TABLE "player_lookups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_key" text NOT NULL,
	"game" text NOT NULL,
	"player_uid" text NOT NULL,
	"provider" text NOT NULL,
	"nickname" text NOT NULL,
	"region" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_lookups_game_check" CHECK (game in ('freefire')),
	CONSTRAINT "player_lookups_uid_check" CHECK ("player_lookups"."player_uid" ~ '^[0-9]{6,12}$')
);
--> statement-breakpoint
CREATE INDEX "player_lookups_owner_idx" ON "player_lookups" USING btree ("owner_key","created_at");--> statement-breakpoint
CREATE INDEX "player_lookups_expires_idx" ON "player_lookups" USING btree ("expires_at");