CREATE TABLE "instance_requests" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "instance_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"instance_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"client_ip" text NOT NULL,
	"method" text NOT NULL,
	"host" text NOT NULL,
	"path" text NOT NULL,
	"status" integer NOT NULL,
	"bytes" bigint NOT NULL,
	"duration_ms" integer NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
ALTER TABLE "instance_history" ADD COLUMN "request_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "instance_history" ADD COLUMN "first_request_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "instance_history" ADD COLUMN "last_request_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "instance_requests" ADD CONSTRAINT "instance_requests_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "public"."instance_history"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "instance_requests_instance_at_index" ON "instance_requests" USING btree ("instance_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "instance_history_endpoints_index" ON "instance_history" USING gin ("endpoints");