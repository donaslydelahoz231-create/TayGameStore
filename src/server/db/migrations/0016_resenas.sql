CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"game" text NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"author_name" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"moderated_by" uuid,
	"moderated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_status_check" CHECK (status in ('PENDING', 'PUBLISHED', 'HIDDEN')),
	CONSTRAINT "reviews_game_check" CHECK (game in ('freefire')),
	CONSTRAINT "reviews_rating_check" CHECK ("reviews"."rating" between 1 and 5),
	CONSTRAINT "reviews_comment_check" CHECK ("reviews"."comment" is null or char_length("reviews"."comment") between 1 and 400),
	CONSTRAINT "reviews_author_check" CHECK (char_length("reviews"."author_name") between 1 and 40)
);
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_order_key" ON "reviews" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "reviews_status_idx" ON "reviews" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reviews_moderated_by_idx" ON "reviews" USING btree ("moderated_by") WHERE "reviews"."moderated_by" is not null;--> statement-breakpoint
-- Las reseñas no se borran: el dueño solo puede publicarlas u ocultarlas.
CREATE TRIGGER reviews_no_delete BEFORE DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION tgs_forbid_delete();
--> statement-breakpoint
CREATE TRIGGER reviews_no_truncate BEFORE TRUNCATE ON reviews
  FOR EACH STATEMENT EXECUTE FUNCTION tgs_forbid_delete();
--> statement-breakpoint
-- Lo que escribió el cliente (pedido, estrellas, comentario, nombre y fecha) no se puede editar:
-- nadie puede mejorar una reseña. Solo cambian el estado y los datos de moderación.
CREATE OR REPLACE FUNCTION reviews_protect_content() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.game IS DISTINCT FROM OLD.game
     OR NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.comment IS DISTINCT FROM OLD.comment
     OR NEW.author_name IS DISTINCT FROM OLD.author_name
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'TayGameStore: el contenido de una reseña no se puede cambiar';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER reviews_protect_content BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION reviews_protect_content();
