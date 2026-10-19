-- Quita el canal "telegram" de la cola de avisos: el dueño decidió no usar Telegram (2026-10-18).
-- No cambia datos: en producción la tabla notifications no tenía filas de ese canal (consultado
-- antes de publicar). Si quedara alguna, el ADD CONSTRAINT fallaría y el despliegue se detendría.
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_channel_check";--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_channel_check" CHECK (channel in ('email', 'webhook', 'sheets'));