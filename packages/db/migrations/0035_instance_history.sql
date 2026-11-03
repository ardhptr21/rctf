CREATE TABLE "instance_history" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"player_id" text,
	"challenge_id" text NOT NULL,
	"ip" text NOT NULL,
	"endpoints" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"extend_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "instance_history_team_challenge_index" ON "instance_history" USING btree ("team_id","challenge_id","ended_at");--> statement-breakpoint
CREATE INDEX "instance_history_started_at_index" ON "instance_history" USING btree ("started_at" DESC NULLS LAST);