CREATE TABLE "challenge_downloads" (
	"team_id" text NOT NULL,
	"challenge_id" text NOT NULL,
	"file_url" text NOT NULL,
	"downloaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_downloads_pkey" PRIMARY KEY("team_id","challenge_id","file_url")
);
