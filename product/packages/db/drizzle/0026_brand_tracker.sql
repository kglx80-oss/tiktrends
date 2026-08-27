ALTER TABLE "followed_brands" ADD COLUMN IF NOT EXISTS "seen_ad_ids" jsonb;--> statement-breakpoint
ALTER TABLE "followed_brands" ADD COLUMN IF NOT EXISTS "last_checked_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brand_tracker_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"followed_brand_id" uuid,
	"platform" text NOT NULL,
	"advertiser_name" text NOT NULL,
	"kind" text DEFAULT 'new' NOT NULL,
	"snapshot_json" jsonb NOT NULL,
	"seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brand_tracker_events" ADD CONSTRAINT "brand_tracker_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brand_tracker_events" ADD CONSTRAINT "brand_tracker_events_followed_brand_id_followed_brands_id_fk" FOREIGN KEY ("followed_brand_id") REFERENCES "public"."followed_brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tracker_ws_idx" ON "brand_tracker_events" ("workspace_id","created_at");
