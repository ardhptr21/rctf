CREATE TABLE "instance_sessions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "instance_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"instance_id" text NOT NULL,
	"session_key" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"open" boolean NOT NULL,
	"client_ip" text NOT NULL,
	"host" text NOT NULL,
	"bytes_in" bigint NOT NULL,
	"bytes_out" bigint NOT NULL,
	"truncated" boolean NOT NULL,
	"error" text,
	"transcript" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instance_history" ADD COLUMN "session_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "instance_history" ADD COLUMN "last_session_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "instance_sessions" ADD CONSTRAINT "instance_sessions_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "public"."instance_history"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "instance_sessions_instance_started_index" ON "instance_sessions" USING btree ("instance_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "instance_sessions_instance_key_index" ON "instance_sessions" USING btree ("instance_id","session_key");