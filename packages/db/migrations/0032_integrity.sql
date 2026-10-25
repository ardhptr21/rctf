CREATE TABLE "integrity_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"other_team_id" text,
	"pair_key" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"signal_count" integer DEFAULT 0 NOT NULL,
	"last_signal_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integrity_cases_pair_key_unique" UNIQUE("pair_key")
);
--> statement-breakpoint
CREATE TABLE "integrity_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"kind" text NOT NULL,
	"severity" text NOT NULL,
	"team_id" text NOT NULL,
	"other_team_id" text,
	"challenge_id" text,
	"evidence" jsonb NOT NULL,
	"dedup_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integrity_signals_dedup_key_unique" UNIQUE("dedup_key")
);
--> statement-breakpoint
ALTER TABLE "integrity_signals" ADD CONSTRAINT "integrity_signals_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."integrity_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "integrity_cases_status_score_index" ON "integrity_cases" USING btree ("status","score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "integrity_signals_case_created_at_index" ON "integrity_signals" USING btree ("case_id","created_at" DESC NULLS LAST);