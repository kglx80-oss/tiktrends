ALTER TABLE "brands" ADD COLUMN "shopify_token_enc" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "meta_token_enc" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "meta_ad_account_id" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "commerce_insights_json" jsonb;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "ads_insights_json" jsonb;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "insights_synced_at" timestamp with time zone;