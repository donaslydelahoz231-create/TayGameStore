CREATE TABLE "user_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_identities_provider_check" CHECK (provider in ('discord', 'facebook'))
);
--> statement-breakpoint
ALTER TABLE "blocklist" DROP CONSTRAINT "blocklist_kind_check";--> statement-breakpoint
ALTER TABLE "oauth_states" DROP CONSTRAINT "oauth_states_purpose_check";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "google_sub" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD COLUMN "provider" text DEFAULT 'google' NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD COLUMN "link_user_id" uuid;--> statement-breakpoint
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_identities_provider_subject_key" ON "user_identities" USING btree ("provider","subject");--> statement-breakpoint
CREATE UNIQUE INDEX "user_identities_user_provider_key" ON "user_identities" USING btree ("user_id","provider");--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_link_user_id_users_id_fk" FOREIGN KEY ("link_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocklist" ADD CONSTRAINT "blocklist_kind_check" CHECK (kind in ('email', 'uid', 'ip_hash', 'google_sub', 'discord_id', 'facebook_id'));--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_provider_check" CHECK (provider in ('google', 'discord', 'facebook'));--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_purpose_check" CHECK (purpose in ('customer', 'admin', 'link'));