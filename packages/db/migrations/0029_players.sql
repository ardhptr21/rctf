CREATE TABLE "players" (
	"id" text PRIMARY KEY NOT NULL,
	"discord_id" text NOT NULL,
	"discord_username" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"team_id" text,
	"is_captain" boolean DEFAULT false NOT NULL,
	"joined_team_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_discord_id_key" UNIQUE("discord_id")
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "require_email_or_ctftime_id";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "join_token" text;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "players_team_id_index" ON "players" USING btree ("team_id" text_ops);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_join_token_key" UNIQUE("join_token");