-- Journal des echecs techniques (observabilite ADMIN+).
CREATE TABLE IF NOT EXISTS "error_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"family" text NOT NULL,
	"detail" text NOT NULL,
	"workspace_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "error_log" ADD CONSTRAINT "error_log_workspace_id_workspaces_id_fk"
 FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_log_at_idx" ON "error_log" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_log_family_idx" ON "error_log" USING btree ("family");
