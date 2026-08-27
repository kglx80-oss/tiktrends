-- Rattrapage d'instantane drizzle : ces objets ont deja ete crees par les migrations
-- 0021 a 0030 (ecrites a la main, sans instantane). Cette migration realigne
-- meta/0031_snapshot.json pour que les prochaines generations soient correctes.
-- Toutes les instructions sont idempotentes : sans effet sur une base existante.

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
CREATE TABLE IF NOT EXISTS "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "password_resets_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stripe_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "logos" text[];--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "meta_ad_accounts_json" jsonb;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "drive_refresh_token_enc" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "drive_folder_id" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "drive_folder_name" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "drive_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "followed_brands" ADD COLUMN IF NOT EXISTS "seen_ad_ids" jsonb;--> statement-breakpoint
ALTER TABLE "followed_brands" ADD COLUMN IF NOT EXISTS "last_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "saved_ads" ADD COLUMN IF NOT EXISTS "folder" text;--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN IF NOT EXISTS "image_url" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "onboarding_json" jsonb;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "onboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "subscription_status" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "last_plan_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brand_tracker_events" ADD CONSTRAINT "brand_tracker_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brand_tracker_events" ADD CONSTRAINT "brand_tracker_events_followed_brand_id_followed_brands_id_fk" FOREIGN KEY ("followed_brand_id") REFERENCES "public"."followed_brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tracker_ws_idx" ON "brand_tracker_events" USING btree ("workspace_id","created_at");